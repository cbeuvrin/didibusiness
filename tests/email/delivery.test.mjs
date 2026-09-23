import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registrationEmail} from '../../server/email/template.mjs';
import {buildPayload,deliverOne} from '../../server/email/worker.mjs';
import {authorized} from '../../api/cron/registration-emails.js';
const job={passId:'abcdef00-0000-4000-8000-000000000001',id:'delivery-1',lease:'lease-1',name:'Mariana <script>alert(1)</script>',email:'test@example.invalid',slug:'los-didis-2026',qrToken:'a'.repeat(64),eventName:'Los DiDis 2026',isTest:true,startsAt:null,venue:null};

test('branded template escapes user text, uses real assets and does not invent event details',()=>{
 const mail=registrationEmail(job);
 assert.ok(mail.html.includes('los-didis-background.jpg'));
 assert.ok(mail.html.includes('los-didis-logo-white.png'));
 assert.ok(mail.html.includes('&lt;script&gt;'));
 assert.ok(!mail.html.includes('<script>'));
 assert.ok(mail.html.includes('Fecha y hora por confirmar'));
 assert.ok(mail.html.includes('Sede por confirmar'));
 assert.ok(mail.html.includes('PASE DE PRUEBA'));
 assert.ok(mail.html.includes('cid:entry-qr'));
 assert.ok(mail.html.includes('Folio: ABCDEF00'));
 assert.ok(mail.text.includes(job.passId));
 assert.ok(mail.text.includes('https://losdidis2026.com/#acceso'));
});
test('payload has an embedded PNG QR without sending the private recovery credential',async()=>{
 const payload=await buildPayload(job);
 assert.equal(payload.attachments[0].content_id,'entry-qr');
 assert.equal(Buffer.from(payload.attachments[0].content,'base64').subarray(1,4).toString(),'PNG');
 const pdf=payload.attachments.find(a=>a.content_type==='application/pdf');
 assert.ok(pdf);assert.equal(pdf.content_id,undefined);
 const bytes=Buffer.from(pdf.content,'base64');
 assert.equal(bytes.subarray(0,5).toString(),'%PDF-');
 assert.equal((bytes.toString('latin1').match(/\/Type \/Page\b/g)||[]).length,1);
 assert.equal(payload.from,'Los DiDis <registro@losdidis2026.com>');
 assert.deepEqual(payload.to,[job.email]);
 assert.ok(!JSON.stringify(payload).includes('accessCode'));
});
test('worker persists payload before sending and reuses it on retry',async()=>{
 let stored,attempt=0,finished=[];const sent=[];
 const rpc=async(name,body)=>{
  if(name==='claim_registration_email')return {...job,payload:stored};
  if(name==='prepare_registration_email'){stored=body.p_payload;return stored;}
  finished.push(body);return true;
 };
 const fetcher=async(url,options)=>{
  assert.ok(stored);sent.push(options);
  if(attempt++===0)throw new Error('lost response');
  return new Response(JSON.stringify({id:'provider-1'}),{status:200});
 };
 assert.equal(await deliverOne({rpc,fetcher,apiKey:'test'}),'retry');
 assert.equal(finished[0].p_provider_id,null);
 assert.equal(await deliverOne({rpc,fetcher,apiKey:'test'}),'sent');
 assert.equal(sent[0].body,sent[1].body);
 assert.equal(sent[0].headers['Idempotency-Key'],sent[1].headers['Idempotency-Key']);
 assert.equal(finished[1].p_provider_id,'provider-1');
});
test('permanent provider errors fail without claiming delivery',async()=>{
 let outcome;
 const rpc=async(name,body)=>name==='claim_registration_email'?{...job,payload:{subject:'test'}}:(outcome=body,true);
 assert.equal(await deliverOne({rpc,apiKey:'test',fetcher:async()=>new Response('{}',{status:403})}),'failed');
 assert.equal(outcome.p_retry,false);assert.equal(outcome.p_provider_id,null);
});
test('cron denies public requests and requires the exact configured secret',()=>{
 const secret='a'.repeat(40);
 assert.equal(authorized(undefined,secret),false);
 assert.equal(authorized('Bearer '+secret,undefined),false);
 assert.equal(authorized('Bearer '+secret+'x',secret),false);
 assert.equal(authorized('Bearer '+secret,secret),true);
});
