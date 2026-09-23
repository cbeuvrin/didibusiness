import { test, expect } from './backend';

async function fillRegistration(page, email='mariana@example.com') {
  await page.goto('/#registro');
  await page.getByLabel('Elige el evento').selectOption('los-didis-2026-guadalajara');
  await page.getByLabel('Nombre(s)',{exact:true}).fill('Mariana');
  await page.getByLabel('Correo electrónico',{exact:true}).fill(email);
  await page.getByLabel('Confirmar correo electrónico').fill(email);
  await page.getByRole('checkbox').check();
}
async function submitRegistration(page) {
  await page.getByRole('button',{name:'Registrarme',exact:true}).click();
  await expect(page.getByRole('heading',{level:1})).toContainText('Mariana');
  await expect(page.getByRole('img',{name:'Código QR de tu pase personal'})).toBeVisible();
}

test('register with optional fields, validate email, download a badge and reload',async({page})=>{
  await fillRegistration(page);
  await expect(page.getByLabel('Apellido paterno',{exact:false})).not.toHaveAttribute('required');
  await page.getByLabel('Teléfono',{exact:false}).fill('+52 55 1234 5678');
  await page.getByLabel('Estado',{exact:false}).fill('Ciudad de México');
  await page.getByLabel('Confirmar correo electrónico').fill('otro@example.com');
  await page.getByRole('button',{name:'Registrarme',exact:true}).click();
  await expect(page.getByText('Los correos no coinciden.',{exact:false})).toBeVisible();
  await page.getByLabel('Confirmar correo electrónico').fill('MARIANA@example.com');
  await page.screenshot({path:'test-results/desktop-register.png',fullPage:true});
  await submitRegistration(page);
  await expect(page.getByText('Tu código privado de consulta')).toHaveCount(0);
  const badge=page.getByRole('region',{name:'Tu pase de acceso'});
  await expect(badge).toContainText('8 de octubre de 2026');
  await expect(badge).toContainText('Salón Benavento');
  await page.screenshot({path:'test-results/desktop-pass.png',fullPage:true});
  const downloadEvent=page.waitForEvent('download');
  await page.getByRole('button',{name:'Descargar mi gafete'}).click();
  const download=await downloadEvent;
  await download.saveAs('test-results/downloaded-pass.png');
  await page.reload();
  await expect(page.getByRole('heading',{level:1})).toContainText('Mariana');
  await page.getByRole('button',{name:'Cerrar sesión'}).click();
  await expect(page.getByRole('link',{name:'Ya estoy registrado'})).toBeVisible();
});

test('login asks only for email and a magic link opens the same badge on another device',async({page,browser,backend})=>{
  await fillRegistration(page); await submitRegistration(page);
  const originalQr=await page.getByRole('img',{name:'Código QR de tu pase personal'}).getAttribute('src');
  await page.getByRole('button',{name:'Cerrar sesión'}).click();
  await page.getByRole('link',{name:'Ya estoy registrado'}).click();
  await expect(page.locator('form input')).toHaveCount(1);
  await page.getByLabel('Correo electrónico',{exact:true}).fill('MARIANA@example.com');
  await page.getByRole('button',{name:'Enviar enlace de acceso'}).click();
  await expect(page.getByRole('heading',{name:'Revisa tu correo'})).toBeVisible();
  expect(backend.sentEmails[0].email).toBe('mariana@example.com');
  const other=await browser.newContext(); await backend.attachContext(other);
  try {
    const next=await other.newPage();
    await next.goto(await backend.magicLink('mariana@example.com'));
    await expect(next.getByRole('img',{name:'Código QR de tu pase personal'})).toHaveAttribute('src',originalQr);
  }finally{await other.close();}
});

test('email delivery errors do not claim that a link was sent',async({page,backend})=>{
  backend.smtpError=true;
  await page.goto('/#acceso');
  await page.getByLabel('Correo electrónico',{exact:true}).fill('mariana@example.com');
  await page.getByRole('button',{name:'Enviar enlace de acceso'}).click();
  await expect(page.getByRole('alert')).toContainText('No pudimos enviar');
  await expect(page.getByRole('heading',{name:'Revisa tu correo'})).toHaveCount(0);
});

test('missing privacy notice leaves fields reviewable but does not fabricate consent or accept a registration',async({page,backend})=>{
  await backend.setPrivacy(false);
  await page.goto('/#registro');
  await page.getByLabel('Elige el evento').selectOption('los-didis-2026-guadalajara');
  await expect(page.getByText('Aviso de privacidad pendiente de publicación.',{exact:false})).toBeVisible();
  await expect(page.getByRole('checkbox')).toBeDisabled();
  await expect(page.getByRole('button',{name:'Registrarme',exact:true})).toBeDisabled();
  await expect(page.getByLabel('Nombre(s)',{exact:true})).toBeVisible();
});

