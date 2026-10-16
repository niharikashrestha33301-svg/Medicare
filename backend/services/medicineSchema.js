import pool from '../config/db.js';
import { ensureHealthSchema } from './healthSchema.js';
let ready;
export function ensureMedicineSchema() {
  if (!ready) ready = (async () => {
    await ensureHealthSchema();
    await pool.query(`CREATE TABLE IF NOT EXISTS medicine_plans (
      id INT AUTO_INCREMENT PRIMARY KEY, patient_id INT NOT NULL, prescription_id INT NULL,
      name VARCHAR(160) NOT NULL, dosage VARCHAR(120) NOT NULL, instructions TEXT NOT NULL,
      timings TEXT NOT NULL, timezone VARCHAR(80) NOT NULL, start_date DATE NOT NULL, end_date DATE NOT NULL,
      stock DECIMAL(10,2) NOT NULL DEFAULT 0, units_per_dose DECIMAL(8,2) NOT NULL DEFAULT 1,
      refill_at DECIMAL(10,2) NOT NULL DEFAULT 5, active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL,
      INDEX patient_active (patient_id, active),
      FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (prescription_id) REFERENCES patient_health_records(id) ON DELETE SET NULL
    ) ENGINE=InnoDB`);
    await pool.query(`CREATE TABLE IF NOT EXISTS medicine_events (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, patient_id INT NOT NULL, plan_id INT NOT NULL,
      due_at DATETIME NOT NULL, local_date DATE NOT NULL, local_time CHAR(5) NOT NULL,
      name VARCHAR(160) NOT NULL, dosage VARCHAR(120) NOT NULL, units DECIMAL(8,2) NOT NULL,
      status ENUM('Pending','Taken','Missed','Skipped','Cancelled') NOT NULL DEFAULT 'Pending',
      debited DECIMAL(10,2) NOT NULL DEFAULT 0, recorded_at DATETIME NULL,
      UNIQUE KEY occurrence (plan_id, local_date, local_time), INDEX patient_due (patient_id, due_at),
      FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (plan_id) REFERENCES medicine_plans(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`);
    await pool.query(`CREATE TABLE IF NOT EXISTS medicine_preferences (
      patient_id INT PRIMARY KEY, email_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      verified_email VARCHAR(191) NULL, verification_hash CHAR(64) NULL,
      verification_expires DATETIME NULL, verification_requested DATETIME NULL,
      FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`);
    await pool.query(`CREATE TABLE IF NOT EXISTS medicine_push_subscriptions (
      id INT AUTO_INCREMENT PRIMARY KEY, patient_id INT NOT NULL,
      endpoint_hash CHAR(64) NOT NULL UNIQUE, subscription TEXT NOT NULL, enabled BOOLEAN NOT NULL DEFAULT TRUE, created_at DATETIME NOT NULL,
      FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`);
    const [enabledColumns] = await pool.query("SHOW COLUMNS FROM medicine_push_subscriptions LIKE 'enabled'");
    if (!enabledColumns.length) await pool.query('ALTER TABLE medicine_push_subscriptions ADD COLUMN enabled BOOLEAN NOT NULL DEFAULT TRUE').catch(error => { if (error.code !== 'ER_DUP_FIELDNAME') throw error; });
    await pool.query(`CREATE TABLE IF NOT EXISTS medicine_notification_jobs (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, job_key CHAR(64) NOT NULL UNIQUE,
      patient_id INT NOT NULL, plan_id INT NOT NULL, event_id BIGINT UNSIGNED NULL, subscription_id INT NULL,
      channel ENUM('push','email') NOT NULL, kind ENUM('dose','refill') NOT NULL,
      status ENUM('Pending','Sending','Sent','Failed','Cancelled') NOT NULL DEFAULT 'Pending',
      attempts INT NOT NULL DEFAULT 0, next_attempt DATETIME NOT NULL, lease_until DATETIME NULL,
      delivered_at DATETIME NULL, error_code VARCHAR(60) NULL,
      INDEX delivery_queue (status, next_attempt),
      FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (plan_id) REFERENCES medicine_plans(id) ON DELETE CASCADE,
      FOREIGN KEY (event_id) REFERENCES medicine_events(id) ON DELETE CASCADE,
      FOREIGN KEY (subscription_id) REFERENCES medicine_push_subscriptions(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`);
    await pool.query(`CREATE TABLE IF NOT EXISTS medicine_delivery_receipts (
      id CHAR(36) PRIMARY KEY, patient_id INT NOT NULL, subscription_id INT NULL,
      job_id BIGINT UNSIGNED NULL, kind VARCHAR(12) NOT NULL, token_hash CHAR(64) NOT NULL,
      transport_status VARCHAR(20) NOT NULL DEFAULT 'Pending', attempted_at DATETIME NOT NULL,
      accepted_at DATETIME NULL, received_at DATETIME NULL, client_state VARCHAR(20) NULL,
      scheduled_for DATETIME NULL, next_attempt DATETIME NULL, lease_until DATETIME NULL, attempts INT NOT NULL DEFAULT 1,
      expires_at DATETIME NOT NULL, error_code VARCHAR(60) NULL,
      INDEX patient_receipts (patient_id, attempted_at),
      FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (subscription_id) REFERENCES medicine_push_subscriptions(id) ON DELETE SET NULL,
      FOREIGN KEY (job_id) REFERENCES medicine_notification_jobs(id) ON DELETE SET NULL
    ) ENGINE=InnoDB`);
  })().catch(error => { ready = null; throw error; });
  return ready;
}
