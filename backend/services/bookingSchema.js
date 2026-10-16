import pool from '../config/db.js';
let ready;
export function ensureBookingSchema(){
  if(!ready)ready=(async()=>{
    await pool.query(`CREATE TABLE IF NOT EXISTS appointment_schedules (
      appointment_id INT PRIMARY KEY,starts_at_utc DATETIME NOT NULL,timezone VARCHAR(80) NOT NULL,
      FOREIGN KEY(appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
      INDEX starts_at(starts_at_utc)) ENGINE=InnoDB`);
    await pool.query(`CREATE TABLE IF NOT EXISTS doctor_registration_reviews (
      doctor_id INT PRIMARY KEY,status ENUM('Pending','Approved','Rejected','Revoked') NOT NULL,
      reason VARCHAR(1000) NOT NULL DEFAULT '',reviewer_id INT NULL,version INT NOT NULL DEFAULT 1,reviewed_at DATETIME NULL,
      FOREIGN KEY(doctor_id) REFERENCES doctors(id) ON DELETE CASCADE,
      FOREIGN KEY(reviewer_id) REFERENCES users(id) ON DELETE SET NULL) ENGINE=InnoDB`);
    await pool.query(`CREATE TABLE IF NOT EXISTS doctor_review_events (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,doctor_id INT NOT NULL,reviewer_id INT NULL,
      decision VARCHAR(12) NOT NULL,reason VARCHAR(1000) NOT NULL,created_at DATETIME NOT NULL,
      FOREIGN KEY(doctor_id) REFERENCES doctors(id) ON DELETE CASCADE,
      FOREIGN KEY(reviewer_id) REFERENCES users(id) ON DELETE SET NULL,INDEX doctor_events(doctor_id,id)) ENGINE=InnoDB`);
    await pool.query(`CREATE TABLE IF NOT EXISTS appointment_cloud_sync (
      appointment_id INT PRIMARY KEY,status ENUM('Pending','Synced') NOT NULL DEFAULT 'Pending',
      attempts INT NOT NULL DEFAULT 0,next_attempt DATETIME NOT NULL,error_code VARCHAR(60) NULL,synced_at DATETIME NULL,
      FOREIGN KEY(appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
      INDEX sync_queue(status,next_attempt)) ENGINE=InnoDB`);
  })().catch(error=>{ready=null;throw error;});
  return ready;
}
