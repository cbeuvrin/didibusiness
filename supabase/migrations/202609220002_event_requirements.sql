begin;

-- Keep existing registrations and passes; add the fields required by texto_extra_do.md.
alter table public.registrations drop constraint registrations_last_name_check;
alter table public.registrations alter column last_name set default '';
alter table public.registrations add constraint registrations_last_name_check check (char_length(last_name) <= 80);
alter table public.registrations
  add column phone text not null default '' check (char_length(phone) <= 30),
  add column state text not null default '' check (char_length(state) <= 80),
  add column extra_1 text not null default '' check (char_length(extra_1) <= 500),
  add column extra_2 text not null default '' check (char_length(extra_2) <= 500),
  add column privacy_accepted_at timestamptz,
  add column privacy_notice_version text,
  add column privacy_notice_url text;
-- Historical rows retain NULL consent. Never invent retrospective acceptance.
alter table public.events
  add column privacy_notice_url text check (privacy_notice_url ~ '^https://[^[:space:]]+$'),
  add column privacy_notice_version text,
  add column extra_1_label text not null default 'Información adicional 1' check (char_length(extra_1_label) between 1 and 100),
  add column extra_2_label text not null default 'Información adicional 2' check (char_length(extra_2_label) between 1 and 100),
  add column access_open boolean not null default false;
alter table public.event_staff add column enabled boolean not null default true;
alter table public.scan_logs add column token_hash text;

-- The old registration endpoint must not bypass the new consent requirement.
revoke execute on function public.register_attendee(text,text,text,text,text,text) from anon, authenticated;

