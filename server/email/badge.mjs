import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'node:url';
const asset = name => fileURLToPath(new URL(`../../public/brand/${name}`,import.meta.url));
const font = fileURLToPath(new URL('../../node_modules/@fontsource/manrope/files/manrope-latin-400-normal.woff',import.meta.url));

export function createBadgePdf(job, qr) {
  return new Promise((resolve,reject)=>{
    const doc=new PDFDocument({size:[420,650],margin:0,font,info:{Title:'Gafete Los DiDis 2026',Author:'Los DiDis'}});
    const chunks=[];
    doc.on('data',chunk=>chunks.push(chunk));
    doc.on('error',reject);
    doc.on('end',()=>resolve(Buffer.concat(chunks)));
    doc.image(asset('los-didis-background.jpg'),0,0,{width:420,height:650});
    doc.image(asset('los-didis-logo-white.png'),30,28,{width:145});
    doc.fillColor('#24160f').fontSize(25).text('Tu gafete de acceso',30,97,{width:360});
    doc.roundedRect(26,145,368,433,12).fill('#fffcf8');
    doc.fillColor('#24160f').fontSize(9);
    // Explicit positions keep the QR quiet zone clear on every badge.
    doc.text(job.isTest?'PASE DE PRUEBA · SIN VALIDEZ DE ENTRADA':'GAFETE PERSONAL',40,166,{width:340,align:'center'});
    doc.image(qr,100,190,{width:220,height:220});
    const name=job.name.replace(/[\r\n]+/g,' ');
    let size=20;
    while(size>9 && doc.fontSize(size).heightOfString(name,{width:320})>65)size--;
    doc.fontSize(size).text(name,50,421,{width:320,height:70,align:'center'});
    const date=job.startsAt?new Intl.DateTimeFormat('es-MX',{dateStyle:'long',timeStyle:'short',timeZone:'America/Mexico_City'}).format(new Date(job.startsAt)):'Fecha y hora por confirmar';
    doc.fontSize(11).text(date,50,498,{width:320,align:'center'});
    doc.fontSize(9).text(job.startsAt?'Horario de Ciudad de México':'',50,519,{width:320,align:'center'});
    const venue=job.venue||'Sede por confirmar';
    let venueSize=11;
    while(venueSize>7 && doc.fontSize(venueSize).heightOfString(venue,{width:320})>36)venueSize--;
    doc.fontSize(venueSize).text(venue,50,536,{width:320,height:36,align:'center'});
    if (job.passId) doc.fontSize(8).text(`Folio: ${job.passId.slice(0,8).toUpperCase()} · ID: ${job.passId}`,30,580,{width:360,align:'center'});
    doc.fontSize(10).text('Guarda este PDF y muestra el QR al ingresar.\nTu QR es personal. No lo compartas.',30,595,{width:360,align:'center',lineGap:4});
    doc.end();
  });
}
