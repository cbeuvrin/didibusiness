# Eventos por ciudad

Antes de publicar la versión con selector, ejecuta completa una sola vez `migrations/202609220005_event_cities.sql` en Supabase → SQL Editor. Requiere haber ejecutado las migraciones 001 a 004. Después ejecuta `migrations/202609220006_event_dates.sql` para guardar las fechas confirmadas.

Fechas confirmadas: Guadalajara, 8 de octubre de 2026; Monterrey, 13 de octubre de 2026; CDMX, 16 de octubre de 2026. La migración 006 guarda estas fechas en `event_date` y puede volver a ejecutarse sin crear eventos ni pases adicionales. Horario y recinto siguen por confirmar: `starts_at` y `venue` quedan vacíos. Las opciones públicas del formulario y la portada están en `src/config.js`.

Los eventos nuevos heredan del evento original la apertura de registro y acceso, modo de prueba, aviso de privacidad y activación de correo. No se borran ni reasignan pases anteriores. El mismo correo puede tener un pase distinto por ciudad; al ingresar por correo puede elegir cuál consultar. Los correos ya preparados mantienen su contenido para conservar los reintentos idempotentes.

Los permisos de personal se asignan por evento en `event_staff`. Los permisos anteriores no se amplían automáticamente. Para autorizar al mismo operador en varias ciudades, agrega una fila por ciudad con el `event_id` correspondiente, su mismo `user_id`, `role=scanner` y `enabled=true`. El lector muestra únicamente los eventos autorizados y separa bitácora, folios y métricas. Un QR de otra ciudad no confirma una entrada.

Comprobación de configuración (sin datos personales):

```sql
select slug, city, day_label, event_date, starts_at, venue,
       registration_open, registration_email_enabled, access_open, is_test,
       privacy_notice_url is not null and privacy_notice_version is not null as privacy_configured
from public.events
order by slug;
```