create function public.get_event_settings(p_event_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('name', name, 'startsAt', starts_at, 'venue', venue,
    'registrationOpen', registration_open, 'isTest', is_test,
    'privacyUrl', privacy_notice_url, 'privacyVersion', privacy_notice_version,
    'extra1Label', extra_1_label, 'extra2Label', extra_2_label)
  from public.events where slug = p_event_slug;
$$;

create function public.register_attendee_v2(
  p_event_slug text, p_first_name text, p_last_name text, p_second_last_name text,
  p_email text, p_confirm_email text, p_access_code text,
  p_phone text, p_state text, p_extra_1 text, p_extra_2 text,
  p_privacy_accepted boolean, p_privacy_version text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_event public.events%rowtype;
  v_registration public.registrations%rowtype;
  v_pass public.passes%rowtype;
  v_email text := lower(btrim(p_email));
  v_hash text;
begin
  if p_access_code is null or p_access_code !~ '^[a-f0-9]{32}$'
    or p_first_name is null or char_length(btrim(p_first_name)) not between 1 and 80
    or char_length(coalesce(p_last_name,'')) > 80 or char_length(coalesce(p_second_last_name,'')) > 80
    or v_email is null or char_length(v_email) > 254
    or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or p_confirm_email is null or v_email <> lower(btrim(p_confirm_email))
    or char_length(coalesce(p_phone,'')) > 30 or char_length(coalesce(p_state,'')) > 80
    or char_length(coalesce(p_extra_1,'')) > 500 or char_length(coalesce(p_extra_2,'')) > 500 then
    raise exception 'INVALID_REGISTRATION' using errcode = '22023';
  end if;
  select * into v_event from public.events where slug = p_event_slug;
  if not found then raise exception 'REGISTRATION_UNAVAILABLE'; end if;
  v_hash := encode(sha256(convert_to(p_access_code,'UTF8')),'hex');
  select * into v_registration from public.registrations where event_id = v_event.id and email = v_email;
  if not found then
    if not v_event.registration_open then raise exception 'REGISTRATION_CLOSED'; end if;
    if v_event.privacy_notice_url is null or nullif(btrim(v_event.privacy_notice_version),'') is null then
      raise exception 'PRIVACY_NOT_CONFIGURED';
    end if;
    if p_privacy_accepted is distinct from true or p_privacy_version is distinct from v_event.privacy_notice_version then
      raise exception 'PRIVACY_REQUIRED';
    end if;
    insert into public.registrations(event_id, first_name, last_name, second_last_name, email, access_hash,
      phone, state, extra_1, extra_2, privacy_accepted_at, privacy_notice_version, privacy_notice_url)
    values(v_event.id, btrim(p_first_name), btrim(coalesce(p_last_name,'')), btrim(coalesce(p_second_last_name,'')), v_email, v_hash,
      btrim(coalesce(p_phone,'')), btrim(coalesce(p_state,'')), btrim(coalesce(p_extra_1,'')), btrim(coalesce(p_extra_2,'')),
      now(), v_event.privacy_notice_version, v_event.privacy_notice_url)
    on conflict(event_id,email) do nothing;
    select * into v_registration from public.registrations where event_id = v_event.id and email = v_email;
  end if;
  if v_registration.access_hash <> v_hash then raise exception 'REGISTRATION_EXISTS'; end if;
  insert into public.passes(registration_id,event_id) values(v_registration.id,v_event.id) on conflict(registration_id) do nothing;
  select * into v_pass from public.passes where registration_id = v_registration.id;
  if v_pass.status <> 'active' then raise exception 'PASS_UNAVAILABLE'; end if;
  insert into public.email_deliveries(pass_id) values(v_pass.id) on conflict(pass_id,kind) do nothing;
  return public.get_registration(p_event_slug,v_email,p_access_code);
end;
$$;

-- Only the owner of a verified email can retrieve a badge through email login.
create function public.get_my_registration(p_event_slug text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_email text; v_result jsonb;
begin
  select lower(email) into v_email from auth.users where id = auth.uid() and email_confirmed_at is not null;
  if v_email is null then raise exception 'EMAIL_VERIFICATION_REQUIRED'; end if;
  select jsonb_build_object('id',r.id,'passId',p.id,'firstName',r.first_name,'lastName',r.last_name,
    'secondLastName',r.second_last_name,'email',r.email,'createdAt',r.created_at,'qrToken',p.qr_token,'isTest',e.is_test)
  into v_result from public.registrations r join public.events e on e.id = r.event_id
  join public.passes p on p.registration_id = r.id
  where e.slug = p_event_slug and r.email = v_email and p.status = 'active';
  if v_result is null then raise exception 'PASS_NOT_FOUND'; end if;
  return v_result;
end;
$$;

create function public.get_staff_access(p_event_slug text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  select jsonb_build_object('role',s.role,'accessOpen',e.access_open,'isTest',e.is_test)
  into v_result from public.event_staff s join public.events e on e.id = s.event_id
  where e.slug = p_event_slug and s.user_id = auth.uid() and s.enabled;
  if v_result is null then raise exception 'STAFF_REQUIRED' using errcode = '42501'; end if;
  return v_result;
end;
$$;

-- The server clock is authoritative. The request ID makes a retry after a lost
-- response return the original result, without writing another scan or check-in.
create function public.record_check_in(p_event_slug text, p_qr_token text, p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_event public.events%rowtype;
  v_pass public.passes%rowtype;
  v_scan public.scan_logs%rowtype;
  v_name text;
  v_result text;
  v_time timestamptz;
  v_hash text;
  v_staff public.event_staff%rowtype;
begin
  select * into v_event from public.events where slug = p_event_slug;
  select * into v_staff from public.event_staff where event_id = v_event.id and user_id = auth.uid() and enabled for share;
  if not found then raise exception 'STAFF_REQUIRED' using errcode = '42501'; end if;
  if p_request_id is null or p_qr_token is null or char_length(p_qr_token) > 256 then raise exception 'INVALID_SCAN'; end if;
  v_hash := encode(sha256(convert_to(p_qr_token,'UTF8')),'hex');
  -- Serialize only retries of the same request. A row lock on the pass below
  -- protects simultaneous scans of that pass from different devices/operators.
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
  select * into v_scan from public.scan_logs where id = p_request_id;
  if found then
    if v_scan.event_id <> v_event.id or v_scan.operator_id <> auth.uid() or v_scan.token_hash is distinct from v_hash then
      raise exception 'INVALID_SCAN';
    end if;
  else
    if not v_event.access_open then raise exception 'ACCESS_CLOSED'; end if;
    select * into v_pass from public.passes where event_id = v_event.id and qr_token = p_qr_token for update;
    if not found then v_result := 'invalid';
    elsif v_pass.status = 'revoked' then v_result := 'revoked';
    elsif exists(select 1 from public.check_ins where pass_id = v_pass.id) then v_result := 'duplicate';
    else v_result := 'accepted'; end if;
    insert into public.scan_logs(id,event_id,pass_id,operator_id,result,scanned_at,token_hash)
    values(p_request_id,v_event.id,v_pass.id,auth.uid(),v_result,clock_timestamp(),v_hash) returning * into v_scan;
    if v_result = 'accepted' then
      insert into public.check_ins(pass_id,event_id,scan_id,checked_in_at) values(v_pass.id,v_event.id,v_scan.id,v_scan.scanned_at);
    end if;
  end if;
  select concat_ws(' ',r.first_name,nullif(r.last_name,''),nullif(r.second_last_name,'')),c.checked_in_at
  into v_name,v_time from public.passes p join public.registrations r on r.id = p.registration_id
  left join public.check_ins c on c.pass_id = p.id where p.id = v_scan.pass_id;
  return jsonb_build_object('result',v_scan.result,'name',v_name,'scannedAt',v_scan.scanned_at,'checkedInAt',v_time,'isTest',v_event.is_test);
end;
$$;

create function public.get_attendance_log(p_event_slug text, p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_event_id uuid; v_result jsonb;
begin
  select id into v_event_id from public.events where slug = p_event_slug;
  if not exists(select 1 from public.event_staff where event_id = v_event_id and user_id = auth.uid() and enabled) then
    raise exception 'STAFF_REQUIRED' using errcode = '42501';
  end if;
  if p_offset < 0 or p_offset is null then raise exception 'INVALID_OFFSET'; end if;
  select jsonb_build_object(
    'registered',(select count(*) from public.registrations where event_id = v_event_id),
    'attended',(select count(*) from public.check_ins where event_id = v_event_id),
    'scans',(select count(*) from public.scan_logs where event_id = v_event_id),
    'entries', coalesce((select jsonb_agg(to_jsonb(entry)) from (
      select s.id,s.result,s.scanned_at as "scannedAt",c.checked_in_at as "checkedInAt",
        concat_ws(' ',r.first_name,nullif(r.last_name,''),nullif(r.second_last_name,'')) as name,
        s.operator_id as "operatorId"
      from public.scan_logs s left join public.passes p on p.id = s.pass_id
      left join public.registrations r on r.id = p.registration_id
      left join public.check_ins c on c.pass_id = p.id
      where s.event_id = v_event_id order by s.scanned_at desc,s.id desc limit 50 offset p_offset
    ) entry),'[]'::jsonb)) into v_result;
  return v_result;
end;
$$;

revoke all on function public.get_event_settings(text), public.register_attendee_v2(text,text,text,text,text,text,text,text,text,text,text,boolean,text),
  public.get_my_registration(text), public.get_staff_access(text), public.record_check_in(text,text,uuid), public.get_attendance_log(text,integer) from public;
grant execute on function public.get_event_settings(text), public.register_attendee_v2(text,text,text,text,text,text,text,text,text,text,text,boolean,text) to anon, authenticated;
grant execute on function public.get_my_registration(text), public.get_staff_access(text), public.record_check_in(text,text,uuid), public.get_attendance_log(text,integer) to authenticated;

notify pgrst, 'reload schema';
commit;
