import assert from 'node:assert/strict';
import { createECDH, randomBytes, createHash } from 'node:crypto';
import pool from '../config/db.js';
import { runMedicineTick } from '../services/medicineWorker.js';
import { addDays, localParts, utcSQL } from '../services/medicineTime.js';

const root = 'http://localhost:5000/api', tag = 'medicine-test-' + Date.now(), users = [];
async function api(path, token, method = 'GET', body) {
  const response = await fetch(root + path, { signal: AbortSignal.timeout(20000), method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: response.headers.get('content-type')?.includes('application/json') ? await response.json() : await response.text() };
}
const path = '/medicine-reminders';
async function tick(options) { for (let i = 0; i < 4; i++) { await runMedicineTick(options); const [[count]] = await pool.query('SELECT COUNT(*) AS total FROM medicine_notification_jobs WHERE patient_id=?', [options.patientId]); if (count.total) return; await new Promise(r => setTimeout(r, 100)); } }
try {
  assert.equal((await api(path)).status, 401);
  const doctorLogin = await api('/auth/login', null, 'POST', { email: 'dr.yushika@medicare.com', password: 'doctor123' });
  assert.equal((await api(path, doctorLogin.body.token)).status, 403);
  const accounts = [];
  for (const n of ['a','b']) {
    const r = await api('/auth/register', null, 'POST', { name: 'Medicine Test', email: `${tag}-${n}@example.com`, password: 'medicine-test-password' });
    assert.equal(r.status, 201); accounts.push(r.body); users.push(r.body.user.id);
  }
  const [a,b] = accounts;
  const rx = { category: 'prescription', title: 'Test prescription', dosage: 'Test only', details: 'Integration fixture', recordDate: localParts(new Date(), 'UTC').date };
  await api('/health-dashboard/records', a.token, 'POST', rx); await api('/health-dashboard/records', b.token, 'POST', rx);
  const aRx = (await api('/health-dashboard', a.token)).body.records[0].id, bRx = (await api('/health-dashboard', b.token)).body.records[0].id;
  const past = new Date(Date.now() - 5 * 60000), local = localParts(past, 'UTC');
  const body = { name: '<script>Test medicine</script>', dosage: 'Original prescribed instruction', instructions: 'Fixture only', timings: [local.time], startDate: local.date, endDate: addDays(local.date, 30), timezone: 'UTC', stock: 10, unitsPerDose: 2, refillAt: 3, prescriptionId: aRx, active: true, patient_id: b.user.id };
  assert.equal((await api(path + '/plans', a.token, 'POST', { ...body, prescriptionId: bRx })).status, 400);
  assert.equal((await api(path + '/plans', a.token, 'POST', { ...body, timings: ['99:00'] })).status, 400);
  const created = await api(path + '/plans', a.token, 'POST', body); assert.equal(created.status, 201, JSON.stringify(created.body));
  const planId = created.body.id;
  // Only this newly created fixture is backdated to exercise due-dose actions immediately.
  await pool.query('UPDATE medicine_plans SET created_at=? WHERE id=? AND patient_id=?', [utcSQL(new Date(past - 60000)), planId, a.user.id]);
  const snapshot = (await api(path + '?timezone=UTC&day=' + local.date, a.token)).body;
  assert.equal(snapshot.plans.length, 1); const event = snapshot.events.find(e => e.local_date === local.date); assert.ok(event);
  assert.equal((await api(path, b.token)).body.plans.length, 0);
  assert.equal((await api(path + `/plans/${planId}`, b.token, 'PUT', body)).status, 404);
  assert.equal((await api(path + `/plans/${planId}/refill`, b.token, 'POST', { amount: 5 })).status, 404);
  assert.equal((await api(path + `/events/${event.id}`, b.token, 'PUT', { status: 'Taken' })).status, 404);
  const status = async value => { const r = await api(path + `/events/${event.id}`, a.token, 'PUT', { status: value }); assert.equal(r.status, 200, JSON.stringify(r.body)); };
  await status('Taken'); await status('Taken');
  let state = (await api(path, a.token)).body; assert.equal(state.plans[0].stock, 8);
  await status('Skipped'); assert.equal((await api(path, a.token)).body.plans[0].stock, 10);
  await status('Missed'); await status('Pending');
  await Promise.all([status('Taken'), status('Taken')]); assert.equal((await api(path, a.token)).body.plans[0].stock, 8);
  const edited = { ...body, dosage: 'Explicitly updated instruction', stock: 8 };
  assert.equal((await api(path + `/plans/${planId}`, a.token, 'PUT', edited)).status, 400);
  assert.equal((await api(path + `/plans/${planId}`, a.token, 'PUT', { ...edited, confirmDosageChange: true })).status, 200);
  state = (await api(path, a.token)).body;
  assert.equal(state.events.find(e => e.id === event.id).dosage, body.dosage, 'Historical dosage must be immutable');
  const tomorrow = (await api(path + '?timezone=UTC&day=' + addDays(local.date, 1), a.token)).body;
  const future = tomorrow.events.find(e => new Date(e.due_at) > new Date()); assert.ok(future);
  assert.equal((await api(path + `/events/${future.id}`, a.token, 'PUT', { status: 'Taken' })).status, 400);
  assert.equal((await api(path + `/plans/${planId}/refill`, a.token, 'POST', { amount: 2.5 })).status, 200);
  assert.equal((await api(path, a.token)).body.plans[0].stock, 10.5);
  assert.equal((await api(path + '/preferences', a.token, 'PUT', { emailEnabled: true })).status, 400);
  const emailToken = randomBytes(32).toString('hex');
  await pool.query('INSERT INTO medicine_preferences (patient_id, verification_hash, verification_expires) VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 15 MINUTE)) ON DUPLICATE KEY UPDATE verification_hash=VALUES(verification_hash), verification_expires=VALUES(verification_expires)', [a.user.id, createHash('sha256').update(emailToken).digest('hex')]);
  const verified = await fetch(root + path + '/verify-email?token=' + emailToken, { redirect: 'manual' }); assert.equal(verified.status, 302);
  assert.equal((await api(path + '/verify-email?token=' + emailToken)).status, 400, 'Verification tokens are single-use');
  await api(path + '/preferences', a.token, 'PUT', { emailEnabled: false });
  assert.equal((await api(path + '/push', a.token, 'POST', { subscription: { endpoint: 'http://localhost:3306' } })).status, 400);
  const keys = createECDH('prime256v1'); keys.generateKeys();
  const sub = { endpoint: `https://fcm.googleapis.com/fcm/send/${tag}`, keys: { p256dh: keys.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') } };
  assert.equal((await api(path + '/push', a.token, 'POST', { subscription: sub })).status, 200);
  assert.equal((await api(path + '/push/status', b.token, 'POST', { endpoint: sub.endpoint })).body.enabled, false);
  assert.equal((await api(path + '/push/test', b.token, 'POST', { endpoint: sub.endpoint })).status, 404);
  await api(path + '/push', b.token, 'DELETE', { endpoint: sub.endpoint });
  assert.equal((await api(path + '/push/status', a.token, 'POST', { endpoint: sub.endpoint })).body.enabled, true);
  const scheduled = { ...body, name: 'Future worker fixture', startDate: '2031-10-15', endDate: '2031-10-18', timings: ['09:00'], stock: 1, unitsPerDose: 1 };
  const futurePlan = await api(path + '/plans', a.token, 'POST', scheduled); assert.equal(futurePlan.status, 201);
  await pool.query('INSERT INTO medicine_preferences (patient_id, email_enabled, verified_email) VALUES (?, TRUE, ?) ON DUPLICATE KEY UPDATE email_enabled=TRUE, verified_email=VALUES(verified_email)', [a.user.id, a.user.email]);
  const sent = [];
  const deliverPush = async (subscription, payload) => { assert.equal(subscription.endpoint, sub.endpoint); assert.ok(!JSON.stringify(payload).includes('Original prescribed')); sent.push('push'); };
  const deliverEmail = async (email, title, text) => { assert.equal(email, a.user.email); assert.ok(!text.includes(scheduled.name)); sent.push('email'); };
  const options = { patientId: a.user.id, deliverPush, deliverEmail, allowTestChannels: true };
  await tick({ ...options, now: new Date('2031-10-15T09:00:10Z') }); assert.equal(sent.length, 4, 'Dose and refill across both opted-in channels');
  await runMedicineTick({ ...options, now: new Date('2031-10-15T09:00:40Z') }); assert.equal(sent.length, 4, 'No duplicate sends');
  const failDelivery = async () => { throw Object.assign(new Error('Mock transport timeout'), { code: 'ETIMEDOUT' }); };
  await runMedicineTick({ ...options, now: new Date('2031-10-16T09:00:10Z'), deliverPush: failDelivery, deliverEmail: failDelivery });
  const [[failed]] = await pool.query("SELECT COUNT(*) AS total FROM medicine_notification_jobs WHERE patient_id=? AND status='Failed'", [a.user.id]); assert.equal(failed.total, 4);
  await runMedicineTick({ ...options, now: new Date('2031-10-16T09:02:10Z') }); assert.equal(sent.length, 8, 'Failed jobs are retried');
  const summary = (await api('/health-dashboard', a.token)).body.medicineReminders; assert.equal(summary.schedules, 2); assert.ok(summary.recentDoses.length);
  const {createReceipt}=await import('../services/medicineReceipts.js');
  const [[device]]=await pool.query('SELECT id FROM medicine_push_subscriptions WHERE patient_id=?',[a.user.id]);
  const receipt=await createReceipt(pool,{patientId:a.user.id,subscriptionId:device.id,kind:'test'});
  assert.equal((await api(path+'/receipt',null,'POST',{...receipt,token:'0'.repeat(64),clientState:'no_windows'})).status,404);
  assert.equal((await api(path+'/receipt',null,'POST',{...receipt,clientState:'no_windows'})).status,200);
  assert.equal((await api(path+'/receipt',null,'POST',{...receipt,clientState:'visible'})).status,200);
  const proof=(await api(path+'/push/status',a.token,'POST',{endpoint:sub.endpoint})).body;
  assert.ok(proof.lastClosedReceipt,'Capability receipt records first client state without session credentials');
  assert.equal((await api(path,b.token)).body.deliveries.length,0,'Delivery history is private');
  const delayed=await createReceipt(pool,{patientId:a.user.id,subscriptionId:device.id,kind:'test'});
  await pool.query("UPDATE medicine_delivery_receipts SET transport_status='Queued',attempts=0,scheduled_for='2031-10-16 09:04:00',next_attempt='2031-10-16 09:04:00',expires_at='2031-10-16 09:15:00' WHERE id=?",[delayed.id]);
  await runMedicineTick({...options,now:new Date('2031-10-16T09:03:59Z')});assert.equal(sent.length,8,'Delayed tests never send early');
  await runMedicineTick({...options,now:new Date('2031-10-16T09:04:00Z')});assert.equal(sent.length,9,'Delayed test sends when due');
  await runMedicineTick({...options,now:new Date('2031-10-16T09:04:30Z')});assert.equal(sent.length,9,'Delayed test is not duplicated');
  const [[beforeDisable]]=await pool.query('SELECT COUNT(*) AS total FROM medicine_notification_jobs WHERE patient_id=?',[a.user.id]);
  await api(path + '/push', a.token, 'DELETE', { endpoint: sub.endpoint });
  assert.equal((await api(path + '/push/status', a.token, 'POST', { endpoint: sub.endpoint })).body.enabled, false);
  const [[afterDisable]]=await pool.query('SELECT COUNT(*) AS total FROM medicine_notification_jobs WHERE patient_id=?',[a.user.id]);assert.equal(afterDisable.total,beforeDisable.total,'Disabling a device preserves delivery history');
  console.log('PASS: patient isolation, prescription ownership, schedule validation/editing, immutable dosage history, dose idempotency, supply restoration/refills, future-dose protection, subscription security, private messages, durable jobs, duplicate suppression, retry delivery, and dashboard integration. No real push or email was sent.');
} finally {
  if (users.length) await pool.query('DELETE FROM users WHERE id IN (?) AND email LIKE ?', [users, tag + '%']);
  await pool.end();
}
