begin;
alter table public.events add column city text, add column event_date date, add column day_label text;
-- Preserve previous passes and permissions; create separate events for each city.
insert into public.events(slug,name,city,day_label,registration_open,is_test,privacy_notice_url,privacy_notice_version,registration_email_enabled,access_open)
select v.slug,'Los DiDis 2026 · '||v.city,v.city,v.day_label,e.registration_open,e.is_test,e.privacy_notice_url,e.privacy_notice_version,e.registration_email_enabled,e.access_open
from public.events e cross join (values
 ('los-didis-2026-guadalajara','Guadalajara','Día 8'),
 ('los-didis-2026-monterrey','Monterrey','Día 13'),
 ('los-didis-2026-cdmx','CDMX','Día 16')
) v(slug,city,day_label) where e.slug='los-didis-2026';
-- Existing personnel remain assigned only to their original event.
create function public.pass_event_details(p_event_slug text) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('eventSlug',slug,'eventName',name,'city',city,'eventDate',event_date,'dayLabel',day_label,'startsAt',starts_at,'venue',venue)
 from public.events where slug=p_event_slug;
$$;
revoke all on function public.pass_event_details(text) from public;
alter function public.get_registration(text,text,text) rename to get_registration_v1;
revoke all on function public.get_registration_v1(text,text,text) from anon,authenticated;
create function public.get_registration(p_event_slug text,p_email text,p_access_code text) returns jsonb
language sql stable security definer set search_path='' as $$
 select public.get_registration_v1(p_event_slug,p_email,p_access_code)||public.pass_event_details(p_event_slug);
$$;
revoke all on function public.get_registration(text,text,text) from public;
grant execute on function public.get_registration(text,text,text) to anon,authenticated;
alter function public.get_my_registration(text) rename to get_my_registration_v1;
revoke all on function public.get_my_registration_v1(text) from authenticated;
create function public.get_my_registration(p_event_slug text) returns jsonb
language sql stable security definer set search_path='' as $$
 select public.get_my_registration_v1(p_event_slug)||public.pass_event_details(p_event_slug);
$$;
revoke all on function public.get_my_registration(text) from public;
grant execute on function public.get_my_registration(text) to authenticated;
create function public.get_my_registrations() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_email text; v_result jsonb;
begin
 select lower(email) into v_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if v_email is null then raise exception 'EMAIL_VERIFICATION_REQUIRED'; end if;
 select coalesce(jsonb_agg(public.get_my_registration(e.slug) order by r.created_at desc),'[]'::jsonb) into v_result
 from public.registrations r join public.events e on e.id=r.event_id join public.passes p on p.registration_id=r.id
 where r.email=v_email and p.status='active';
 return v_result;
end;
$$;
revoke all on function public.get_my_registrations() from public;
grant execute on function public.get_my_registrations() to authenticated;
alter function public.claim_registration_email() rename to claim_registration_email_v2;
revoke all on function public.claim_registration_email_v2() from service_role;
create function public.claim_registration_email() returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_job jsonb;
begin
 v_job:=public.claim_registration_email_v2();
 if v_job is null then return null; end if;
 return v_job||public.pass_event_details(v_job->>'slug');
end;
$$;
revoke all on function public.claim_registration_email() from public;
grant execute on function public.claim_registration_email() to service_role;
create function public.get_staff_events() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('slug',e.slug,'name',e.name) order by e.event_date,substring(e.day_label from '[0-9]+')::integer,e.slug),'[]'::jsonb)
 from public.events e join public.event_staff s on s.event_id=e.id
 where s.user_id=auth.uid() and s.enabled;
$$;
revoke all on function public.get_staff_events() from public;
grant execute on function public.get_staff_events() to authenticated;
notify pgrst,'reload schema';
commit;
