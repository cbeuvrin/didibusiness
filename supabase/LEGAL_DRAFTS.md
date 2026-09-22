# Documentos provisionales

`public/privacidad.html` y `public/terminos.html` se generan con `node scripts/build-legal-pages.mjs`. Edita el contenido en ese script y regenera los HTML para sustituirlos por los documentos del cliente.

Son borradores identificados como tales. Faltan identidad y domicilio del responsable, canal atendido y procedimiento ARCO, conservación y confirmación de proveedores/transferencias; también reglas definitivas del evento. No se ha inventado un correo de soporte: registro@losdidis2026.com no recibe respuestas.

Los enlaces están en el pie de página y el formulario. Para vincular el borrador al evento de prueba después de publicarlo, ejecuta `manual/use-draft-privacy-for-testing.sql`. El script solo actualiza el evento si sigue en modo de prueba y no tiene aviso configurado. No cambia consentimientos históricos ni habilita envíos.

Cuando llegue el documento definitivo, cambia el contenido publicado y `events.privacy_notice_version` (y URL si cambia). Conserva una copia del documento de cada versión aceptada. No conviertas las aceptaciones del borrador en aceptaciones del texto definitivo.

Referencia de estructura para la revisión del cliente: Ley Federal de Protección de Datos Personales en Posesión de los Particulares, texto publicado por la Cámara de Diputados: https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf. Este borrador no constituye una revisión legal del evento.
