# Los DiDis 2026

Ejemplo navegable de una landing de registro, inspirado en las referencias proporcionadas. Fondo naranja original de Los DiDis con geometrías integradas y logotipo oficial, exportado del archivo Illustrator a PNG transparente para la web y el pase descargable. Los recursos web están en `public/brand/`.

## Uso

```sh
npm install
npm run dev
```

Abre la dirección local que muestra Vite. Para compilar: `npm run build`. Para ejecutar las pruebas de navegación: `npm test` (requiere Google Chrome instalado).

## Pantallas

- Inicio: presentación del evento y botones «Ya estoy registrado» y «Registrarme».
- `#registro`: nombre, apellidos, correo y confirmación del correo. El apellido materno es opcional.
- `#acceso`: consulta de un registro mediante correo.
- `#confirmacion`: pase personal, QR generado y descarga del pase como PNG.

## Datos editables

El nombre, fecha, hora, sede y descripción se encuentran en `src/config.js`. La portada y el pase también contienen el nombre visual y la fecha de la muestra en `src/main.jsx`. Se usa el 28 de octubre de 2026 a las 8:00 p. m. como ejemplo; la sede está por confirmar.

## Alcance de la demostración

Los registros se guardan únicamente en `sessionStorage` de la pestaña actual. Sobreviven a recargas y al cierre de sesión dentro de esa pestaña; se eliminan al cerrar la sesión del navegador. No se envían correos ni datos a un servidor. La consulta por correo es un flujo de demostración, no autenticación real.

El QR contiene un identificador aleatorio de prueba sin datos personales y no otorga acceso a un evento real. Para publicar un registro operativo se necesita integrar un backend, base de datos, verificación de correo, controles de acceso y validación de entradas. El almacenamiento y la autenticación de muestra están aislados en `src/main.jsx` para poder sustituirlos.

La fuente se distribuye localmente con el proyecto. No se solicitan imágenes ni fuentes a servicios externos al navegar.
