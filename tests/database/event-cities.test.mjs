import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID, randomBytes} from 'node:crypto';
import {createTestDatabase, rpcStatement} from './helpers.mjs';

test('city passes, staff permissions, email jobs and attendance stay isolated', async()=>{
 const db=await createTestDatabase();
 try {
  const cities=['los-didis-2026-guadalajara','los-didis-2026-monterrey','los-didis-2026-cdmx'];
  await db.exec('update public.events set registration_email_enabled=true');
  const passes=[];
  for(const slug of cities){
   const args={p_event_slug:slug,p_first_name:'Ana',p_last_name:'',p_second_last_name:'',p_email:'ana@example.invalid',p_confirm_email:'ana@example.invalid',p_access_code:randomBytes(16).toString('hex'),p_phone:'',p_state:'',p_extra_1:'',p_extra_2:'',p_privacy_accepted:true,p_privacy_version:'test-v1'};
   const pass=(await db.query(...rpcStatement('register_attendee_v2',args))).rows[0].value;
   assert.equal(pass.eventSlug,slug); assert.ok(pass.city); assert.equal(pass.eventDate,{'los-didis-2026-guadalajara':'2026-10-08','los-didis-2026-monterrey':'2026-10-13','los-didis-2026-cdmx':'2026-10-16'}[slug]);
   assert.deepEqual((await db.query(...rpcStatement('get_registration',args))).rows[0].value,pass);
   passes.push(pass);
  }
  assert.equal(new Set(passes.map(p=>p.qrToken)).size,3);
  const owner=randomUUID(),staff=randomUUID(),stranger=randomUUID();
  for(const [id,email] of [[owner,'ana@example.invalid'],[staff,'staff@example.invalid'],[stranger,'stranger@example.invalid']]){
   await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[id,email]);
  }
  const asUser=async(id,name,args={})=>{
   await db.exec('begin; set local role authenticated');
   try {
    await db.query("select set_config('request.jwt.claim.sub',$1,true)",[id]);
    const result=(await db.query(...rpcStatement(name,args))).rows[0].value;
    await db.exec('commit');return result;
   } catch(error){await db.exec('rollback');throw error;}
  };
  assert.equal((await asUser(owner,'get_my_registrations')).length,3);
  assert.deepEqual(await asUser(stranger,'get_my_registrations'),[]);
  assert.deepEqual(await asUser(owner,'get_staff_events'),[]);
  await db.query("insert into event_staff(event_id,user_id,role) select id,$1,'scanner' from events where slug=$2",[staff,cities[0]]);
  assert.deepEqual((await asUser(staff,'get_staff_events')).map(e=>e.slug),[cities[0]]);
  await assert.rejects(asUser(staff,'get_staff_access',{p_event_slug:cities[1]}),/STAFF_REQUIRED/);
  const scan=token=>({p_event_slug:cities[0],p_qr_token:token,p_request_id:randomUUID()});
  assert.equal((await asUser(staff,'record_check_in',scan(passes[1].qrToken))).result,'invalid');
  assert.equal((await asUser(staff,'record_check_in',scan(passes[0].qrToken))).result,'accepted');
  const log=await asUser(staff,'get_attendance_log',{p_event_slug:cities[0]});
  assert.equal(log.registered,1); assert.equal(log.attended,1);
  await assert.rejects(asUser(staff,'lookup_pass_by_folio',{p_event_slug:cities[0],p_folio:passes[1].passId}),/FOLIO_NOT_FOUND/);
  for(let i=0;i<3;i++){
   const job=(await db.query('select claim_registration_email() as job')).rows[0].job;
   const pass=passes.find(p=>p.passId===job.passId);
   assert.equal(job.slug,pass.eventSlug);assert.equal(job.city,pass.city);assert.equal(job.dayLabel,pass.dayLabel);assert.equal(job.eventDate,pass.eventDate);
  }
  await db.exec('set role anon');
  await assert.rejects(db.query('select get_my_registrations()'),/permission denied/);
  await assert.rejects(db.query('select get_staff_events()'),/permission denied/);
  await assert.rejects(db.query("select pass_event_details('los-didis-2026-guadalajara')"),/permission denied/);
 }finally{await db.close();}
});
