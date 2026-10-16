import pool from '../config/db.js';
import bcrypt from 'bcryptjs';
try {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL, password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || password.length < 12 || Buffer.byteLength(password) > 72) throw new Error('Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD (12+ characters, at most 72 bytes) in your environment.');
  const [[existing]] = await pool.query('SELECT id FROM users WHERE email = ?', [email.trim().toLowerCase()]);
  if (existing) throw new Error('That email already exists. No existing account was changed.');
  await pool.query("INSERT INTO users (name, email, password, role, blood_group) VALUES (?, ?, ?, 'admin', 'Unknown')", [process.env.BOOTSTRAP_ADMIN_NAME || 'MediCare Administrator', email.trim().toLowerCase(), await bcrypt.hash(password, 12)]);
  console.log('Administrator created. No password was logged.');
} finally { await pool.end(); }
