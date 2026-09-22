begin;

-- Opt-in activation: historical pending_setup jobs are never sent automatically.
alter table public.events add column registration_email_enabled boolean not null default false;
alter table public.email_deliveries
  add column lease_token uuid,
  add column lease_until timestamptz,
  add column first_attempt_at timestamptz,
  add column next_attempt_at timestamptz not null default now(),
  add column request_payload jsonb;

create function public.queue_registration_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'registration' and exists (
    select 1 from public.passes p join public.events e on e.id = p.event_id
    where p.id = new.pass_id and e.registration_email_enabled
  ) then new.status := 'queued'; end if;
  return new;
end;
$$;
create trigger queue_registration_email before insert on public.email_deliveries
for each row execute function public.queue_registration_email();
revoke all on function public.queue_registration_email() from public;

create function public.claim_registration_email() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_job public.email_deliveries%rowtype; v_result jsonb;
begin
  -- Resend retains idempotency keys for 24h. Stop ambiguous retries before expiry.
  update public.email_deliveries set status='failed',last_error='REVIEW_REQUIRED',updated_at=now(),lease_token=null,lease_until=null
  where kind='registration' and status in ('queued','sending')
    and (lease_until is null or lease_until < now())
    and (first_attempt_at < now()-interval '23 hours' or attempts >= 8);
  select d.* into v_job from public.email_deliveries d
    join public.passes p on p.id=d.pass_id join public.events e on e.id=p.event_id
    where d.kind='registration' and d.status in ('queued','sending') and d.next_attempt_at <= now()
      and (d.lease_until is null or d.lease_until < now())
      and e.registration_email_enabled and p.status='active'
    order by d.created_at,d.id for update of d skip locked limit 1;
  if not found then return null; end if;
  update public.email_deliveries set status='sending',attempts=attempts+1,
    first_attempt_at=coalesce(first_attempt_at,now()),lease_token=gen_random_uuid(),
    lease_until=now()+interval '3 minutes',updated_at=now()
    where id=v_job.id returning * into v_job;
  select jsonb_build_object('id',v_job.id,'lease',v_job.lease_token,'payload',v_job.request_payload,
    'email',r.email,'name',concat_ws(' ',r.first_name,nullif(r.last_name,''),nullif(r.second_last_name,'')),
    'qrToken',p.qr_token,'slug',e.slug,'eventName',e.name,'startsAt',e.starts_at,'venue',e.venue,'isTest',e.is_test)
  into v_result from public.passes p join public.registrations r on r.id=p.registration_id
    join public.events e on e.id=p.event_id where p.id=v_job.pass_id;
  return v_result;
end;
$$;

-- Persist the exact provider payload before sending, so all retries are identical.
create function public.prepare_registration_email(p_id uuid,p_lease uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_payload jsonb;
begin
  update public.email_deliveries set request_payload=coalesce(request_payload,p_payload)
    where id=p_id and lease_token=p_lease and status='sending' and lease_until > now()
    returning request_payload into v_payload;
  if not found then raise exception 'LEASE_EXPIRED'; end if;
  return v_payload;
end;
$$;

create function public.finish_registration_email(p_id uuid,p_lease uuid,p_provider_id text,p_retry boolean,p_error text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.email_deliveries set
    status=case when p_provider_id is not null then 'sent' when p_retry and attempts < 8 then 'queued' else 'failed' end,
    provider_message_id=p_provider_id,last_error=left(p_error,100),
    next_attempt_at=now()+make_interval(secs => least(3600,60*power(2,attempts)::integer)),
    lease_token=null,lease_until=null,updated_at=now()
    where id=p_id and lease_token=p_lease and status='sending';
  return found;
end;
$$;
revoke all on function public.claim_registration_email(),public.prepare_registration_email(uuid,uuid,jsonb),
  public.finish_registration_email(uuid,uuid,text,boolean,text) from public,anon,authenticated;
grant execute on function public.claim_registration_email(),public.prepare_registration_email(uuid,uuid,jsonb),
  public.finish_registration_email(uuid,uuid,text,boolean,text) to service_role;
create index email_deliveries_queue on public.email_deliveries(next_attempt_at) where status in ('queued','sending');
notify pgrst, 'reload schema';
commit;
