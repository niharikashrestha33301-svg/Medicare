import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import pool from '../config/db.js';
import { transform } from '../../frontend/node_modules/esbuild/lib/main.js';

const source = fs.readFileSync(new URL('../../frontend/public/currency.js', import.meta.url), 'utf8');
const storage = new Map([
  ['medicare_doctors', JSON.stringify([{ consultationFee: 75 }])],
  ['medicare_appointments', JSON.stringify([{ fee: 75 }])]
]);
const context = vm.createContext({ Intl, localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) } });
vm.runInContext(source, context);
for (const [amount, expected] of [[499, '₹499'], [999, '₹999'], [1499, '₹1,499'], [149999, '₹1,49,999']]) {
  assert.equal(context.MedicareCurrency.formatINR(amount), expected);
}
assert.equal(JSON.parse(storage.get('medicare_doctors'))[0].consultationFee, 499);
assert.equal(JSON.parse(storage.get('medicare_appointments'))[0].currency, 'INR');
storage.set('medicare_doctors', JSON.stringify([{ consultationFee: 999, currency: 'INR' }]));
vm.runInContext(source, context);
assert.equal(JSON.parse(storage.get('medicare_doctors'))[0].consultationFee, 999);

for (const page of ['index.html', 'patient.html', 'doctor.html', 'admin.html']) {
  const html = fs.readFileSync(new URL(`../../${page}`, import.meta.url), 'utf8');
  for (const script of html.matchAll(/<script type="text\/babel">([\s\S]*?)<\/script>/g)) {
    await transform(script[1], { loader: 'jsx' });
  }
  assert.ok(!/\$(?!\{)|\bNPR\b|\bUSD\b/.test(html), `Old currency in ${page}`);
}

let bookingId;
try {
  const doctors = await (await fetch('http://localhost:5000/api/doctors')).json();
  assert.ok(doctors.doctors.length > 1000);
  assert.ok(doctors.doctors.every(doctor => doctor.currency === 'INR' && Number(doctor.consultationFee) === 499));
  const login = await (await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'aayush.sharma@example.com', password: 'patient123' })
  })).json();
  assert.ok(login.token);
  const response = await fetch('http://localhost:5000/api/appointments', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${login.token}` },
    body: JSON.stringify({ doctorId: doctors.doctors[0].id, appointmentDate: '2026-11-01', timeSlot: '09:00 AM', patientName: 'INR Test', patientEmail: 'inr-test@example.invalid', patientPhone: '0000000000', fee: 1 })
  });
  const booking = await response.json();
  bookingId = booking.appointmentId;
  assert.equal(response.status, 201);
  assert.equal(booking.amount, 499, 'Client-supplied fee must not override INR consultation price');
  assert.equal(booking.currency, 'INR');
  const [[stored]] = await pool.query('SELECT fee, currency FROM appointments WHERE id = ?', [bookingId]);
  assert.equal(Number(stored.fee), 499);
  assert.equal(stored.currency, 'INR');
  console.log('PASS: Indian formatting, cached-price migration, page syntax, all doctor fees, and server-priced INR booking.');
} finally {
  if (bookingId) await pool.query('DELETE FROM appointments WHERE id = ?', [bookingId]);
  await pool.end();
}
