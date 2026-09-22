# Los DiDis 2026

Registro y control de acceso con la identidad naranja oficial. La implementación sigue `texto_extra_do.md` y se adapta a celular, tablet y computadora.

## Uso local

```sh
npm install
cp .env.example .env.local
# Completa la URL y Publishable key de Supabase.
npm run dev -- --port 5173 --strictPort
```

Si `.env.local` ya existe, consérvalo. Solo la URL y clave pública van al navegador; nunca uses una clave secreta o `service_role` con prefijo `VITE_`.

## Funciones implementadas

- Registro abierto a cualquier persona: nombre, correo y confirmación obligatorios; apellidos, teléfono, estado y dos respuestas abiertas opcionales. Aceptación del aviso con fecha, versión y URL guardadas en el servidor.
- Inicio de sesión con correo: Supabase envía un enlace para verificar al titular y recuperar su gafete desde otro dispositivo. No se pide un código privado.
- Gafete descargable PNG con nombre completo, QR, fecha y lugar del evento. Consultarlo no registra asistencia.
- Acceso del personal autorizado: lectura QR mediante cámara o lector externo, validación por internet, detección de entradas repetidas y bitácora con hora del servidor.
- Métricas separadas de registros, asistentes únicos y lecturas. Reintentar una lectura cuya respuesta se perdió no duplica la entrada.

El QR contiene un token aleatorio, sin datos personales. Las tablas no se pueden consultar directamente desde el navegador; las operaciones se realizan mediante funciones con permisos limitados.

## Activación pendiente

Sigue [`supabase/README.md`](supabase/README.md). La migración 001 ya se aplicó al proyecto; ahora corresponde ejecutar **002**. No repitas 001.

El aviso de privacidad y los nombres definitivos de los dos campos todavía no están definidos. Los dos campos están implementados pero ocultos. Para mostrarlos, activa `registrationForm.showAdditionalFields` en `src/config.js`; sus etiquetas siguen siendo configurables en Supabase. Hasta configurar un aviso aprobado, el formulario no permite nuevos registros.

El acceso por enlace requiere configurar SMTP y las URLs de redirección en Supabase. El correo automático de confirmación con el QR es una integración adicional pendiente: `email_deliveries` conserva trabajos en `pending_setup`, sin trabajador de envío implementado.

Antes de usar el lector hay que autorizar al personal y abrir el acceso del evento. Se conserva el modo de prueba; la fecha y sede siguen pendientes de confirmación. La portada usa `src/config.js` y texto en `src/main.jsx`; el gafete utiliza los datos del evento guardados en Supabase.

## Comprobaciones

```sh
npm run build
npm run test:db
npm test
npm run check:supabase
```

Las 16 pruebas de PostgreSQL local (PGlite) y 11 pruebas de navegador cubren campos, consentimiento, permisos, enlaces de acceso, gafetes, duplicados, recuperación de errores y lector QR. Las pruebas de navegador requieren Google Chrome y usan el puerto 5174 con una base desechable: no escriben en Supabase ni envían correos. La cámara se prueba con vídeo simulado y el decodificador real; falta validar los dispositivos físicos del evento.
