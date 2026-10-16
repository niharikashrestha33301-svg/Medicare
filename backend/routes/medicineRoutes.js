import express from 'express';
import { createHash, randomBytes } from 'node:crypto';
import pool from '../config/db.js';
import { protect, authorizeRoles } from '../middleware/authMiddleware.js';
import { string, date, id, badRequest, fail } from '../utils/validation.js';
import { ensureMedicineSchema } from '../services/medicineSchema.js';
import { planSelect, normalizePlan, localParts, addDays, materialize, utcSQL } from '../services/medicineTime.js';
import { pushConfigured, emailConfigured, pushSetup, emailSetup, safeSubscription, sendPush, sendEmail, publicAppURL } from '../services/medicineDelivery.js';
import { medicineWorkerStatus } from '../services/medicineWorker.js';
import { createReceipt, finishReceipt, receiptHash } from '../services/medicineReceipts.js';
const router = express.Router();
const windows = new Map();
const testWindows = new Map();
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
router.use((req, res, next) => { res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }); next(); });
const receiptWindows = new Map();
router.post('/receipt', wrap(async (req, res) => {
  const now = Date.now();
  for (const [key,value] of receiptWindows) if (value.expires<=now) receiptWindows.delete(key);
  const entry = receiptWindows.get(req.ip) || { count:0, expires:now+60000 };
  entry.count++; receiptWindows.set(req.ip,entry);
  if (entry.count>240) return res.status(429).json({success:false,message:'Receipt rate limit.'});
  const { id: receiptId, token, clientState } = req.body;
  if (typeof receiptId!=='string' || !/^[a-f0-9-]{36}$/i.test(receiptId) || typeof token!=='string' || !/^[a-f0-9]{64}$/.test(token) || !['no_windows','visible','hidden'].includes(clientState)) throw badRequest('Invalid display receipt.');
  await ensureMedicineSchema();
  const [result] = await pool.query(`UPDATE medicine_delivery_receipts SET client_state=IF(received_at IS NULL, ?, client_state), received_at=COALESCE(received_at, UTC_TIMESTAMP())
    WHERE id=? AND token_hash=? AND expires_at>UTC_TIMESTAMP() AND attempted_at<=UTC_TIMESTAMP() AND transport_status IN ('Pending','Accepted','Failed')`, [clientState,receiptId,receiptHash(token)]);
  res.status(result.affectedRows ? 200 : 404).json({success:!!result.affectedRows,message:'Display receipt not found or expired.'});
}));
export const hash = value => createHash('sha256').update(value).digest('hex');

router.get('/verify-email', wrap(async (req, res) => {
  await ensureMedicineSchema();
  if (typeof req.query.token !== 'string' || !/^[a-f0-9]{64}$/.test(req.query.token)) throw badRequest('Invalid verification link.');
  const [result] = await pool.query(`UPDATE medicine_preferences p JOIN users u ON u.id = p.patient_id
    SET p.email_enabled = TRUE, p.verified_email = u.email, p.verification_hash = NULL, p.verification_expires = NULL
    WHERE p.verification_hash = ? AND p.verification_expires > UTC_TIMESTAMP() AND u.status = 'Active' AND u.role = 'patient'`, [hash(req.query.token)]);
  if (!result.affectedRows) return res.status(400).type('text').send('This verification link is invalid or expired. Request a new link from Medicine Reminder.');
  res.set('Referrer-Policy', 'no-referrer').redirect('/medicines.html?email=verified');
}));
router.use(protect, authorizeRoles('patient'));
router.use((req, res, next) => {
  const now = Date.now();
  for (const [key, value] of windows) if (value.expires <= now) windows.delete(key);
  const entry = windows.get(req.user.id) || { count: 0, expires: now + 60000 };
  entry.count++; windows.set(req.user.id, entry);
  if (entry.count > 120) return res.status(429).json({ success: false, message: 'Too many reminder requests. Wait a minute and retry.' });
  next();
});
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
router.use((req, res, next) => ensureMedicineSchema().then(() => next()).catch(next));

