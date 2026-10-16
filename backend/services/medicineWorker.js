import { createHash, randomBytes } from 'node:crypto';
import pool from '../config/db.js';
import { ensureMedicineSchema } from './medicineSchema.js';
import { planSelect, normalizePlan, materialize, localParts, addDays, utcSQL } from './medicineTime.js';
import { pushConfigured, emailConfigured, sendPush, sendEmail, publicAppURL } from './medicineDelivery.js';
import { createReceipt, finishReceipt, receiptHash } from './medicineReceipts.js';
let running = false;
export const medicineWorkerStatus = { lastRun: null, error: null };
const digest = text => createHash('sha256').update(text).digest('hex');
const materialized = new Map();

export async function runMedicineTick({ now = new Date(), patientId = null, deliverPush = sendPush, deliverEmail = sendEmail, allowTestChannels = false } = {}) {
  if (running) return;
  running = true; let connection, locked = false;
  try {
    await ensureMedicineSchema();
    connection = await pool.getConnection();
    const [[lock]] = await connection.query("SELECT GET_LOCK('medicare_medicine_worker', 0) AS acquired");
    if (!lock.acquired) return;
    locked = true;
    const sqlNow = utcSQL(now);
    const [plans] = await connection.query(planSelect + ` WHERE active=TRUE${patientId ? ' AND patient_id=?' : ''} ORDER BY id`, patientId ? [patientId] : []);
    for (const raw of plans) {
      const plan = normalizePlan(raw), localToday = localParts(now, plan.timezone).date;
      const signature = digest(JSON.stringify([plan.name, plan.dosage, plan.timings, plan.timezone, plan.start_date, plan.end_date, localToday]));
      await connection.beginTransaction();
      try {
        // Same plan-first lock order as schedule/dose edits.
        const [[current]] = await connection.query(planSelect + ' WHERE id=? AND active=TRUE FOR UPDATE', [plan.id]);
        if (current && materialized.get(plan.id) !== signature) await materialize(connection, current, addDays(localToday, -30), addDays(localToday, 1));
        await connection.commit();
        if (current) materialized.set(plan.id, signature);
      } catch (error) { await connection.rollback(); throw error; }
      if (localToday < plan.start_date || localToday > plan.end_date) continue;
      const [[user]] = await connection.query("SELECT u.email, p.email_enabled, p.verified_email FROM users u LEFT JOIN medicine_preferences p ON p.patient_id=u.id WHERE u.id=? AND u.role='patient' AND u.status='Active'", [plan.patient_id]);
      if (!user) continue;
      const [devices] = await connection.query('SELECT id FROM medicine_push_subscriptions WHERE patient_id=? AND enabled=TRUE', [plan.patient_id]);
      const [due] = await connection.query("SELECT id FROM medicine_events WHERE plan_id=? AND status='Pending' AND due_at BETWEEN DATE_SUB(?, INTERVAL 2 HOUR) AND ?", [plan.id, sqlNow, sqlNow]);
      const alerts = due.map(event => ({ kind: 'dose', event: event.id, key: 'dose:' + event.id }));
      if (plan.stock <= plan.refill_at) alerts.push({ kind: 'refill', event: null, key: `refill:${plan.id}:${localToday}` });
      for (const alert of alerts) {
        const queue = async (channel, subscriptionId) => connection.query(`INSERT IGNORE INTO medicine_notification_jobs
          (job_key, patient_id, plan_id, event_id, subscription_id, channel, kind, next_attempt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [digest(`${alert.key}:${channel}:${subscriptionId || plan.patient_id}`), plan.patient_id, plan.id, alert.event, subscriptionId, channel, alert.kind, sqlNow]);
        if (pushConfigured() || allowTestChannels) for (const device of devices) await queue('push', device.id);
        if ((emailConfigured() || allowTestChannels) && user.email_enabled && user.verified_email === user.email) await queue('email', null);
      }
    }
    await connection.query(`UPDATE medicine_events SET status='Missed', recorded_at=? WHERE status='Pending' AND due_at<DATE_SUB(?, INTERVAL 2 HOUR)${patientId ? ' AND patient_id=?' : ''}`, patientId ? [sqlNow, sqlNow, patientId] : [sqlNow, sqlNow]);
    const [jobs] = await connection.query(`SELECT j.*, s.subscription, u.email, u.status AS user_status, p.email_enabled, p.verified_email,
      m.active, m.stock, m.refill_at, m.timezone, DATE_FORMAT(m.start_date, '%Y-%m-%d') AS plan_start, DATE_FORMAT(m.end_date, '%Y-%m-%d') AS plan_end,
      e.status AS dose_status, DATE_FORMAT(e.due_at, '%Y-%m-%dT%H:%i:%sZ') AS dose_due
      FROM medicine_notification_jobs j JOIN medicine_plans m ON m.id=j.plan_id JOIN users u ON u.id=j.patient_id
      LEFT JOIN medicine_push_subscriptions s ON s.id=j.subscription_id AND s.patient_id=j.patient_id AND s.enabled=TRUE
      LEFT JOIN medicine_preferences p ON p.patient_id=j.patient_id LEFT JOIN medicine_events e ON e.id=j.event_id
      WHERE j.attempts<5 AND j.next_attempt<=? AND (j.status IN ('Pending','Failed') OR (j.status='Sending' AND j.lease_until<?))
      ${patientId ? 'AND j.patient_id=?' : ''} ORDER BY j.id LIMIT 20`, patientId ? [sqlNow, sqlNow, patientId] : [sqlNow, sqlNow]);
    for (const job of jobs) {
      const validDose = job.kind !== 'dose' || (job.dose_status === 'Pending' && now >= new Date(job.dose_due) && now - new Date(job.dose_due) <= 2 * 3600000);
      const validRefill = job.kind !== 'refill' || Number(job.stock) <= Number(job.refill_at);
      const validChannel = job.channel === 'push' ? !!job.subscription : job.email_enabled && job.verified_email === job.email;
      const localToday = localParts(now, job.timezone).date;
      if (!job.active || localToday < job.plan_start || localToday > job.plan_end || job.user_status !== 'Active' || !validDose || !validRefill || !validChannel) {
        await connection.query("UPDATE medicine_notification_jobs SET status='Cancelled' WHERE id=?", [job.id]); continue;
      }
      if (job.channel === 'push' && !pushConfigured() && !allowTestChannels || job.channel === 'email' && !emailConfigured() && !allowTestChannels) continue;
      await connection.query("UPDATE medicine_notification_jobs SET status='Sending', attempts=attempts+1, lease_until=DATE_ADD(?, INTERVAL 2 MINUTE) WHERE id=?", [sqlNow, job.id]);
      const body = job.kind === 'refill' ? 'A medicine supply is running low. Sign in to review your refill alert.' : 'It is time to check your medicine schedule. Sign in to view your prescribed instructions.';
      let receipt;
      try {
        if (job.channel === 'push') {
          receipt = await createReceipt(connection, {patientId:job.patient_id,subscriptionId:job.subscription_id,jobId:job.id,kind:job.kind,now});
          await deliverPush(JSON.parse(job.subscription), { title: 'MediCare medicine reminder', body, kind: job.kind, tag: 'medicare-' + job.job_key, receipt });
          await finishReceipt(connection, receipt, now);
        }
        else await deliverEmail(job.email, 'MediCare medicine reminder', `${body}\n${publicAppURL()}/medicines.html\nYou can disable email reminders in Medicine Reminder.`, job.job_key);
        await connection.query("UPDATE medicine_notification_jobs SET status='Sent', delivered_at=?, error_code=NULL WHERE id=?", [sqlNow, job.id]);
      } catch (error) {
        if (receipt) await finishReceipt(connection, receipt, now, error);
        if (job.channel === 'push' && [404, 410].includes(error.statusCode)) {
          await connection.query('UPDATE medicine_push_subscriptions SET enabled=FALSE WHERE id=? AND patient_id=?', [job.subscription_id, job.patient_id]);
          await connection.query("UPDATE medicine_notification_jobs SET status='Failed', attempts=5, error_code='SUBSCRIPTION_EXPIRED' WHERE id=?", [job.id]);
        } else await connection.query("UPDATE medicine_notification_jobs SET status='Failed', error_code=?, next_attempt=DATE_ADD(?, INTERVAL ? MINUTE) WHERE id=?", [String(error.statusCode || error.code || 'DELIVERY_FAILED').slice(0, 60), sqlNow, Math.min(30, 2 ** job.attempts), job.id]);
      }
    }
    // A user can schedule a device test without creating a medicine plan.
    await connection.query(`UPDATE medicine_delivery_receipts SET transport_status='Cancelled', error_code='TEST_EXPIRED' WHERE kind='test' AND transport_status IN ('Queued','Pending','Failed') AND scheduled_for IS NOT NULL AND expires_at<=?${patientId ? ' AND patient_id=?' : ''}`,patientId?[sqlNow,patientId]:[sqlNow]);
    const [tests] = await connection.query(`SELECT r.*, s.subscription, s.enabled, u.status AS user_status FROM medicine_delivery_receipts r
      LEFT JOIN medicine_push_subscriptions s ON s.id=r.subscription_id AND s.patient_id=r.patient_id JOIN users u ON u.id=r.patient_id
      WHERE r.kind='test' AND r.scheduled_for IS NOT NULL AND r.next_attempt<=? AND r.expires_at>? AND r.attempts<3
      AND (r.transport_status IN ('Queued','Failed') OR (r.transport_status='Pending' AND r.lease_until<?))
      ${patientId ? 'AND r.patient_id=?' : ''} ORDER BY r.next_attempt LIMIT 10`,patientId?[sqlNow,sqlNow,sqlNow,patientId]:[sqlNow,sqlNow,sqlNow]);
    for (const test of tests) {
      if (!test.enabled || !test.subscription || test.user_status!=='Active') { await connection.query("UPDATE medicine_delivery_receipts SET transport_status='Cancelled',error_code='DEVICE_DISABLED' WHERE id=?",[test.id]); continue; }
      if (!pushConfigured()&&!allowTestChannels) continue;
      const receipt={id:test.id,token:randomBytes(32).toString('hex')};
      await connection.query("UPDATE medicine_delivery_receipts SET transport_status='Pending', attempts=attempts+1, token_hash=?, attempted_at=?, lease_until=DATE_ADD(?,INTERVAL 2 MINUTE) WHERE id=?",[receiptHash(receipt.token),sqlNow,sqlNow,test.id]);
      try { await deliverPush(JSON.parse(test.subscription),{kind:'test',tag:'medicare-test-'+test.id,receipt}); await finishReceipt(connection,receipt,now); }
      catch(error) {
        await finishReceipt(connection,receipt,now,error);
        await connection.query('UPDATE medicine_delivery_receipts SET next_attempt=DATE_ADD(?,INTERVAL ? MINUTE) WHERE id=?',[sqlNow,2**test.attempts,test.id]);
        if ([404,410].includes(error.statusCode)) await connection.query('UPDATE medicine_push_subscriptions SET enabled=FALSE WHERE id=? AND patient_id=?',[test.subscription_id,test.patient_id]);
      }
    }
    medicineWorkerStatus.lastRun = new Date().toISOString(); medicineWorkerStatus.error = null;
  } catch (error) {
    medicineWorkerStatus.error = 'Reminder worker could not complete its last check.';
    console.error('Medicine worker:', error.code || error.message);
    throw error;
  } finally {
    if (locked) await connection.query("SELECT RELEASE_LOCK('medicare_medicine_worker')").catch(() => {});
    connection?.release(); running = false;
  }
}
export function startMedicineWorker() {
  const tick = () => runMedicineTick().catch(() => {});
  tick(); const timer = setInterval(tick, 30000); timer.unref(); return timer;
}
