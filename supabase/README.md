# Configurar Supabase

## 1. Aplicar las migraciones

En este proyecto **001 ya está instalada**. Abre el [SQL Editor](https://supabase.com/dashboard/project/hkhlfzrycolgqtgundsm/sql/new), pega todo [`migrations/202609220002_event_requirements.sql`](migrations/202609220002_event_requirements.sql) y pulsa Run. Debe terminar con `Success. No rows returned`. No repitas una migración aplicada. Para una base nueva, ejecuta primero 001 y después 002.

002 conserva registros y pases existentes, añade campos y evidencia de privacidad, recuperación mediante identidad verificada, permisos de personal y operaciones de lectura. No atribuye consentimiento a registros anteriores. Revoca el registro por la función antigua para impedir que se omita la nueva validación.

```sh
npm run check:supabase
```

Esta comprobación consulta únicamente configuración pública, sin registros ni envíos: salida 0 = API de configuración instalada; 2 = migración pendiente; 1 = error. No comprueba entrega SMTP ni autorización del personal. La clave pública no permite ejecutar migraciones ni SQL administrativo.

## 2. Configurar el formulario

En Table Editor → `events`, edita la fila `los-didis-2026`:

| Columna | Valor |
| --- | --- |
| `privacy_notice_url` | URL HTTPS del aviso aprobado. Pendiente del cliente. |
| `privacy_notice_version` | Identificador de la versión del aviso aprobado. |
| `extra_1_label`, `extra_2_label` | Nombres aprobados, o los valores actuales «Información adicional 1/2». |
| `registration_open` | Apertura del registro. Aun estando abierto, requiere aviso configurado. |
| `starts_at`, `venue` | Fecha con zona horaria y sede confirmadas. |
| `is_test` | Mantener `true` durante las pruebas. |
| `access_open` | Inicialmente `false`; controla si el personal puede validar entradas. |

No pongas una URL ficticia para abrir el formulario. Cada nuevo registro guarda fecha del servidor, versión y URL del aviso aceptado. Nombre, correo y confirmación son obligatorios en navegador y servidor; los demás campos de texto son opcionales. El registro no requiere pertenecer a una lista de invitados.

## 3. Habilitar acceso por correo

En Authentication configura el proveedor Email y permite crear usuarios. En URL Configuration añade las URLs de retorno que uses, por ejemplo:

- `http://127.0.0.1:5173/?area=pase`
- `http://127.0.0.1:5173/?area=personal`

Configura también Site URL. Si utilizas `localhost`, añade esas variantes; cuando exista dominio de producción, añade sus equivalentes HTTPS y cambia Site URL. El enlace debe volver a la misma aplicación.

Conserva en la plantilla Magic Link el enlace `{{ .ConfirmationURL }}`. La aplicación usa enlaces de un solo uso, no un formulario para introducir OTP. Configura SMTP propio y remitente verificado para enviar a asistentes externos: el servicio de correo predeterminado tiene restricciones y no sirve como entrega general de producción.

Consulta la documentación oficial de [acceso sin contraseña](https://supabase.com/docs/guides/auth/auth-email-passwordless) y [SMTP](https://supabase.com/docs/guides/auth/auth-smtp). Prueba el envío y la recuperación desde otro navegador con una cuenta real antes de abrir al público. Una respuesta aceptada del proveedor no garantiza que el mensaje haya llegado a la bandeja de entrada.

El enlace autentica la dirección; `get_my_registration` recupera únicamente el pase de esa identidad con correo confirmado. No basta con conocer la dirección de otro asistente. La credencial local de continuidad del registro se mantiene interna para recargas y reintentos; no se muestra ni se incluye en el gafete.

**Correo de confirmación con QR:** la plantilla de marca y el trabajador Resend están implementados. Sigue [`EMAIL_SETUP.md`](EMAIL_SETUP.md) para aplicar 003 y activar el envío. El flujo de enlaces de Supabase Auth es independiente; el seguimiento de entrega/rebote aún se consulta en Resend.

## 4. Autorizar al personal

El operador solicita un enlace desde «Acceso del personal» y verifica su correo. Después, un administrador obtiene su UUID en Authentication → Users y crea una fila en `event_staff`:

- `event_id`: UUID de `los-didis-2026` en `events`.
- `user_id`: UUID de la persona autorizada en Authentication.
- `role`: `scanner` (o `admin`).
- `enabled`: `true`.

Ambos roles pueden leer gafetes y consultar la bitácora; no hay una pantalla pública para conceder permisos. Un asistente autenticado sin esa fila no puede acceder a las funciones del personal. Para retirar permisos, cambia `enabled` a `false`.

Abre `access_open` para probar lecturas y mantenlo cerrado cuando no se deban recibir entradas. Usa HTTPS en dispositivos remotos para permitir la cámara; localhost funciona en la misma computadora. Se requiere internet. Prueba permisos y cámara en los celulares, iPads y computadoras que se usarán. Personal y equipo no están incluidos salvo contratación.

## 5. Lecturas y bitácora

`record_check_in` valida al operador, el evento y el pase en una transacción. Una entrada aceptada crea una sola fila de `check_ins`; una segunda lectura se registra como duplicada y devuelve la hora original. Los reintentos de la misma petición no crean otra lectura. La interfaz conserva la petición pendiente si se pierde la conexión y nunca anuncia éxito sin confirmación del servidor.

La bitácora muestra personas, resultados y hora exacta, presentada en zona America/Mexico_City. Los totales distinguen asistentes únicos de lecturas; también se guardan lecturas inválidas y de pases revocados. Abrir o descargar el QR no cuenta como entrada. Las tablas tienen RLS y no conceden consultas directas al navegador.

Antes de abrir el evento real, confirma fecha y sede, configura correo y aviso, autoriza operadores, valida los dispositivos y cambia `is_test` a `false`. Los pases y lecturas de prueba no se eliminan automáticamente: cualquier limpieza debe acordarse expresamente para no mezclar métricas ni borrar registros reales.

## Registro técnico anterior

El 22 de septiembre se creó un único registro ficticio «Prueba técnica / Conexión Supabase», con correo `.invalid`, sin envío. [`manual/remove-connection-test.sql`](manual/remove-connection-test.sql) elimina exclusivamente ese registro y su pase si se decide retirarlo.