test('a lost registration response reuses the same credential and pass',async({page,backend})=>{
  await fillRegistration(page); backend.dropNextRegistrationResponse=true;
  await page.getByRole('button',{name:'Registrarme',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Revisa tu conexión');
  await submitRegistration(page);
  const requests=backend.requests.filter(r=>r.name==='register_attendee_v2');
  expect(requests).toHaveLength(2);
  expect(requests[0].body.p_access_code).toBe(requests[1].body.p_access_code);
});

test('a temporary recovery failure preserves the session and supports retry',async({page,backend})=>{
  await fillRegistration(page); await submitRegistration(page);
  backend.failRecovery=true; await page.reload();
  await expect(page.getByRole('heading',{level:1})).toContainText('No pudimos recuperar');
  backend.failRecovery=false; await page.getByRole('button',{name:'Reintentar'}).click();
  await expect(page.getByRole('heading',{level:1})).toContainText('Mariana');
});

test('mobile form, badge and email login fit the viewport',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await fillRegistration(page);
  await page.screenshot({path:'test-results/mobile-register.png',fullPage:true});
  await submitRegistration(page);
  await page.screenshot({path:'test-results/mobile-pass.png',fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole('button',{name:'Cerrar sesión'}).click();
  await page.goto('/#acceso');
  await expect(page.getByRole('button',{name:'Enviar enlace de acceso'})).toBeVisible();
});

test('authorized staff validate a QR, retain the first entry time and retry a lost response safely',async({page,backend})=>{
  await fillRegistration(page); await submitRegistration(page);
  const qr=`los-didis:v1:${backend.lastPass.eventSlug}:${backend.lastPass.qrToken}`;
  await page.goto(await backend.magicLink('staff@example.com',{staff:true}));
  await expect(page.getByRole('heading',{name:'Control de acceso',exact:true})).toBeVisible();
  await page.getByLabel('Contenido del QR (lector externo)').fill(qr);
  backend.dropNextScanResponse=true;
  await page.getByRole('button',{name:'Validar QR',exact:true}).click();
  await expect(page.getByRole('button',{name:'Reintentar esta lectura'})).toBeVisible();
  await expect(page.locator('.scan-result-accepted')).toHaveCount(0);
  await page.getByRole('button',{name:'Reintentar esta lectura'}).click();
  await expect(page.locator('.scan-result')).toContainText('Entrada registrada');
  const firstTime=await page.locator('.scan-result p').nth(1).innerText();
  await page.getByLabel('Contenido del QR (lector externo)').fill(qr);
  await page.getByRole('button',{name:'Validar QR',exact:true}).click();
  await expect(page.locator('.scan-result')).toContainText('Este gafete ya ingresó');
  await expect(page.locator('.scan-result p').nth(1)).toHaveText(firstTime);
  const requests=backend.requests.filter(r=>r.name==='record_check_in');
  expect(requests[0].body.p_request_id).toBe(requests[1].body.p_request_id);
  await expect(page.locator('.attendance-totals div').nth(1)).toContainText('1');
  await expect(page.locator('.attendance-totals div').nth(2)).toContainText('2');
  await page.screenshot({path:'test-results/staff-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/staff-mobile.png',fullPage:true});
});

test('an ordinary authenticated attendee cannot enter the scanner',async({page,backend})=>{
  const link=(await backend.magicLink('visitor@example.com')).replace('area=pase','area=personal');
  await page.goto(link);
  await expect(page.getByText('Tu cuenta no tiene acceso al control de entradas.')).toBeVisible();
  await expect(page.getByRole('button',{name:'Activar cámara'})).toHaveCount(0);
});

test('offline staff cannot submit a scan',async({page,context,backend})=>{
  await page.goto(await backend.magicLink('staff@example.com',{staff:true}));
  await expect(page.getByRole('button',{name:'Activar cámara'})).toBeEnabled();
  await context.setOffline(true);
  await expect(page.getByRole('alert')).toContainText('Sin conexión');
  await expect(page.getByRole('button',{name:'Activar cámara'})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Validar QR',exact:true})).toBeDisabled();
  expect(backend.requests.filter(r=>r.name==='record_check_in')).toHaveLength(0);
  await context.setOffline(false);
});

test('the camera decoder reads the badge QR and stops the video tracks after validation',async({page,backend})=>{
  await fillRegistration(page); await submitRegistration(page);
  const source=await page.getByRole('img',{name:'Código QR de tu pase personal'}).getAttribute('src');
  await page.addInitScript(({source})=>{
    navigator.mediaDevices.getUserMedia=async()=>{
      const image=new Image(); image.src=source; await image.decode();
      const canvas=document.createElement('canvas'); canvas.width=640; canvas.height=480;
      const ctx=canvas.getContext('2d');
      const draw=()=>{ctx.fillStyle='white';ctx.fillRect(0,0,640,480);ctx.drawImage(image,110,30,420,420);};
      draw(); const stream=canvas.captureStream(10);
      window.testCameraStream=stream;
      const timer=setInterval(draw,100);
      stream.getVideoTracks()[0].addEventListener('ended',()=>clearInterval(timer));
      return stream;
    };
  },{source});
  await page.goto(await backend.magicLink('camera@example.com',{staff:true}));
  await page.getByRole('button',{name:'Activar cámara'}).click();
  await expect(page.locator('.scan-result')).toContainText('Entrada registrada',{timeout:15000});
  expect(await page.evaluate(()=>window.testCameraStream.getTracks().every(track=>track.readyState==='ended'))).toBe(true);
});

test('staff can find a folio, confirm the name and preserve duplicate protection',async({page,backend})=>{
  await fillRegistration(page); await submitRegistration(page);
  const pass=backend.lastPass;
  await page.goto(await backend.magicLink('folio-staff@example.com',{staff:true}));
  await page.getByLabel('Entrada manual por folio').fill(pass.passId.slice(0,8).toUpperCase());
  await page.getByRole('button',{name:'Buscar folio',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Verifica el nombre antes de confirmar'})).toBeVisible();
  expect(backend.requests.filter(r=>r.name==='record_check_in')).toHaveLength(0);
  await page.getByRole('button',{name:'Confirmar ingreso por folio'}).click();
  await expect(page.locator('.scan-result-accepted')).toContainText('Mariana');
  await page.getByLabel('Entrada manual por folio').fill(pass.passId);
  await page.getByRole('button',{name:'Buscar folio',exact:true}).click();
  await page.getByRole('button',{name:'Confirmar ingreso por folio'}).click();
  await expect(page.locator('.scan-result-duplicate')).toContainText('Este gafete ya ingresó');
  await expect(page.locator('.attendance-totals div').nth(1)).toContainText('1');
});

test('city links select the event and email login lets an attendee switch between their passes',async({page,backend})=>{
  await page.goto('/');
  await expect(page.locator('.event-cities article')).toHaveCount(3);
  await page.getByRole('link',{name:'Elegir evento en Monterrey',exact:true}).click();
  await expect(page.getByLabel('Elige el evento')).toHaveValue('los-didis-2026-monterrey');
  await page.getByLabel('Nombre(s)',{exact:true}).fill('Mariana');
  await page.getByLabel('Correo electrónico',{exact:true}).fill('mariana@example.com');
  await page.getByLabel('Confirmar correo electrónico').fill('mariana@example.com');
  await page.getByRole('checkbox').check();
  await submitRegistration(page);
  const monterreyQr=await page.getByRole('img',{name:'Código QR de tu pase personal'}).getAttribute('src');
  await expect(page.locator('.badge-event')).toContainText('Monterrey');
  await expect(page.locator('.badge-event')).toContainText('13 de octubre de 2026');
  await page.getByRole('button',{name:'Cerrar sesión'}).click();
  await fillRegistration(page);
  await submitRegistration(page);
  const guadalajaraQr=await page.getByRole('img',{name:'Código QR de tu pase personal'}).getAttribute('src');
  expect(guadalajaraQr).not.toBe(monterreyQr);
  await page.goto(await backend.magicLink('mariana@example.com'));
  await page.getByLabel('Consultar otro evento').selectOption({label:'Los DiDis 2026 · Monterrey'});
  await expect(page.getByRole('img',{name:'Código QR de tu pase personal'})).toHaveAttribute('src',monterreyQr);
  await expect(page.locator('.badge-event')).toContainText('Monterrey');
  await page.getByLabel('Consultar otro evento').selectOption({label:'Los DiDis 2026 · Guadalajara'});
  await expect(page.getByRole('img',{name:'Código QR de tu pase personal'})).toHaveAttribute('src',guadalajaraQr);
  await page.goto('/');
  await page.setViewportSize({width:390,height:844});
  await page.locator('.event-cities').scrollIntoViewIfNeeded();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/event-cities-mobile.png',fullPage:true});
});

test('staff switch city metrics and reject another city QR before scanning',async({page,backend})=>{
  await fillRegistration(page); await submitRegistration(page);
  const qr=`los-didis:v1:${backend.lastPass.eventSlug}:${backend.lastPass.qrToken}`;
  await page.goto(await backend.magicLink('multi-staff@example.com',{staff:true,staffEvents:['los-didis-2026-guadalajara','los-didis-2026-monterrey']}));
  await expect(page.getByLabel('Evento a controlar')).toHaveValue('los-didis-2026-guadalajara');
  await expect(page.locator('.attendance-totals div').first()).toContainText('1');
  await page.getByLabel('Evento a controlar').selectOption('los-didis-2026-monterrey');
  await expect(page.locator('.attendance-totals div').first()).toContainText('0');
  await page.getByLabel('Contenido del QR (lector externo)').fill(qr);
  await page.getByRole('button',{name:'Validar QR',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('no corresponde al evento seleccionado');
  expect(backend.requests.filter(r=>r.name==='record_check_in')).toHaveLength(0);
  await page.getByLabel('Evento a controlar').selectOption('los-didis-2026-guadalajara');
  await page.getByLabel('Contenido del QR (lector externo)').fill(qr);
  await page.getByRole('button',{name:'Validar QR',exact:true}).click();
  await expect(page.locator('.scan-result-accepted')).toBeVisible();
});
