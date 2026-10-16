import pool from '../config/db.js';

const connection = await pool.getConnection();
try {
  await connection.query(`CREATE TABLE IF NOT EXISTS app_migrations (name VARCHAR(191) PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
  for (const table of ['doctors', 'appointments']) {
    const [columns] = await connection.query(`SHOW COLUMNS FROM ${table} LIKE 'currency'`);
    if (!columns.length) await connection.query(`ALTER TABLE ${table} ADD COLUMN currency CHAR(3) NOT NULL DEFAULT 'INR'`);
  }
  await connection.query('ALTER TABLE doctors ALTER COLUMN consultation_fee SET DEFAULT 499');
  await connection.beginTransaction();
  const [existing] = await connection.query('SELECT name FROM app_migrations WHERE name = ?', ['consultation-inr-499-v1']);
  if (!existing.length) {
    await connection.query("UPDATE doctors SET consultation_fee = 499, currency = 'INR'");
    await connection.query("UPDATE appointments SET fee = 499, currency = 'INR'");
    await connection.query('INSERT INTO app_migrations (name) VALUES (?)', ['consultation-inr-499-v1']);
  }
  await connection.commit();
  console.log('INR migration complete: consultation and booking amounts are INR, with a default fee of 499.');
} catch (error) {
  await connection.rollback();
  throw error;
} finally {
  connection.release();
  await pool.end();
}
