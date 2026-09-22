const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function registrationEmail(job, { siteUrl = 'https://losdidis2026.com', qrSrc = 'cid:entry-qr' } = {}) {
  const date = job.startsAt ? new Intl.DateTimeFormat('es-MX', {dateStyle:'long',timeStyle:'short',timeZone:'America/Mexico_City'}).format(new Date(job.startsAt)) : 'Fecha y hora por confirmar';
  const venue = job.venue || 'Sede por confirmar';
  const site = new URL(siteUrl).origin;
  const logo = `${site}/brand/los-didis-logo.png`;
  const background = `${site}/brand/los-didis-background.jpg`;
  const test = job.isTest ? 'PASE DE PRUEBA · SIN VALIDEZ DE ENTRADA' : 'TU ACCESO AL EVENTO';
  const subject = `${job.isTest ? '[PRUEBA] ' : ''}Tu gafete para ${job.eventName}`;
  const text = `Hola, ${job.name}.\nTu registro para ${job.eventName} está confirmado.\n${test}\n${date} (Ciudad de México)\n${venue}\nPresenta el QR incluido en este correo al personal de acceso. Descarga también el gafete PDF adjunto. Guarda la imagen o el PDF antes de llegar; no necesitas internet para mostrarla.\nConsulta y descarga tu gafete: ${site}/#acceso\nTu QR es personal. No lo compartas.\nEste buzón no recibe respuestas.`;
  const html = `<!doctype html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(subject)}</title></head>
<body style="margin:0;padding:0;background:#fff8ef;color:#24160f;font-family:Arial,Helvetica,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">Tu registro está confirmado. Guarda tu QR para el día del evento.</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fff8ef"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#f4770b">
<tr><td background="${background}" bgcolor="#f4770b" style="padding:38px 28px;background-color:#f4770b;background-image:url('${background}');background-size:100% 100%;background-position:center top">
<img src="${logo}" width="156" alt="Los DiDis 2026" style="display:block;width:156px;max-width:100%;height:auto;border:0">
<p style="margin:42px 0 12px;font-size:11px;letter-spacing:2px;font-weight:bold">YA ERES PARTE</p>
<h1 style="margin:0;font-size:42px;line-height:1.08;letter-spacing:-2px;font-weight:700">Nos vemos<br>en Los DiDis.</h1>
<p style="margin:22px 0 30px;font-size:16px;line-height:1.7">Hola, ${escape(job.name)}.<br>Tu registro está confirmado.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fffcf8;border-radius:12px"><tr><td align="center" style="padding:30px 20px">
<p style="margin:0 0 18px;font-size:10px;letter-spacing:1px;font-weight:bold">${test}</p>
<img src="${escape(qrSrc)}" width="232" height="232" alt="QR de acceso personal. Consulta tu gafete si no puedes ver esta imagen." style="display:block;width:232px;max-width:100%;height:auto;border:0;background:#ffffff">
<h2 style="margin:20px 0 8px;font-size:22px;line-height:1.4;overflow-wrap:anywhere">${escape(job.name)}</h2>
<p style="margin:0;font-size:13px;line-height:1.8">${escape(date)}<br>${job.startsAt ? 'Horario de Ciudad de México<br>' : ''}${escape(venue)}</p>
<p style="margin:24px 0 0;padding-top:20px;border-top:1px dashed #deccbd;font-size:13px;line-height:1.7">Muestra este QR al personal de acceso.<br>Guárdalo en tu celular antes de llegar.<br>También puedes descargar el <strong>gafete PDF adjunto</strong>.</p>
</td></tr></table>
<table role="presentation" cellspacing="0" cellpadding="0" style="margin:26px auto 0"><tr><td align="center" bgcolor="#24160f" style="border-radius:6px"><a href="${site}/#acceso" style="display:inline-block;padding:17px 26px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold">Consultar mi gafete →</a></td></tr></table>
<p style="margin:20px 0 0;font-size:12px;line-height:1.7;text-align:center">Tu QR es personal. No lo compartas.</p>
</td></tr><tr><td style="padding:24px 28px;background:#fffcf8;font-size:11px;line-height:1.8;color:#716257">Ideas. Personas. Nuevas posibilidades.<br>Este correo confirma tu registro en ${escape(job.eventName)}.<br>Este buzón no recibe respuestas.</td></tr></table>
</td></tr></table></body></html>`;
  return { subject, html, text };
}
