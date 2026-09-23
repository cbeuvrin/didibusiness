begin;

-- Confirmed venues per city; start times are still pending.
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
set venue = v.venue
from (values
  ('los-didis-2026-guadalajara', 'Salón Benavento'),
  ('los-didis-2026-monterrey', 'Salón Verite'),
  ('los-didis-2026-cdmx', 'Papalote Museo del Niño')
) v(slug,venue)
where e.slug = v.slug;

notify pgrst, 'reload schema';
commit;
