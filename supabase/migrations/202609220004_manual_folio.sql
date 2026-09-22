begin;
-- Staff-only lookup; searching does not register attendance.
create function public.lookup_pass_by_folio(p_event_slug text,p_folio text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_event uuid; v_folio text; v_count integer; v_result jsonb;
begin
  select id into v_event from public.events where slug=p_event_slug;
  if not exists(select 1 from public.event_staff where event_id=v_event and user_id=auth.uid() and enabled) then
    raise exception 'STAFF_REQUIRED' using errcode='42501';
  end if;
  v_folio:=lower(replace(btrim(p_folio),'-',''));
  if v_folio is null or v_folio !~ '^([a-f0-9]{8}|[a-f0-9]{32})$' then raise exception 'INVALID_FOLIO'; end if;
  select count(*) into v_count from public.passes
  where event_id=v_event and replace(id::text,'-','') like v_folio||'%';
  if v_count=0 then raise exception 'FOLIO_NOT_FOUND'; end if;
  if v_count>1 then raise exception 'FOLIO_AMBIGUOUS'; end if;
  select jsonb_build_object('passId',p.id,'qrToken',p.qr_token,'name',concat_ws(' ',r.first_name,nullif(r.last_name,''),nullif(r.second_last_name,'')),
    'status',p.status,'checkedInAt',c.checked_in_at)
  into v_result from public.passes p join public.registrations r on r.id=p.registration_id
  left join public.check_ins c on c.pass_id=p.id
  where p.event_id=v_event and replace(p.id::text,'-','') like v_folio||'%';
  return v_result;
end;
$$;
revoke all on function public.lookup_pass_by_folio(text,text) from public,anon;
grant execute on function public.lookup_pass_by_folio(text,text) to authenticated;
-- Include the pass identifier in new email jobs without changing frozen retries.
alter function public.claim_registration_email() rename to claim_registration_email_v1;
revoke all on function public.claim_registration_email_v1() from service_role;
create function public.claim_registration_email() returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_job jsonb; v_pass uuid;
begin
 v_job:=public.claim_registration_email_v1();
 if v_job is null then return null; end if;
 select pass_id into v_pass from public.email_deliveries where id=(v_job->>'id')::uuid;
 return v_job||jsonb_build_object('passId',v_pass);
end;
$$;
revoke all on function public.claim_registration_email() from public,anon,authenticated;
grant execute on function public.claim_registration_email() to service_role;
notify pgrst,'reload schema';
commit;
