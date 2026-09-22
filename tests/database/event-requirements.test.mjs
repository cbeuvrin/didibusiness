import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createTestDatabase, rpcStatement } from './helpers.mjs';
let db;
let eventId;
before(async () => {
  db = await createTestDatabase();
  eventId = (await db.query("select id from public.events where slug='los-didis-2026'")).rows[0].id;
});
after(async () => { await db?.close(); });
const body = overrides => ({p_event_slug:'los-didis-2026',p_first_name:'Ana',p_last_name:'',p_second_last_name:'',p_email:`${randomUUID()}@example.com`,p_access_code:randomBytes(16).toString('hex'),p_phone:'+52 55 1234 5678',p_state:'Ciudad de México',p_extra_1:'Respuesta uno',p_extra_2:'Respuesta dos',p_privacy_accepted:true,p_privacy_version:'test-v1',...overrides});
async function call(name, args, user = null) {
  await db.exec('begin');
  try {
    await db.exec(`set local role ${user ? 'authenticated' : 'anon'}`);
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [user || '']);
    const result = await db.query(...rpcStatement(name,args));
    await db.exec('commit');
    return result.rows[0].value;
  } catch (error) { await db.exec('rollback'); throw error; }
}
async function register(overrides={}) {
  const args=body(overrides); args.p_confirm_email ??= args.p_email;
  return {args,record:await call('register_attendee_v2',args)};
}
async function user(email, staff=false, confirmed=true) {
  const id=randomUUID();
  await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,$3)',[id,email,confirmed ? new Date().toISOString() : null]);
  if(staff) await db.query("insert into public.event_staff(event_id,user_id,role) values($1,$2,'scanner')",[eventId,id]);
  return id;
}
const scan = (token,request=randomUUID()) => ({p_event_slug:'los-didis-2026',p_qr_token:token,p_request_id:request});

test('registration accepts only a name and confirmed email, stores optional answers and consent evidence',async()=>{
  const {record}=await register();
  assert.equal(record.lastName,'');
  const saved=(await db.query('select * from public.registrations where id=$1',[record.id])).rows[0];
  assert.equal(saved.phone,'+52 55 1234 5678'); assert.equal(saved.state,'Ciudad de México');
  assert.equal(saved.extra_1,'Respuesta uno'); assert.equal(saved.extra_2,'Respuesta dos');
  assert.ok(saved.privacy_accepted_at); assert.equal(saved.privacy_notice_version,'test-v1');
  assert.equal(saved.privacy_notice_url,'https://example.com/privacidad');
});
test('missing mandatory fields, a different confirmation, or missing/current consent are rejected',async()=>{
  for(const fields of [{p_first_name:''},{p_email:''},{p_confirm_email:''},{p_confirm_email:'different@example.com'},{p_privacy_accepted:false},{p_privacy_accepted:null},{p_privacy_version:'old'}]){
    await assert.rejects(register(fields),/INVALID_REGISTRATION|PRIVACY_REQUIRED/);
  }
  await db.exec('update public.events set privacy_notice_url=null');
  try { await assert.rejects(register(),/PRIVACY_NOT_CONFIGURED/); }
  finally { await db.exec("update public.events set privacy_notice_url='https://example.com/privacidad'"); }
});
test('legacy registration is revoked so it cannot bypass privacy acceptance',async()=>{
  await db.exec('set role anon');
  try { await assert.rejects(db.query("select public.register_attendee('los-didis-2026','Ana','López','','a@example.com','0123456789abcdef0123456789abcdef')"),/permission denied/); }
  finally { await db.exec('reset role'); }
});
test('email login retrieves only the verified account’s badge; it never records a check-in',async()=>{
  const {args,record}=await register();
  const owner=await user(args.p_email);
  const stranger=await user('other@example.com');
  const unverified=await user(args.p_email,false,false);
  assert.equal((await call('get_my_registration',{p_event_slug:'los-didis-2026'},owner)).id,record.id);
  await assert.rejects(call('get_my_registration',{p_event_slug:'los-didis-2026'},stranger),/PASS_NOT_FOUND/);
  await assert.rejects(call('get_my_registration',{p_event_slug:'los-didis-2026'},unverified),/EMAIL_VERIFICATION_REQUIRED/);
  await assert.rejects(call('get_my_registration',{p_event_slug:'los-didis-2026'}),/permission denied/);
  assert.equal((await db.query('select count(*)::int n from public.check_ins where pass_id=$1',[record.passId])).rows[0].n,0);
});
test('only enabled staff can scan or read attendance; an arbitrary signed-in account cannot',async()=>{
  const {record}=await register();
  const stranger=await user('not-staff@example.com');
  await assert.rejects(call('record_check_in',scan(record.qrToken)),/permission denied/);
  await assert.rejects(call('record_check_in',scan(record.qrToken),stranger),/STAFF_REQUIRED/);
  await assert.rejects(call('get_attendance_log',{p_event_slug:'los-didis-2026',p_offset:0},stranger),/STAFF_REQUIRED/);
  const operator=await user('disabled@example.com',true);
  await db.query('update public.event_staff set enabled=false where user_id=$1',[operator]);
  await assert.rejects(call('record_check_in',scan(record.qrToken),operator),/STAFF_REQUIRED/);
});
test('staff scans record server time, retries are idempotent, and a second operator sees a duplicate',async()=>{
  const {record}=await register();
  const firstOperator=await user('first@example.com',true);
  const secondOperator=await user('second@example.com',true);
  const request=scan(record.qrToken);
  const first=await call('record_check_in',request,firstOperator);
  assert.equal(first.result,'accepted'); assert.equal(first.name,'Ana'); assert.ok(first.checkedInAt);
  assert.deepEqual(await call('record_check_in',request,firstOperator),first);
  const repeated=await call('record_check_in',scan(record.qrToken),secondOperator);
  assert.equal(repeated.result,'duplicate'); assert.equal(repeated.checkedInAt,first.checkedInAt);
  await assert.rejects(call('record_check_in',request,secondOperator),/INVALID_SCAN/);
  const log=await call('get_attendance_log',{p_event_slug:'los-didis-2026',p_offset:0},firstOperator);
  assert.equal(log.attended,1); assert.equal(log.scans,2); assert.equal(log.entries.length,2);
});
test('invalid/revoked scans are logged without creating an attendance; closed access rejects new scans',async()=>{
  const operator=await user('checks@example.com',true);
  const {record}=await register();
  await db.query("update public.passes set status='revoked' where id=$1",[record.passId]);
  assert.equal((await call('record_check_in',scan(record.qrToken),operator)).result,'revoked');
  assert.equal((await call('record_check_in',scan('f'.repeat(64)),operator)).result,'invalid');
  assert.equal((await db.query('select count(*)::int n from public.check_ins where pass_id=$1',[record.passId])).rows[0].n,0);
  await db.exec('update public.events set access_open=false');
  try { await assert.rejects(call('record_check_in',scan('e'.repeat(64)),operator),/ACCESS_CLOSED/); }
  finally { await db.exec('update public.events set access_open=true'); }
});
