import assert from 'node:assert/strict';
import pool from '../config/db.js';

const base = 'http://localhost:5000/api/auth';
const email = `auth-smoke-${Date.now()}@example.com`;
const post = async (route, body) => {
  const response = await fetch(`${base}/${route}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return { status: response.status, data: await response.json() };
};

try {
  assert.equal((await post('login', {})).status, 400);
  assert.equal((await post('register', { name: 'Test', email, password: 'short' })).status, 400);
  assert.equal((await post('register', { name: 'Test', email, password: 'test-password', role: 'admin' })).status, 400);
  const registration = await post('register', { name: 'Auth Smoke Test', email, password: 'test-password' });
  assert.equal(registration.status, 201);
  assert.ok(registration.data.token);
  assert.equal((await post('register', { name: 'Test', email, password: 'test-password' })).status, 400);
  assert.equal((await post('login', { email, password: 'wrong-password' })).status, 401);
  const login = await post('login', { email: ` ${email.toUpperCase()} `, password: 'test-password' });
  assert.equal(login.status, 200);
  const profile = await fetch(`${base}/me`, { headers: { Authorization: `Bearer ${login.data.token}` } });
  assert.equal(profile.status, 200);
  assert.equal((await profile.json()).user.email, email);
  const demo = await post('login', { email: 'aayush.sharma@example.com', password: 'patient123' });
  assert.equal(demo.status, 200);
  console.log('PASS: signup, duplicate email, validation, login, invalid password, JWT profile, and demo login');
} finally {
  await pool.query('DELETE FROM users WHERE email = ?', [email]);
  await pool.end();
}