async function validatePlan(body, patientId, existing, connection) {
  const name = string(body.name, 'medicine name', 160), dosage = string(body.dosage ?? existing?.dosage, 'prescribed dosage', 120);
  if (existing && dosage !== existing.dosage && body.confirmDosageChange !== true) throw badRequest('Confirm that an updated prescribed dosage was entered intentionally.');
  const instructions = string(body.instructions || '', 'instructions', 1000, false), timezone = string(body.timezone, 'timezone', 80);
  try { localParts(Date.now(), timezone); } catch { throw badRequest('Choose a valid timezone.'); }
  const timings = body.timings;
  if (!Array.isArray(timings) || !timings.length || timings.length > 12 || new Set(timings).size !== timings.length || timings.some(t => typeof t !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(t))) throw badRequest('Enter 1–12 different daily times in 24-hour format.');
  const start = date(body.startDate), end = date(body.endDate);
  if (end < start || Date.parse(end) - Date.parse(start) > 732 * 86400000) throw badRequest('Choose an end date on or after the start, within two years.');
  const number = (value, field, max, positive = false) => { if (!['number','string'].includes(typeof value) || value === '' || !Number.isFinite(Number(value)) || Number(value) < (positive ? .01 : 0) || Number(value) > max) throw badRequest('Enter a valid ' + field + '.'); return Math.round(Number(value) * 100) / 100; };
  const stock = number(body.stock, 'supply', 1000000), units = number(body.unitsPerDose, 'supply units per dose', 10000, true), threshold = number(body.refillAt, 'refill threshold', 1000000);
  const prescription = body.prescriptionId ? id(body.prescriptionId) : null;
  if (prescription) {
    const [rows] = await connection.query("SELECT id FROM patient_health_records WHERE id = ? AND patient_id = ? AND category = 'prescription'", [prescription, patientId]);
    if (!rows.length) throw badRequest('Choose one of your own prescriptions.');
  }
  if (typeof body.active !== 'boolean') throw badRequest('Choose whether the schedule is active.');
  return { name, dosage, instructions, timezone, timings: [...timings].sort(), start, end, stock, units, threshold, prescription, active: body.active };
}

router.get('/', wrap(async (req, res) => {
  const timezone = typeof req.query.timezone === 'string' ? req.query.timezone : process.env.APP_TIMEZONE || 'Asia/Kathmandu';
  let today; try { today = localParts(Date.now(), timezone).date; } catch { throw badRequest('Invalid calendar timezone.'); }
  const day = req.query.day ? date(req.query.day) : today;
  if (day < addDays(today, -90) || day > addDays(today, 90)) throw badRequest('Choose a calendar day within 90 days of today.');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(planSelect + ' WHERE patient_id = ? ORDER BY id FOR UPDATE', [req.user.id]);
    for (const row of rows) {
      const localToday = localParts(Date.now(), row.timezone).date;
      await materialize(connection, row, localToday, addDays(localToday, 7));
      await materialize(connection, row, day, day);
    }
    await connection.query("UPDATE medicine_events SET status = 'Missed', recorded_at = UTC_TIMESTAMP() WHERE patient_id = ? AND status = 'Pending' AND due_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 2 HOUR)", [req.user.id]);
    const [events] = await connection.query(`SELECT id, plan_id, name, dosage, status, DATE_FORMAT(due_at, '%Y-%m-%dT%H:%i:%sZ') AS due_at,
      DATE_FORMAT(local_date, '%Y-%m-%d') AS local_date, local_time, DATE_FORMAT(recorded_at, '%Y-%m-%dT%H:%i:%sZ') AS recorded_at
      FROM medicine_events WHERE patient_id = ? AND status <> 'Cancelled' AND (local_date = ? OR due_at BETWEEN DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY) AND UTC_TIMESTAMP()) ORDER BY due_at`, [req.user.id, day]);
    const [prescriptions] = await connection.query("SELECT id, title, dosage FROM patient_health_records WHERE patient_id = ? AND category = 'prescription' ORDER BY id DESC", [req.user.id]);
    const [[preferences]] = await connection.query('SELECT email_enabled, verified_email FROM medicine_preferences WHERE patient_id = ?', [req.user.id]);
    const [[devices]] = await connection.query('SELECT COUNT(*) AS count FROM medicine_push_subscriptions WHERE patient_id = ? AND enabled=TRUE', [req.user.id]);
    const [deliveries] = await connection.query(`SELECT j.channel, j.kind, j.status, j.attempts, j.error_code, DATE_FORMAT(j.next_attempt, '%Y-%m-%dT%H:%i:%sZ') AS next_attempt, DATE_FORMAT(j.delivered_at, '%Y-%m-%dT%H:%i:%sZ') AS delivered_at,
      (SELECT DATE_FORMAT(MAX(r.received_at), '%Y-%m-%dT%H:%i:%sZ') FROM medicine_delivery_receipts r WHERE r.job_id=j.id AND r.patient_id=j.patient_id) AS received_at,
      (SELECT r.client_state FROM medicine_delivery_receipts r WHERE r.job_id=j.id AND r.patient_id=j.patient_id AND r.received_at IS NOT NULL ORDER BY r.received_at DESC LIMIT 1) AS client_state
      FROM medicine_notification_jobs j WHERE j.patient_id=? ORDER BY j.id DESC LIMIT 30`, [req.user.id]);
    const [testDeliveries] = await connection.query("SELECT 'push' AS channel, kind, transport_status AS status, attempts, error_code, DATE_FORMAT(scheduled_for, '%Y-%m-%dT%H:%i:%sZ') AS scheduled_for, DATE_FORMAT(attempted_at, '%Y-%m-%dT%H:%i:%sZ') AS attempted_at, DATE_FORMAT(received_at, '%Y-%m-%dT%H:%i:%sZ') AS received_at, DATE_FORMAT(accepted_at, '%Y-%m-%dT%H:%i:%sZ') AS delivered_at, client_state FROM medicine_delivery_receipts WHERE patient_id=? AND job_id IS NULL ORDER BY attempted_at DESC LIMIT 10", [req.user.id]);
    await connection.commit();
    const due = events.filter(e => new Date(e.due_at) <= new Date() && new Date(e.due_at) >= new Date(Date.now() - 30 * 86400000)), taken = due.filter(e => e.status === 'Taken').length;
    res.json({ success: true, user: { id: req.user.id, name: req.user.name, email: req.user.email }, day, timezone, plans: rows.map(normalizePlan), events, prescriptions, deliveries:[...testDeliveries,...deliveries],
      adherence: { taken, scheduled: due.length, percentage: due.length ? Math.round(taken / due.length * 100) : null },
      notifications: { pushConfigured: pushConfigured(), publicKey: pushConfigured() ? process.env.VAPID_PUBLIC_KEY : null, pushSetup:pushSetup(), emailSetup:emailSetup(), emailConfigured: emailConfigured(), emailEnabled: !!preferences?.email_enabled, emailVerified: preferences?.verified_email === req.user.email, devices: devices.count, worker: medicineWorkerStatus } });
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
}));

