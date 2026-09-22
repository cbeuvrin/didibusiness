# Correo de confirmación con QR

La plantilla usa el fondo naranja y logotipo oficiales. El gafete PDF se adjunta para descargar o imprimir directamente desde el correo. El QR PNG va incrustado mediante CID, sin un servicio externo que reciba su token. Incluye nombre, fecha y sede desde la base; si no están confirmadas se indican como pendientes. Los pases de prueba llevan esa leyenda. Hay versión de texto y un enlace de consulta que exige iniciar sesión.

## Revisar sin enviar

```sh
npm run preview:email
npm run test:email
npm run test:db
```

La vista previa está en `test-results/registration-email.html`. Usa un QR ficticio que nunca concede entrada. El HTML usa tablas, estilos en línea y naranja de respaldo: algunos clientes de correo bloquean imágenes externas o no muestran fondos. La apariencia se revisó en Chrome móvil/escritorio; queda pendiente comprobar un envío real en Gmail, Outlook y Apple Mail.

## Activar

1. Ejecuta **solo** `migrations/202609220003_registration_email.sql` en el SQL Editor, después de 001 y 002. El envío queda desactivado inicialmente y conserva los trabajos anteriores en `pending_setup`.
2. En Vercel → proyecto → Settings → Environment Variables → Production, agrega:
   - `RESEND_API_KEY`: clave Sending access para `losdidis2026.com`.
   - `SUPABASE_SERVICE_ROLE_KEY`: clave **service_role** del proyecto Supabase, disponible en API Keys → Legacy API Keys. Esta clave es privada y solo se usa en la función del servidor.
   - `CRON_SECRET`: valor aleatorio de al menos 32 caracteres. Puedes generarlo localmente con `openssl rand -hex 32`.
   - La función utiliza la `VITE_SUPABASE_URL` ya configurada; alternativamente admite `SUPABASE_URL`.
   Nunca pongas el prefijo `VITE_` a las tres claves privadas, ni las pegues en el chat o Git.
3. Publica los cambios y realiza un Redeploy después de configurar variables. La función es `/api/cron/registration-emails`. Las solicitudes sin el secreto devuelven 401 y no envían nada.
4. Programa el envío una vez por minuto mediante **una sola** de estas opciones:
   - **Supabase Cron:** activa pg_cron y pg_net desde Integrations. En Vault crea `didis_email_cron_secret` con el mismo valor de `CRON_SECRET`; ejecuta `manual/schedule-registration-emails.sql`. Esta opción evita depender de Vercel Pro. El endpoint usa el dominio canónico sin www para evitar redirecciones.
   - **Vercel Pro:** añade a `vercel.json` la propiedad `"crons": [{"path":"/api/cron/registration-emails","schedule":"* * * * *"}]` y vuelve a desplegar. Vercel envía el encabezado Authorization con `CRON_SECRET`. No actives esta frecuencia en Hobby: rechaza el despliegue.
5. En Table Editor → `events` → `los-didis-2026`, cambia `registration_email_enabled` a `true`. Hazlo después de preparar claves y programador. Mantén `is_test=true` para la prueba inicial. El aviso de privacidad sigue siendo necesario para registrar nuevos asistentes.
6. Registra una dirección de prueba autorizada, espera la ejecución y comprueba Resend, la bandeja y el QR con el lector. `sent` significa que Resend aceptó el envío, no que llegó a la bandeja. Las entregas y rebotes se consultan en Resend; aún no hay webhook que actualice `delivered`/`bounced` en Supabase.

## Funcionamiento y límites

Cada registro nuevo inserta su trabajo en la misma transacción que el pase. Solo se encolan trabajos nuevos después de activar la opción. El navegador no conoce claves privadas ni determina el destinatario del envío. Recargar la confirmación no crea otro correo.

Cada ejecución procesa hasta 5 correos secuenciales (capacidad inicial aproximada de 300/hora si el proveedor y las ejecuciones lo permiten; no es una garantía de entrega). Una cola grande implica espera y requiere ajustar capacidad según el plan/límite de Resend. No se promete entrega inmediata.

Los trabajos se reservan por 3 minutos. Si una ejecución se interrumpe, otra puede retomarlos. Antes del primer envío se guarda el mensaje exacto, incluido el QR, y se usa `registration/<id>` como clave de idempotencia de Resend. Así, un reintento tras perder la respuesta no cambia el mensaje. Se reintenta con espera creciente, hasta 8 intentos y por menos de 23 horas: Resend conserva claves por 24 horas. Los errores permanentes pasan a `failed`; los casos ambiguos fuera de la ventana quedan con `REVIEW_REQUIRED` para revisión manual, sin reenvío automático.

No restablezcas a cero intentos o fechas para forzar un reenvío ambiguo: revisa primero en Resend si fue aceptado. No se envían automáticamente registros históricos ni se elimina historial. Para pausar nuevos envíos cambia `registration_email_enabled=false`; una petición ya en curso puede terminar.

El contenido del mensaje y destinatario quedan en `email_deliveries.request_payload`, tabla privada con RLS. No se incluyen destinatarios, tokens QR ni respuestas del proveedor en los logs de la función. No hay tracking de aperturas o clics añadido por el código.

Fuentes: [Resend CID](https://resend.com/changelog/embed-images-using-cid), [idempotencia](https://resend.com/changelog/idempotency-keys), [Vercel Cron](https://vercel.com/docs/cron-jobs/manage-cron-jobs), [límites Cron](https://vercel.com/docs/cron-jobs/usage-and-pricing).
