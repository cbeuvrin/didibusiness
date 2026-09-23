begin;

-- Confirmed calendar dates; no start time or venue has been provided.
do $$
begin
  if (select count(*) from public.events where slug in (
    'los-didis-2026-guadalajara','los-didis-2026-monterrey','los-didis-2026-cdmx'
  )) <> 3 then
    raise exception 'Ejecuta primero la migración 005 de eventos por ciudad';
  end if;
end;
$$;

update public.events e
set event_date = v.event_date
from (values
  ('los-didis-2026-guadalajara', date '2026-10-08'),
  ('los-didis-2026-monterrey', date '2026-10-13'),
  ('los-didis-2026-cdmx', date '2026-10-16')
) v(slug,event_date)
where e.slug = v.slug;

notify pgrst, 'reload schema';
commit;
