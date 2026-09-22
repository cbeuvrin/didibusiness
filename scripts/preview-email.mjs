import { mkdir,writeFile } from 'node:fs/promises';
import QRCode from 'qrcode';
import { createBadgePdf } from '../server/email/badge.mjs';
import { registrationEmail } from '../server/email/template.mjs';
const job={name:'Mariana López García',eventName:'Los DiDis 2026',isTest:true,startsAt:null,venue:null};
// Deliberately not an event token: this preview can never grant entry.
const qrSrc=await QRCode.toDataURL('LOS-DIDIS-PREVIEW-NOT-A-PASS',{width:464,margin:4});
const {html}=registrationEmail(job,{qrSrc,siteUrl:'http://127.0.0.1:5173'});
await mkdir('test-results',{recursive:true});
await writeFile('test-results/registration-email.html',html);
console.log('Vista previa: test-results/registration-email.html (no envía correos).');

await writeFile('test-results/gafete-los-didis.pdf',await createBadgePdf(job,Buffer.from(qrSrc.split(',')[1],'base64')));
