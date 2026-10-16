import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { utcSQL } from './medicineTime.js';
export const receiptHash = value => createHash('sha256').update(value).digest('hex');
export async function createReceipt(connection, { patientId, subscriptionId, jobId = null, kind, now = new Date() }) {
  const id = randomUUID(), token = randomBytes(32).toString('hex');
  await connection.query(`INSERT INTO medicine_delivery_receipts (id, patient_id, subscription_id, job_id, kind, token_hash, attempted_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, DATE_ADD(?, INTERVAL 24 HOUR))`, [id, patientId, subscriptionId, jobId, kind, receiptHash(token), utcSQL(now), utcSQL(now)]);
  return { id, token };
}
export async function finishReceipt(connection, receipt, now, error = null) {
  await connection.query(`UPDATE medicine_delivery_receipts SET transport_status=?, accepted_at=?, error_code=? WHERE id=?`,
    [error ? 'Failed' : 'Accepted', error ? null : utcSQL(now), error ? String(error.statusCode || error.code || 'DELIVERY_FAILED').slice(0, 60) : null, receipt.id]);
}
