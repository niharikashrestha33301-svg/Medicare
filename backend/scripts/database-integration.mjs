import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import pool from '../config/db.js';

const base = process.env.DATABASE_TEST_URL || 'http://localhost:5000';
const tag = 'database-test-' + Date.now(), emails = [], userIds = [], hospitalIds = [];
const password = 'test-strong-password';
async function api(path, token, method = 'GET', body) {
  const response = await fetch(base + '/api' + path, { signal: AbortSignal.timeout(15000), method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, data: await response.json() };
}
async function register(role, suffix, extra = {}) {
  const email = `${tag}-${suffix}@example.com`; emails.push(email);
  const result = await api('/auth/register', null, 'POST', { name: 'Database Integration Test', email, password, role, ...extra });
  assert.equal(result.status, 201, JSON.stringify(result.data)); userIds.push(result.data.user.id); return result.data;
}
try {
  assert.equal((await api('/health')).status, 200);
  const adminEmail = `${tag}-admin@example.com`; emails.push(adminEmail);
  const [created] = await pool.query("INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, 'admin')", ['Test Administrator', adminEmail, await bcrypt.hash(password, 10)]); userIds.push(created.insertId);
  const admin = (await api('/auth/login', null, 'POST', { email: adminEmail, password })).data;
  const a = await register('patient', 'a', { age: 29 }), b = await register('patient', 'b');
  assert.equal((await api('/auth/me', a.token)).data.user.age, 29);
  assert.equal((await api('/auth/register', null, 'POST', { name: 'No', email: `${tag}-illegal@example.com`, password, role: 'admin' })).status, 400);
  assert.equal((await api('/admin/users', a.token)).status, 403);
  const hospital = await api('/hospitals', admin.token, 'POST', { name: tag, city: 'Test city', address: 'Test address', phone: '0000000000', departments: ['Test department'] });
  assert.equal(hospital.status, 201); hospitalIds.push(hospital.data.hospitalId);
  assert.equal((await api('/hospitals', a.token, 'POST', {})).status, 403);
  const doctor = await register('doctor', 'doctor', { hospitalId: hospital.data.hospitalId, specialization: 'General Physician', licenseNo: tag, qualifications: 'Test qualification', consultationFee: 789 });
  const otherDoctor = await register('doctor', 'other-doctor', { hospitalId: hospital.data.hospitalId, licenseNo: tag + '-other' });
  const [doctorRows] = await pool.query('SELECT id FROM doctors WHERE user_id IN (?, ?) ORDER BY user_id', [doctor.user.id, otherDoctor.user.id]);
  const doctorId = doctorRows[0].id;
  const duplicateEmail = `${tag}-duplicate-license@example.com`;
  const duplicateDoctor = await api('/auth/register', null, 'POST', { name: 'Duplicate License', email: duplicateEmail, password, role: 'doctor', hospitalId: hospital.data.hospitalId, licenseNo: tag });
  assert.equal(duplicateDoctor.status, 409);
  const [orphans] = await pool.query('SELECT id FROM users WHERE email = ?', [duplicateEmail]); assert.equal(orphans.length, 0);
  assert.equal((await api(`/doctors/${doctorId}/slots`, otherDoctor.token, 'POST', { slotTime: '04:30 PM' })).status, 404);
  assert.equal((await api(`/doctors/${doctorId}/slots`, doctor.token, 'POST', { slotTime: '04:30 PM' })).status, 201);
  assert.equal((await api(`/doctors/${doctorId}/slots`, doctor.token, 'POST', { slotTime: '04:30 PM' })).status, 409);
  assert.equal((await api(`/doctors/${doctorId}/slots`, doctor.token, 'DELETE', { slotTime: '04:30 PM' })).status, 200);
  assert.equal((await api(`/doctors/${doctorId}`, otherDoctor.token, 'PUT', { consultationFee: 1 })).status, 404);
  assert.equal((await api(`/doctors/${doctorId}`, doctor.token, 'PUT', { consultationFee: 850, about: 'Saved through the API' })).status, 200);
  assert.equal(Number((await api(`/doctors/${doctorId}`)).data.doctor.consultationFee), 850);
  const payload = { doctorId, appointmentDate: '2031-10-15', timeSlot: '09:00 AM', patientPhone: '0000000000', patientName: 'Test Patient', patientAge: 30, patientGender: 'Other', fee: 1, patientEmail: b.user.email };
  assert.equal((await api('/appointments', doctor.token, 'POST', payload)).status, 403);
  assert.equal((await api('/appointments', a.token, 'POST', payload)).status, 409);
  assert.equal((await api(`/admin/doctors/${doctorId}/verify`, admin.token, 'PUT')).status, 200);
  assert.equal((await api('/appointments', a.token, 'POST', { ...payload, appointmentDate: '2020-01-01' })).status, 400);
  assert.equal((await api('/appointments', a.token, 'POST', { ...payload, timeSlot: '08:17 AM' })).status, 400);
  const race = await Promise.all([api('/appointments', a.token, 'POST', payload), api('/appointments', a.token, 'POST', payload)]);
  assert.deepEqual(race.map(r => r.status).sort(), [201, 409]);
  const booked = race.find(r => r.status === 201).data;
  await pool.query("UPDATE appointments SET time_slot='9:00 AM' WHERE id=? AND patient_id=?",[booked.appointmentId,a.user.id]);
  assert.equal((await api('/appointments',b.token,'POST',payload)).status,409,'Legacy 9:00 and canonical 09:00 must conflict');
  assert.equal((await api('/doctors/'+doctorId+'/availability?date='+payload.appointmentDate)).data.slots.find(s=>s.time==='09:00 AM').available,false);
  assert.equal(booked.amount, 850); assert.equal(booked.currency, 'INR');
  const owned = (await api('/appointments/my', a.token)).data.appointments;
  assert.equal(owned.length, 1); assert.equal(owned[0].patientEmail, a.user.email);
  assert.equal((await api('/appointments/my', b.token)).data.appointments.length, 0);
  assert.equal((await api(`/appointments/${booked.appointmentId}/cancel`, b.token, 'PUT', { reason: 'Unauthorized' })).status, 404);
  assert.equal((await api(`/appointments/${booked.appointmentId}/status`, a.token, 'PUT', { status: 'Completed' })).status, 403);
  assert.equal((await api(`/appointments/${booked.appointmentId}/status`, otherDoctor.token, 'PUT', { status: 'Completed' })).status, 404);
  assert.equal((await api(`/appointments/${booked.appointmentId}/cancel`, a.token, 'PUT', { reason: 'Test cancellation' })).status, 200);
  const replacement = await api('/appointments', b.token, 'POST', payload); assert.equal(replacement.status, 201);
  assert.equal((await api(`/appointments/${booked.appointmentId}/status`, doctor.token, 'PUT', { status: 'Confirmed' })).status, 409);
  assert.equal((await api(`/appointments/${replacement.data.appointmentId}/status`, doctor.token, 'PUT', { status: 'Completed' })).status, 200);
  assert.equal((await api('/auth/me', a.token, 'PUT', { name: 'Updated Test Patient', phone: '0000000001', bloodGroup: 'A+', gender: 'Other', dob: '1995-01-01', role: 'admin' })).status, 200);
  const profile = (await api('/auth/me', a.token)).data.user;
  assert.equal(profile.role, 'patient'); assert.equal(profile.name, 'Updated Test Patient');
  const record = { category: 'history', title: 'Test history', recordDate: '2026-10-15', details: 'Original' };
  assert.equal((await api('/health-dashboard/records', a.token, 'POST', record)).status, 201);
  const recordId = (await api('/health-dashboard', a.token)).data.records[0].id;
  assert.equal((await api(`/health-dashboard/records/${recordId}`, b.token, 'PUT', { ...record, title: 'Unauthorized' })).status, 404);
  assert.equal((await api(`/health-dashboard/records/${recordId}`, a.token, 'PUT', { ...record, title: 'Updated history' })).status, 200);
  assert.equal((await api('/health-dashboard', a.token)).data.records[0].title, 'Updated history');
  assert.equal((await api(`/health-dashboard/records/${recordId}`, a.token, 'DELETE')).status, 200);
  assert.equal((await api('/emergency')).data.tracking.available, false);
  const adminAccount = { name: 'Created Test Admin', email: `${tag}-second-admin@example.com`, password, role: 'admin' }; emails.push(adminAccount.email);
  const secondaryAdmin = await api('/admin/users', admin.token, 'POST', adminAccount); assert.equal(secondaryAdmin.status, 201); userIds.push(secondaryAdmin.data.user.id);
  assert.equal((await api(`/admin/users/${a.user.id}/status`, admin.token, 'PUT')).status, 200);
  assert.equal((await api('/auth/me', a.token)).status, 403);
  assert.equal((await api(`/admin/users/${a.user.id}/status`, admin.token, 'PUT')).status, 200);
  assert.equal((await api('/auth/login', null, 'POST', { email: a.user.email, password: 'wrong-password' })).status, 401);
  const [[stored]] = await pool.query('SELECT password FROM users WHERE id = ?', [a.user.id]); assert.notEqual(stored.password, password); assert.ok(await bcrypt.compare(password, stored.password));
  console.log('PASS: database connection, password hashing, patient/doctor/admin signup and login, role boundaries, profile CRUD, hospital creation, doctor ownership and INR fees, concurrent booking conflict, cancellation and status ownership, private health updates, suspension, and honest ambulance availability.');
} finally {
  if (userIds.length) {
    await pool.query('DELETE FROM appointments WHERE patient_id IN (?) OR doctor_id IN (SELECT id FROM doctors WHERE user_id IN (?))', [userIds, userIds]);
    await pool.query('DELETE FROM users WHERE id IN (?) AND email IN (?)', [userIds, emails]);
  }
  for (const hospitalId of hospitalIds) { await pool.query('DELETE FROM hospital_departments WHERE hospital_id = ?', [hospitalId]); await pool.query('DELETE FROM hospitals WHERE id = ?', [hospitalId]); }
  await pool.end();
}