async function savePlan(req, res) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    let existing;
    if (req.params.id) {
      const [[row]] = await connection.query(planSelect + ' WHERE id = ? AND patient_id = ? FOR UPDATE', [id(req.params.id), req.user.id]);
      if (!row) { await connection.rollback(); return res.status(404).json({ success: false, message: 'Medicine schedule not found.' }); }
      existing = row;
    }
    const plan = await validatePlan(req.body, req.user.id, existing, connection);
    const values = [plan.prescription, plan.name, plan.dosage, plan.instructions, JSON.stringify(plan.timings), plan.timezone, plan.start, plan.end, plan.stock, plan.units, plan.threshold, plan.active];
    let planId;
    if (existing) {
      planId = existing.id;
      await connection.query('UPDATE medicine_plans SET prescription_id=?, name=?, dosage=?, instructions=?, timings=?, timezone=?, start_date=?, end_date=?, stock=?, units_per_dose=?, refill_at=?, active=?, updated_at=UTC_TIMESTAMP() WHERE id=? AND patient_id=?', [...values, planId, req.user.id]);
      await connection.query("UPDATE medicine_events SET status='Cancelled' WHERE plan_id=? AND patient_id=? AND status='Pending' AND due_at>UTC_TIMESTAMP()", [planId, req.user.id]);
    } else {
      const [result] = await connection.query('INSERT INTO medicine_plans (patient_id, prescription_id, name, dosage, instructions, timings, timezone, start_date, end_date, stock, units_per_dose, refill_at, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())', [req.user.id, ...values]); planId = result.insertId;
    }
    await connection.commit(); res.status(existing ? 200 : 201).json({ success: true, id: planId });
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
}
router.post('/plans', wrap(savePlan));
router.put('/plans/:id', wrap(savePlan));
router.post('/plans/:id/refill', wrap(async (req, res) => {
  const amount = Number(req.body.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000) throw badRequest('Enter a positive refill quantity.');
  const [result] = await pool.query('UPDATE medicine_plans SET stock = stock + ?, updated_at = UTC_TIMESTAMP() WHERE id = ? AND patient_id = ? AND stock + ? <= 1000000', [amount, id(req.params.id), req.user.id, amount]);
  res.status(result.affectedRows ? 200 : 404).json({ success: !!result.affectedRows, message: 'Schedule not found or supply limit exceeded.' });
}));
router.put('/events/:id', wrap(async (req, res) => {
  if (!['Taken','Missed','Skipped','Pending'].includes(req.body.status)) throw badRequest('Choose Taken, Missed, Skipped, or Reset.');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[event]] = await connection.query('SELECT plan_id FROM medicine_events WHERE id=? AND patient_id=?', [id(req.params.id), req.user.id]);
    if (!event) { await connection.rollback(); return res.status(404).json({ success: false, message: 'Dose not found.' }); }
    const [[plan]] = await connection.query('SELECT stock FROM medicine_plans WHERE id=? AND patient_id=? FOR UPDATE', [event.plan_id, req.user.id]);
    const [[dose]] = await connection.query("SELECT units, debited, status, DATE_FORMAT(due_at, '%Y-%m-%dT%H:%i:%sZ') AS due_at FROM medicine_events WHERE id=? AND patient_id=? FOR UPDATE", [req.params.id, req.user.id]);
    if (dose.status === 'Cancelled') throw badRequest('This dose was cancelled by a schedule change.');
    if (new Date(dose.due_at) > new Date()) throw badRequest('Future doses cannot be marked yet.');
    const restored = Number(plan.stock) + Number(dose.debited);
    const debit = req.body.status === 'Taken' ? Math.min(restored, Number(dose.units)) : 0;
    await connection.query('UPDATE medicine_plans SET stock=? WHERE id=? AND patient_id=?', [restored - debit, event.plan_id, req.user.id]);
    await connection.query('UPDATE medicine_events SET status=?, debited=?, recorded_at=UTC_TIMESTAMP() WHERE id=? AND patient_id=?', [req.body.status, debit, req.params.id, req.user.id]);
    await connection.commit(); res.json({ success: true });
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
}));

