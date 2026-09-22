import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createTestDatabase} from './helpers.mjs';
test('folio lookup is staff-only and refuses ambiguous prefixes without recording attendance',async()=>{
 const db=await createTestDatabase();
 try{
  const user='00000000-0000-4000-8000-000000000001';
  await db.exec(`insert into auth.users(id,email,email_confirmed_at) values('${user}','staff@example.invalid',now()); insert into event_staff(event_id,user_id,role) select id,'${user}','scanner' from events; select set_config('request.jwt.claim.sub','${user}',false)`);
  for(let i=1;i<=2;i++){
   const pass=(await db.query("select register_attendee_v2('los-didis-2026','Persona','','',$1,$1,$2,'','','','',true,'test-v1') as p",[`test${i}@example.invalid`,String(i).repeat(32)])).rows[0].p;
   await db.query('delete from email_deliveries where pass_id=$1',[pass.passId]);
   await db.query('update passes set id=$1 where id=$2',[`abcdef00-0000-4000-8000-00000000000${i}`,pass.passId]);
  }
  await db.exec('set role anon');
  await assert.rejects(db.query("select lookup_pass_by_folio('los-didis-2026','abcdef00')"),/permission denied/);
  await db.exec('reset role; set role authenticated');
  await assert.rejects(db.query("select lookup_pass_by_folio('los-didis-2026','abcdef00')"),/FOLIO_AMBIGUOUS/);
  await assert.rejects(db.query("select lookup_pass_by_folio('los-didis-2026','notvalid')"),/INVALID_FOLIO/);
  await assert.rejects(db.query("select lookup_pass_by_folio('los-didis-2026','ffffffff')"),/FOLIO_NOT_FOUND/);
  const found=(await db.query("select lookup_pass_by_folio('los-didis-2026','ABCDEF00-0000-4000-8000-000000000001') as p")).rows[0].p;
  assert.equal(found.name,'Persona');assert.equal(found.checkedInAt,null);
  await db.exec('reset role; update event_staff set enabled=false; set role authenticated');
  await assert.rejects(db.query("select lookup_pass_by_folio('los-didis-2026','abcdef00')"),/STAFF_REQUIRED/);
  await db.exec('reset role');
  assert.equal((await db.query('select count(*)::int as n from check_ins')).rows[0].n,0);
 }finally{await db.close();}
});
