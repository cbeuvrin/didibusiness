-- Optional: remove only the synthetic connection test created on 2026-09-22.
-- Run as project administrator in the SQL Editor; this is not a migration.
begin;
delete from public.email_deliveries where pass_id = '5f1c26d2-72d3-4909-bee5-267f1a954e23';
delete from public.passes where id = '5f1c26d2-72d3-4909-bee5-267f1a954e23' and registration_id = '9534c134-9060-45d3-92eb-4a709b03be04';
delete from public.registrations where id = '9534c134-9060-45d3-92eb-4a709b03be04' and email = 'prueba-conexion-1790089729807@los-didis.invalid';
commit;
