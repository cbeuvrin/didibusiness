begin;

-- Private application tables. The browser only executes the two scoped functions below.
create table public.events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  starts_at timestamptz,
  venue text,
  registration_open boolean not null default false,
  is_test boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  first_name text not null check (char_length(btrim(first_name)) between 1 and 80),
  last_name text not null check (char_length(btrim(last_name)) between 1 and 80),
  second_last_name text not null default '' check (char_length(second_last_name) <= 80),
  email text not null check (email = lower(btrim(email)) and char_length(email) <= 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  access_hash text not null check (access_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  unique (event_id, email),
  unique (event_id, access_hash),
  unique (id, event_id)
);

create table public.passes (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null unique,
  event_id uuid not null,
  qr_token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  status text not null default 'active' check (status in ('active', 'revoked')),
  created_at timestamptz not null default now(),
  foreign key (registration_id, event_id) references public.registrations(id, event_id),
  unique (id, event_id)
);

create table public.event_staff (
  event_id uuid not null references public.events(id),
  user_id uuid not null references auth.users(id),
  role text not null check (role in ('scanner', 'admin')),
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

-- One row per attempt; these rows are not the attendance count.
create table public.scan_logs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  pass_id uuid,
  operator_id uuid not null,
  result text not null check (result in ('accepted', 'duplicate', 'invalid', 'revoked')),
  scanned_at timestamptz not null default now(),
  foreign key (pass_id, event_id) references public.passes(id, event_id),
  foreign key (event_id, operator_id) references public.event_staff(event_id, user_id),
  unique (id, pass_id, event_id),
  check (result = 'invalid' or pass_id is not null)
);

-- Unique pass/event combination prevents counting the same attendee twice.
create table public.check_ins (
  pass_id uuid primary key,
  event_id uuid not null,
  scan_id uuid not null unique,
  checked_in_at timestamptz not null default now(),
  foreign key (pass_id, event_id) references public.passes(id, event_id),
  foreign key (scan_id, pass_id, event_id) references public.scan_logs(id, pass_id, event_id)
);

-- The worker and provider integration are the next phase. Nothing sends mail yet.
create table public.email_deliveries (
  id uuid primary key default gen_random_uuid(),
  pass_id uuid not null references public.passes(id),
  kind text not null default 'registration' check (kind in ('registration', 'recovery')),
  status text not null default 'pending_setup' check (status in ('pending_setup', 'queued', 'sending', 'sent', 'delivered', 'bounced', 'failed')),
  provider_message_id text unique,
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pass_id, kind)
);

create index scan_logs_event_time on public.scan_logs(event_id, scanned_at desc);
create index check_ins_event_time on public.check_ins(event_id, checked_in_at desc);

alter table public.events enable row level security;
alter table public.registrations enable row level security;
alter table public.passes enable row level security;
alter table public.event_staff enable row level security;
alter table public.scan_logs enable row level security;
alter table public.check_ins enable row level security;
alter table public.email_deliveries enable row level security;

revoke all on public.events, public.registrations, public.passes, public.event_staff,
  public.scan_logs, public.check_ins, public.email_deliveries from public, anon, authenticated;
grant all on public.events, public.registrations, public.passes, public.event_staff,
  public.scan_logs, public.check_ins, public.email_deliveries to service_role;

-- No confirmed date or venue has been supplied. Keep passes marked as tests.
insert into public.events (slug, name, registration_open, is_test)
values ('los-didis-2026', 'Los DiDis 2026', true, true);

-- A private 128-bit access code is generated in the browser before submission.
-- Only its SHA-256 hash is stored. Retrying with the same code is idempotent.
create function public.register_attendee(
  p_event_slug text,
  p_first_name text,
  p_last_name text,
  p_second_last_name text,
  p_email text,
  p_access_code text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_event public.events%rowtype;
  v_registration public.registrations%rowtype;
  v_pass public.passes%rowtype;
  v_hash text;
  v_email text := lower(btrim(p_email));
begin
  if p_access_code is null or p_access_code !~ '^[a-f0-9]{32}$'
    or p_first_name is null or char_length(btrim(p_first_name)) not between 1 and 80
    or p_last_name is null or char_length(btrim(p_last_name)) not between 1 and 80
    or char_length(coalesce(p_second_last_name, '')) > 80
    or v_email is null or char_length(v_email) > 254
    or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'INVALID_REGISTRATION' using errcode = '22023';
  end if;

  select * into v_event from public.events where slug = p_event_slug;
  if not found then
    raise exception 'REGISTRATION_UNAVAILABLE' using errcode = 'P0001';
  end if;
  v_hash := encode(sha256(convert_to(p_access_code, 'UTF8')), 'hex');

  -- Existing requests can recover their result even after registration closes.
  select * into v_registration from public.registrations
    where event_id = v_event.id and email = v_email;
  if not found then
    if not v_event.registration_open then
      raise exception 'REGISTRATION_CLOSED' using errcode = 'P0001';
    end if;
    insert into public.registrations (event_id, first_name, last_name, second_last_name, email, access_hash)
    values (v_event.id, btrim(p_first_name), btrim(p_last_name), btrim(coalesce(p_second_last_name, '')), v_email, v_hash)
    on conflict (event_id, email) do nothing;
    -- A concurrent request with the same email must present the original code.
    select * into v_registration from public.registrations
      where event_id = v_event.id and email = v_email;
  end if;
  if v_registration.access_hash <> v_hash then
    raise exception 'REGISTRATION_EXISTS' using errcode = 'P0001';
  end if;

  insert into public.passes (registration_id, event_id)
  values (v_registration.id, v_event.id) on conflict (registration_id) do nothing;
  select * into v_pass from public.passes where registration_id = v_registration.id;
  if v_pass.status <> 'active' then
    raise exception 'PASS_UNAVAILABLE' using errcode = 'P0001';
  end if;
  insert into public.email_deliveries (pass_id) values (v_pass.id)
    on conflict (pass_id, kind) do nothing;

  return jsonb_build_object(
    'id', v_registration.id, 'passId', v_pass.id,
    'firstName', v_registration.first_name, 'lastName', v_registration.last_name,
    'secondLastName', v_registration.second_last_name, 'email', v_registration.email,
    'createdAt', v_registration.created_at, 'qrToken', v_pass.qr_token,
    'isTest', v_event.is_test
  );
end;
$$;

-- A QR token cannot be used as the private consultation code.
-- Reading a pass never writes a scan or a check-in.
create function public.get_registration(p_event_slug text, p_email text, p_access_code text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if p_access_code is null or p_access_code !~ '^[a-f0-9]{32}$' then
    raise exception 'INVALID_ACCESS' using errcode = 'P0001';
  end if;
  select jsonb_build_object(
    'id', r.id, 'passId', p.id, 'firstName', r.first_name, 'lastName', r.last_name,
    'secondLastName', r.second_last_name, 'email', r.email,
    'createdAt', r.created_at, 'qrToken', p.qr_token, 'isTest', e.is_test
  ) into v_result
  from public.registrations r
  join public.events e on e.id = r.event_id
  join public.passes p on p.registration_id = r.id
  where e.slug = p_event_slug and r.email = lower(btrim(p_email))
    and r.access_hash = encode(sha256(convert_to(p_access_code, 'UTF8')), 'hex')
    and p.status = 'active';
  if v_result is null then
    raise exception 'INVALID_ACCESS' using errcode = 'P0001';
  end if;
  return v_result;
end;
$$;

revoke all on function public.register_attendee(text, text, text, text, text, text) from public;
revoke all on function public.get_registration(text, text, text) from public;
grant execute on function public.register_attendee(text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.get_registration(text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