router.post('/push', wrap(async (req, res) => {
  if (!pushConfigured()) return res.status(503).json({ success: false, message: 'Browser push is not configured on the server.' });
  const subscription = req.body.subscription;
  if (!safeSubscription(subscription)) throw badRequest('Invalid browser push subscription.');
  const endpointHash = hash(subscription.endpoint);
  const [[count]] = await pool.query('SELECT COUNT(*) AS total FROM medicine_push_subscriptions WHERE patient_id=? AND enabled=TRUE AND endpoint_hash<>?', [req.user.id, endpointHash]);
  if (count.total >= 10) throw badRequest('A maximum of 10 reminder devices is supported per patient. Disable an unused device first.');
  await pool.query(`INSERT INTO medicine_push_subscriptions (patient_id, endpoint_hash, subscription, created_at) VALUES (?, ?, ?, UTC_TIMESTAMP())
    ON DUPLICATE KEY UPDATE patient_id=VALUES(patient_id), subscription=VALUES(subscription), enabled=TRUE`, [req.user.id, endpointHash, JSON.stringify({ endpoint: subscription.endpoint, keys: subscription.keys })]);
  res.json({ success: true });
}));
router.post('/push/status', wrap(async (req, res) => {
  if (typeof req.body.endpoint !== 'string') throw badRequest('Missing subscription.');
  const [[row]] = await pool.query('SELECT id,enabled FROM medicine_push_subscriptions WHERE patient_id=? AND endpoint_hash=?', [req.user.id, hash(req.body.endpoint)]);
  const [[proof]] = row ? await pool.query("SELECT DATE_FORMAT(MAX(received_at), '%Y-%m-%dT%H:%i:%sZ') AS lastReceived, DATE_FORMAT(MAX(IF(client_state='no_windows',received_at,NULL)), '%Y-%m-%dT%H:%i:%sZ') AS lastClosedReceipt FROM medicine_delivery_receipts WHERE patient_id=? AND subscription_id=?", [req.user.id,row.id]) : [[{}]];
  res.json({ success: true, enabled: !!row?.enabled, ...proof });
}));
router.post('/push/test', wrap(async (req, res) => {
  if (!pushConfigured()) return res.status(503).json({ success: false, message: 'Browser push is not configured.' });
  if (typeof req.body.endpoint !== 'string') throw badRequest('Missing device subscription.');
  const now = Date.now();
  for (const [key, until] of testWindows) if (until <= now) testWindows.delete(key);
  if (testWindows.has(req.user.id)) throw Object.assign(new Error('Wait a minute before another test notification.'), { status: 429 });
  const [[device]] = await pool.query('SELECT id, subscription FROM medicine_push_subscriptions WHERE patient_id=? AND enabled=TRUE AND endpoint_hash=?', [req.user.id, hash(req.body.endpoint)]);
  if (!device) return res.status(404).json({ success: false, message: 'This device is not enabled for your account.' });
  const delay = Number(req.body.delaySeconds || 0);
  if (![0,60].includes(delay)) throw badRequest('Test delay must be 0 or 60 seconds.');
  testWindows.set(req.user.id, now + 60000);
  const receipt = await createReceipt(pool, {patientId:req.user.id,subscriptionId:device.id,kind:'test'});
  if (delay) {
    await pool.query("UPDATE medicine_delivery_receipts SET transport_status='Queued', attempts=0, scheduled_for=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 60 SECOND), next_attempt=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 60 SECOND), expires_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 11 MINUTE) WHERE id=?",[receipt.id]);
    return res.json({success:true,message:'Test scheduled for 60 seconds from now. Close all MediCare tabs/windows, then reopen Medicine Reminder to check the browser display receipt. Background delivery is not yet verified.'});
  }
  try {
    await sendPush(JSON.parse(device.subscription), { kind:'test', tag:'medicare-reminder-test', receipt });
    await finishReceipt(pool,receipt,new Date());
    res.json({ success:true,message:'Push service accepted the test. Delivery is not verified until the browser reports a display receipt; check notification history.' });
  } catch(error) {
    await finishReceipt(pool,receipt,new Date(),error);
    if ([404,410].includes(error.statusCode)) await pool.query('UPDATE medicine_push_subscriptions SET enabled=FALSE WHERE id=? AND patient_id=?',[device.id,req.user.id]);
    throw Object.assign(new Error([401,403].includes(error.statusCode) ? 'Push service rejected the app keys. Check VAPID setup and re-enable this browser.' : [404,410].includes(error.statusCode) ? 'This browser subscription expired. Re-enable reminders on this device.' : 'The push service could not accept this test. Check the connection and notification history, then retry.'),{status:502});
  }
}));
router.delete('/push', wrap(async (req, res) => {
  if (typeof req.body.endpoint !== 'string') throw badRequest('Missing subscription.');
  await pool.query('UPDATE medicine_push_subscriptions SET enabled=FALSE WHERE patient_id=? AND endpoint_hash=?', [req.user.id, hash(req.body.endpoint)]);
  res.json({ success: true });
}));
router.put('/preferences', wrap(async (req, res) => {
  if (typeof req.body.emailEnabled !== 'boolean') throw badRequest('Choose an email preference.');
  const [[preference]] = await pool.query('SELECT verified_email FROM medicine_preferences WHERE patient_id=?', [req.user.id]);
  if (req.body.emailEnabled && (!emailConfigured() || preference?.verified_email !== req.user.email)) throw badRequest('Configure email and verify your account email before enabling reminders.');
  await pool.query('INSERT INTO medicine_preferences (patient_id, email_enabled) VALUES (?, ?) ON DUPLICATE KEY UPDATE email_enabled=VALUES(email_enabled), verification_hash=NULL, verification_expires=NULL', [req.user.id, req.body.emailEnabled]);
  res.json({ success: true });
}));
router.post('/verify-email', wrap(async (req, res) => {
  if (!emailConfigured()) return res.status(503).json({ success: false, message: 'Email reminders are not configured yet.' });
  const token = randomBytes(32).toString('hex'), connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('INSERT IGNORE INTO medicine_preferences (patient_id) VALUES (?)', [req.user.id]);
    const [[previous]] = await connection.query('SELECT verification_requested > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 15 MINUTE) AS recent FROM medicine_preferences WHERE patient_id=? FOR UPDATE', [req.user.id]);
    if (previous.recent) throw Object.assign(new Error('Wait 15 minutes before requesting another verification email.'), { status: 429 });
    await connection.query('UPDATE medicine_preferences SET verification_hash=?, verification_expires=DATE_ADD(UTC_TIMESTAMP(), INTERVAL 15 MINUTE), verification_requested=UTC_TIMESTAMP() WHERE patient_id=?', [hash(token), req.user.id]);
    await sendEmail(req.user.email, 'Confirm MediCare medicine reminder emails', `You requested medicine reminders at MediCare. Confirm within 15 minutes: ${publicAppURL()}/api/medicine-reminders/verify-email?token=${token}\nIf you did not request this, ignore this email.`);
    await connection.commit(); res.json({ success: true, message: 'Verification email sent. Open its link to enable reminders.' });
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
}));
router.use((error, req, res, next) => fail(res, error));
export default router;
