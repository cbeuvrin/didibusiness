import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

export async function createTestDatabase({ configurePrivacy = true, openAccess = true } = {}) {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users (id uuid primary key,email text,email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth to anon,authenticated,service_role;`);
  const migrationDirectory = new URL('../../supabase/migrations/', import.meta.url);
  for (const name of (await readdir(migrationDirectory)).filter(name => name.endsWith('.sql')).sort()) {
    await db.exec(await readFile(new URL(name,migrationDirectory),'utf8'));
  }
  if (configurePrivacy) await db.exec("update public.events set privacy_notice_url = 'https://example.com/privacidad', privacy_notice_version = 'test-v1'");
  if (openAccess) await db.exec('update public.events set access_open = true');
  return db;
}

export function rpcStatement(name, body) {
  const params = {
    register_attendee_v2:['p_event_slug','p_first_name','p_last_name','p_second_last_name','p_email','p_confirm_email','p_access_code','p_phone','p_state','p_extra_1','p_extra_2','p_privacy_accepted','p_privacy_version'],
    get_registration:['p_event_slug','p_email','p_access_code'],
    get_my_registrations:[],
    get_staff_events:[],
    get_my_registration:['p_event_slug'],
    get_event_settings:['p_event_slug'],
    lookup_pass_by_folio:['p_event_slug','p_folio'],
    get_staff_access:['p_event_slug'],
    record_check_in:['p_event_slug','p_qr_token','p_request_id'],
    get_attendance_log:['p_event_slug','p_offset'],
  }[name];
  if (!params) throw new Error(`Unexpected RPC: ${name}`);
  return [`select public.${name}(${params.map((_,index) => '$'+(index+1)).join(',')}) as value`,params.map(key => body[key] ?? (key === 'p_offset' ? 0 : null))];
}
