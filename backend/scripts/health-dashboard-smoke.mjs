import assert from 'node:assert/strict';
import pool from '../config/db.js';
import fs from 'node:fs';
import { JSDOM } from '../../frontend/node_modules/jsdom/lib/api.js';

const base = process.env.HEALTH_TEST_URL || 'http://localhost:5000';
const emails = [0, 1].map(n => `health-test-${Date.now()}-${n}@example.com`);
async function call(path, token, method = 'GET', body) {
  const response = await fetch(base + '/api' + path, { signal: AbortSignal.timeout(15000), method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: response.headers.get('Content-Type')?.includes('application/json') ? await response.json() : await response.arrayBuffer() };
}
let appointmentId;
try {
  const accounts = [];
  for (const email of emails) {
    const result = await call('/auth/register', null, 'POST', { name: 'Health Dashboard Test', email, password: 'health-test-password' });
    assert.equal(result.status, 201); accounts.push(result.body);
  }
  const [a, b] = accounts, root = '/health-dashboard';
  assert.equal((await call(root)).status, 401);
  assert.equal((await call(root, 'invalid-token')).status, 401);
  const doctor = await call('/auth/login', null, 'POST', { email: 'dr.yushika@medicare.com', password: 'doctor123' });
  assert.equal((await call(root, doctor.body.token)).status, 403);
  const initial = await call(root, a.token);
  assert.equal(initial.status, 200);
  for (const key of ['records', 'readings', 'documents', 'doses', 'appointments']) assert.equal(initial.body[key].length, 0);
  const [[d]] = await pool.query('SELECT id, hospital_id FROM doctors LIMIT 1');
  const [appointment] = await pool.query(`INSERT INTO appointments (appointment_code, patient_id, doctor_id, hospital_id, patient_name, patient_email, patient_phone, appointment_date, time_slot, fee) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, ['HEALTH-TEST-' + Date.now(), a.user.id, d.id, d.hospital_id, a.user.name, a.user.email, '0000000000', '2030-01-01', '09:00 AM', 499]);
  appointmentId = appointment.insertId;
  assert.equal((await call(`/appointments/${appointmentId}/cancel`, b.token, 'PUT', { reason: 'Unauthorized test' })).status, 404);
  assert.equal((await call(`/appointments/${appointmentId}/status`, b.token, 'PUT', { status: 'Completed' })).status, 403);
  for (const metric of ['blood_pressure', 'heart_rate', 'weight', 'blood_sugar']) {
    assert.equal((await call(root + '/readings', a.token, 'POST', { metric, value: 100, secondaryValue: 70, measuredAt: '2026-10-15T10:30', patient_id: b.user.id })).status, 201);
  }
  assert.equal((await call(root + '/readings', a.token, 'POST', { metric: 'weight', value: -5, measuredAt: 'bad' })).status, 400);
  for (const category of ['history', 'prescription', 'medication']) assert.equal((await call(root + '/records', a.token, 'POST', { category, title: '<script>test</script>', details: 'Patient-entered test', recordDate: '2026-10-15', dosage: 'As prescribed', scheduleTime: '09:00', patient_id: b.user.id })).status, 201);
  assert.equal((await call(root + '/documents', a.token, 'POST', { filename: 'unsafe.html', mimeType: 'text/html', content: Buffer.from('<script>alert(1)</script>').toString('base64') })).status, 400);
  const pdf = Buffer.from('%PDF-1.4\n% Test document\n%%EOF');
  assert.equal((await call(root + '/documents', a.token, 'POST', { filename: 'report.pdf', mimeType: 'application/pdf', content: pdf.toString('base64') })).status, 201);
  const state = (await call(root, a.token)).body;
  assert.equal(state.appointments.length, 1); assert.equal(state.readings.length, 4); assert.equal(state.records.length, 3);
  const med = state.records.find(r => r.category === 'medication'), doc = state.documents[0];
  assert.equal((await call(root + `/medications/${med.id}/dose`, b.token, 'PUT', { date: '2026-10-15', taken: true })).status, 404);
  assert.equal((await call(root + `/medications/${med.id}/dose`, a.token, 'PUT', { date: '2026-10-15', taken: true })).status, 200);
  assert.equal((await call(root + `/medications/${med.id}/dose`, a.token, 'PUT', { date: '2026-10-15', taken: true })).status, 200);
  assert.equal((await call(root, a.token)).body.doses.length, 1);
  assert.equal((await call(root + `/documents/${doc.id}`, b.token)).status, 404);
  assert.ok(Buffer.from((await call(root + `/documents/${doc.id}`, a.token)).body).equals(pdf));
  for (const path of [`documents/${doc.id}`, `records/${med.id}`, `readings/${state.readings[0].id}`]) assert.equal((await call(root + '/' + path, b.token, 'DELETE')).status, 404);
  const other = (await call(root, b.token)).body;
  for (const key of ['records', 'readings', 'documents', 'doses', 'appointments']) assert.equal(other[key].length, 0);
  console.log('PASS: authentication, patient roles, real appointments, persistence, validation, owner-only documents and records, daily dose idempotency.');

  const html = fs.readFileSync(new URL('../../frontend/public/health.html', import.meta.url), 'utf8');
  const dom = new JSDOM(html, { url: base + '/health.html', runScripts: 'outside-only' });
  const w = dom.window;
  w.AbortSignal = globalThis.AbortSignal;
  w.AbortController = globalThis.AbortController;
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.fetch = (url, options) => fetch(String(url).replace('http://localhost:5000', base), options);
  w.localStorage.setItem('mc_user', JSON.stringify(a.user)); w.localStorage.setItem('mc_token', JSON.stringify(a.token));
  for (const file of ['portal-api.js', 'health-dashboard.js']) w.eval(fs.readFileSync(new URL('../../frontend/public/' + file, import.meta.url), 'utf8'));
  for (let i = 0; i < 60 && w.document.getElementById('dashboard').hidden; i++) await new Promise(r => setTimeout(r, 50));
  assert.equal(w.document.getElementById('dashboard').hidden, false);
  assert.equal(w.document.querySelectorAll('.stat').length, 4);
  assert.equal(w.document.querySelectorAll('#history-list script').length, 0);
  assert.ok(w.document.getElementById('history-list').textContent.includes('<script>test</script>'));
  assert.ok(w.document.querySelector('.chart-point'));
  w.document.querySelector('[data-metric="weight"]').click();
  assert.ok(w.document.getElementById('chart').textContent.includes('Weight'));
  w.document.getElementById('signout').click();
  assert.equal(w.document.getElementById('dashboard').hidden, true);
  w.close();
  console.log('PASS: dashboard renders real records, escapes markup, changes interactive charts, and hides records on sign-out.');
} finally {
  if (appointmentId) await pool.query('DELETE FROM appointments WHERE id = ?', [appointmentId]);
  await pool.query('DELETE FROM users WHERE email IN (?)', [emails]);
  await pool.end();
}
