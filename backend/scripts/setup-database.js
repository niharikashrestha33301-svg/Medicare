import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

const envPath = new URL('../.env', import.meta.url);
if (!existsSync(envPath)) writeFileSync(envPath, readFileSync(new URL('../.env.example', import.meta.url)));
let contents = readFileSync(envPath, 'utf8');
const configured = dotenv.parse(contents).JWT_SECRET;
if (!configured || configured.length < 32 || ['medicare_super_secret_jwt_key_2026', 'medicare_jwt_secret'].includes(configured)) {
  const replacement = 'JWT_SECRET=' + randomBytes(48).toString('hex');
  contents = /^JWT_SECRET=.*$/m.test(contents) ? contents.replace(/^JWT_SECRET=.*$/m, replacement) : contents + '\n' + replacement + '\n';
  writeFileSync(envPath, contents);
  console.log('A private JWT secret was saved in backend/.env. Existing sessions will need to sign in again after API restart.');
}
dotenv.config({ path: envPath });
const database = process.env.DB_NAME || 'medicare_db';
if (!/^[a-zA-Z0-9_]+$/.test(database)) throw new Error('DB_NAME must contain only letters, digits, or underscores.');
const connection = await mysql.createConnection({ host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT) || 3306, user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', connectTimeout: 10000 });
try {
  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\``);
  await connection.changeUser({ database });
  const sql = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8').replace(/^--.*$/gm, '');
  for (const statement of sql.split(';').map(s => s.trim()).filter(Boolean)) {
    if (/^(CREATE DATABASE|USE )/i.test(statement)) continue;
    await connection.query(statement);
  }
  const [indexes] = await connection.query("SHOW INDEX FROM appointments WHERE Key_name = 'appointment_slot_lookup'");
  const [ageColumns] = await connection.query("SHOW COLUMNS FROM users LIKE 'age'");
  if (!ageColumns.length) await connection.query('ALTER TABLE users ADD COLUMN age INT NULL');
  if (!indexes.length) await connection.query('CREATE INDEX appointment_slot_lookup ON appointments (doctor_id, appointment_date, time_slot, status)');
  await connection.query(`CREATE TABLE IF NOT EXISTS assistant_conversations (
    id CHAR(36) PRIMARY KEY, user_id INT NOT NULL, encrypted_payload MEDIUMBLOB NOT NULL,
    consent_version VARCHAR(40) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL, INDEX (user_id, created_at), INDEX (expires_at),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);
  const { ensureHealthSchema } = await import('../services/healthSchema.js');
  await ensureHealthSchema();
  const { ensureMedicineSchema } = await import('../services/medicineSchema.js');
  await ensureMedicineSchema();
  const [[counts]] = await connection.query('SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM doctors) AS doctors, (SELECT COUNT(*) FROM appointments) AS appointments');
  console.log('Database connected; additive schema setup complete. Existing records preserved.', counts);
} finally {
  await connection.end();
  const { default: pool } = await import('../config/db.js');
  await pool.end();
}
