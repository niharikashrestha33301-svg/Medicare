import pool from '../config/db.js';

let ready;
export function ensureHealthSchema() {
  if (!ready) ready = (async () => {
    await pool.query(`CREATE TABLE IF NOT EXISTS patient_health_records (
      id INT AUTO_INCREMENT PRIMARY KEY, patient_id INT NOT NULL,
      category ENUM('history','prescription','medication') NOT NULL,
      title VARCHAR(160) NOT NULL, details TEXT NOT NULL, record_date DATE NOT NULL,
      dosage VARCHAR(120) NOT NULL DEFAULT '', schedule_time CHAR(5) NOT NULL DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX patient_category (patient_id, category),
      FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`);
    await pool.query(`CREATE TABLE IF NOT EXISTS patient_health_readings (
      id INT AUTO_INCREMENT PRIMARY KEY, patient_id INT NOT NULL,
      metric ENUM('blood_pressure','heart_rate','weight','blood_sugar') NOT NULL,
      value DECIMAL(8,2) NOT NULL, secondary_value DECIMAL(8,2), measured_at DATETIME NOT NULL,
      INDEX patient_measurement (patient_id, measured_at),
      FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`);
    await pool.query(`CREATE TABLE IF NOT EXISTS patient_health_documents (
      id INT AUTO_INCREMENT PRIMARY KEY, patient_id INT NOT NULL,
      filename VARCHAR(180) NOT NULL, mime_type VARCHAR(50) NOT NULL,
      content MEDIUMBLOB NOT NULL, byte_size INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, INDEX patient_documents (patient_id),
      FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`);
    await pool.query(`CREATE TABLE IF NOT EXISTS patient_medication_doses (
      id INT AUTO_INCREMENT PRIMARY KEY, patient_id INT NOT NULL, medication_id INT NOT NULL,
      taken_date DATE NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY daily_dose (patient_id, medication_id, taken_date),
      FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (medication_id) REFERENCES patient_health_records(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`);
  })().catch(error => { ready = null; throw error; });
  return ready;
}
