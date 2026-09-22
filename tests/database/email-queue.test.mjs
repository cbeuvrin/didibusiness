import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createTestDatabase} from './helpers.mjs';

test('email queue is opt-in, private, leased and preserves provider retry payloads',async()=>{
 const db=await createTestDatabase();
 try {
  const seed=async(email)=>{
   return (await db.query(`select public.register_attendee_v2('los-didis-2026','Mariana','','',$1,$1,$2,'','','','',true,'test-v1') as result`,[email,'a'.repeat(32)])).rows[0].result;
  };
  const first=await seed('first@example.invalid');
  assert.equal((await db.query('select status from email_deliveries where pass_id=$1',[first.passId])).rows[0].status,'pending_setup');
  await db.exec('update events set registration_email_enabled=true');
  // Credentials must remain unique for each registration.
  await db.exec("update registrations set access_hash=repeat('b',64)");
  await seed('second@example.invalid');
  for(const role of ['anon','authenticated']) {
   await db.exec(`set role ${role}`);
   await assert.rejects(db.query('select public.claim_registration_email()'),/permission denied/);
   await db.exec('reset role');
  }
  await db.exec('set role service_role');
  const claim=async()=>(await db.query('select public.claim_registration_email() as job')).rows[0].job;
  const job=await claim();assert.equal(job.email,'second@example.invalid');
  assert.equal(await claim(),null);
  await db.query('select public.prepare_registration_email($1,$2,$3)',[job.id,job.lease,JSON.stringify({subject:'original'})]);
  await db.query('select public.prepare_registration_email($1,$2,$3)',[job.id,job.lease,JSON.stringify({subject:'changed'})]);
  await db.exec("update email_deliveries set lease_until=now()-interval '1 minute' where status='sending'");
  const retry=await claim();assert.notEqual(retry.lease,job.lease);assert.deepEqual(retry.payload,{subject:'original'});
  assert.equal((await db.query('select public.finish_registration_email($1,$2,$3,false,null) as ok',[job.id,job.lease,'wrong'])).rows[0].ok,false);
  await db.query('select public.finish_registration_email($1,$2,$3,false,null)',[retry.id,retry.lease,'provider-id']);
  assert.equal(await claim(),null);
  assert.equal((await db.query('select status from email_deliveries where id=$1',[job.id])).rows[0].status,'sent');
 } finally {await db.close();}
});

test('ambiguous email retries stop before the provider idempotency window expires',async()=>{
 const db=await createTestDatabase();
 try {
  await db.exec("update events set registration_email_enabled=true; select public.register_attendee_v2('los-didis-2026','Mariana','','','test@example.invalid','test@example.invalid',repeat('a',32),'','','','',true,'test-v1'); update email_deliveries set first_attempt_at=now()-interval '24 hours'");
  assert.equal((await db.query('select public.claim_registration_email() as job')).rows[0].job,null);
  const row=(await db.query('select status,last_error from email_deliveries')).rows[0];
  assert.equal(row.status,'failed');assert.equal(row.last_error,'REVIEW_REQUIRED');
 } finally {await db.close();}
});
