import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createTestDatabase } from './helpers.mjs';

let db;
before(async () => { db = await createTestDatabase(); });
after(async () => { await db?.close(); });

async function asRole(role, action) {
  await db.exec(`set role ${role}`);
  try { return await action(); } finally { await db.exec('reset role'); }
}
function inputs(overrides = {}) {
  return { firstName: ' Mariana ', lastName: ' García ', secondLastName: ' López ', email: `${randomUUID()}@example.com`, code: randomBytes(16).toString('hex'), ...overrides };
}
async function register(data) {
  const result = await db.query('select public.register_attendee_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) as value',
    ['los-didis-2026', data.firstName, data.lastName, data.secondLastName, data.email, data.email, data.code, '', '', '', '', true, 'test-v1']);
  return result.rows[0].value;
}
async function get(data) {
  const result = await db.query('select public.get_registration($1,$2,$3) as value', ['los-didis-2026', data.email, data.code]);
  return result.rows[0].value;
}

test('a public registration persists a single pass and a pending email; retries keep the same QR', async () => {
  const data = inputs();
  const first = await asRole('anon', () => register(data));
  const second = await asRole('anon', () => register(data));
  assert.deepEqual(second, first);
  assert.equal(first.firstName, 'Mariana');
  assert.match(first.qrToken, /^[a-f0-9]{64}$/);
  assert.equal(first.isTest, true);
  assert.equal(first.access_hash, undefined);
  const { rows } = await db.query(`select r.access_hash, count(p.id)::int as passes, count(m.id)::int as emails,
    min(m.status) as status from public.registrations r
    join public.passes p on p.registration_id = r.id
    join public.email_deliveries m on m.pass_id = p.id
    where r.id = $1 group by r.access_hash`, [first.id]);
  assert.equal(rows[0].passes, 1);
  assert.equal(rows[0].emails, 1);
  assert.equal(rows[0].status, 'pending_setup');
  assert.notEqual(rows[0].access_hash, data.code);
});

test('duplicate normalized email with a different code does not reveal or overwrite the original pass', async () => {
  const data = inputs();
  const first = await asRole('anon', () => register(data));
  await assert.rejects(asRole('anon', () => register({ ...data, email: ` ${data.email.toUpperCase()} `, code: randomBytes(16).toString('hex'), firstName:'Other' })), /REGISTRATION_EXISTS/);
  const original = await asRole('anon', () => get(data));
  assert.equal(original.id, first.id);
  assert.equal(original.firstName, 'Mariana');
});

test('recovery needs the email and private code; knowing the QR or email alone grants no access', async () => {
  const data = inputs();
  const record = await asRole('anon', () => register(data));
  assert.equal((await asRole('anon', () => get({ ...data, email: data.email.toUpperCase() }))).id, record.id);
  for (const code of ['', record.qrToken, record.qrToken.slice(0, 32), randomBytes(16).toString('hex')]) {
    await assert.rejects(asRole('anon', () => get({ ...data, code })), /INVALID_ACCESS/);
  }
  await assert.rejects(asRole('anon', () => get({ ...data, email:'another@example.com' })), /INVALID_ACCESS/);
});

test('server-side validation rejects invalid fields, short codes, and overlong values', async () => {
  for (const change of [{ firstName:' ' }, { email:'invalid' }, { code:'1234' }, { firstName:'x'.repeat(81) }, { secondLastName:'x'.repeat(81) }]) {
    await assert.rejects(asRole('anon', () => register(inputs(change))), /INVALID_REGISTRATION/);
  }
});

test('anonymous and authenticated clients cannot list or mutate application tables', async () => {
  const tables = ['events', 'registrations', 'passes', 'event_staff', 'scan_logs', 'check_ins', 'email_deliveries'];
  for (const role of ['anon', 'authenticated']) {
    for (const table of tables) {
      for (const query of [`select * from public.${table}`, `insert into public.${table} default values`, `delete from public.${table}`]) {
        await assert.rejects(asRole(role, () => db.query(query)), /permission denied/);
      }
    }
    await assert.rejects(asRole(role, () => db.query("update public.events set is_test = false")), /permission denied/);
  }
  const result = await db.query("select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relname = any($1)", [tables]);
  assert.equal(result.rows.length, tables.length);
  assert.ok(result.rows.every(row => row.relrowsecurity));
});

test('looking up a pass never records attendance', async () => {
  const data = inputs();
  await asRole('anon', () => register(data));
  await asRole('anon', () => get(data));
  await asRole('anon', () => get(data));
  const scans = await db.query('select count(*)::int as n from public.scan_logs');
  const checkIns = await db.query('select count(*)::int as n from public.check_ins');
  assert.equal(scans.rows[0].n, 0);
  assert.equal(checkIns.rows[0].n, 0);
});

test('closed registration rejects new attendees but a saved request can still retrieve its result', async () => {
  const data = inputs();
  const record = await asRole('anon', () => register(data));
  await db.exec("update public.events set registration_open = false where slug = 'los-didis-2026'");
  try {
    await assert.rejects(asRole('anon', () => register(inputs())), /REGISTRATION_CLOSED/);
    assert.equal((await asRole('anon', () => register(data))).id, record.id);
  } finally { await db.exec("update public.events set registration_open = true where slug = 'los-didis-2026'"); }
});

test('a revoked pass cannot be reactivated through registration or recovered', async () => {
  const data = inputs();
  const record = await asRole('anon', () => register(data));
  await db.query("update public.passes set status = 'revoked' where id = $1", [record.passId]);
  await assert.rejects(asRole('anon', () => register(data)), /PASS_UNAVAILABLE/);
  await assert.rejects(asRole('anon', () => get(data)), /INVALID_ACCESS/);
});

test('database constraints allow scan history but only one check-in per pass', async () => {
  const data = inputs();
  const record = await asRole('anon', () => register(data));
  const eventId = (await db.query("select id from public.events where slug = 'los-didis-2026'")).rows[0].id;
  const operator = randomUUID();
  await db.query('insert into auth.users(id) values ($1)', [operator]);
  await db.query("insert into public.event_staff(event_id, user_id, role) values ($1,$2,'scanner')", [eventId, operator]);
  const scan = await db.query("insert into public.scan_logs(event_id,pass_id,operator_id,result) values ($1,$2,$3,'accepted') returning id", [eventId,record.passId,operator]);
  await db.query('insert into public.check_ins(pass_id,event_id,scan_id) values ($1,$2,$3)', [record.passId,eventId,scan.rows[0].id]);
  const repeated = await db.query("insert into public.scan_logs(event_id,pass_id,operator_id,result) values ($1,$2,$3,'duplicate') returning id", [eventId,record.passId,operator]);
  await assert.rejects(db.query('insert into public.check_ins(pass_id,event_id,scan_id) values ($1,$2,$3)', [record.passId,eventId,repeated.rows[0].id]), /duplicate key/);
  assert.equal((await db.query('select count(*)::int as n from public.check_ins where pass_id = $1', [record.passId])).rows[0].n, 1);
});
