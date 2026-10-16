import express from 'express';
import { randomUUID } from 'node:crypto';
import pool from '../config/db.js';
import { protect, authorizeRoles } from '../middleware/authMiddleware.js';
import { assessSymptoms } from '../services/assistantAI.js';
import { QUESTIONS, EMERGENCY_REPLY } from '../services/assistantSafety.js';
import { encryptHistory, decryptHistory, historyAvailable } from '../services/assistantStorage.js';

const router = express.Router();
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
const limits = new Map();
function rateLimit(req, res, next) {
  const now = Date.now();
  if (limits.size > 2000) for (const [key, value] of limits) if (value.until < now) limits.delete(key);
  const key = req.ip;
  const current = limits.get(key);
  const entry = current?.until > now ? current : { count: 0, until: now + 60000 };
  limits.set(key, entry);
  if (++entry.count > 30) return res.status(429).json({ success: false, message: 'Please wait a minute before sending more messages.' });
  next();
}
export function validateMessages(value) {
  if (!Array.isArray(value) || !value.length || value.length > 20) return null;
  const result = [];
  let size = 0;
  for (const item of value) {
    if (!item || !['user', 'assistant'].includes(item.role) || typeof item.content !== 'string' || !item.content.trim() || item.content.length > 2000) return null;
    size += item.content.length;
    result.push({ role: item.role, content: item.content.trim() });
  }
  return size <= 12000 && result.some(item => item.role === 'user') ? result : null;
}
export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value && value >= today && date.valueOf() < Date.now() + 90 * 86400000;
}
export function futureSlot(date, slot) {
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(slot);
  if (!match || Number(match[1]) < 1 || Number(match[1]) > 12 || Number(match[2]) > 59) return false;
  const hour = Number(match[1]) % 12 + (match[3].toUpperCase() === 'PM' ? 12 : 0);
  return new Date(`${date}T${String(hour).padStart(2, '0')}:${match[2]}:00+05:30`).valueOf() > Date.now();
}

router.get('/config', (req, res) => res.json({ success: true, aiConfigured: Boolean(process.env.OPENAI_API_KEY), historyAvailable: historyAvailable(), retentionDays: 30 }));

async function recommendedDoctors(specialty) {
  const [doctors] = await pool.query(`SELECT d.id, u.name, u.email, d.specialization, d.experience, d.qualifications,
    d.consultation_fee AS consultationFee, d.currency, d.image, d.verified,
    h.id AS hospitalId, h.name AS hospital, u.role,
    (d.license_no LIKE 'DEMO-%' OR d.license_no LIKE 'DIRECTORY-DEMO-%') AS demo
    FROM doctors d JOIN users u ON u.id = d.user_id JOIN hospitals h ON h.id = d.hospital_id
    WHERE u.status = 'Active' AND d.specialization IN (?, 'General Physician', 'General Medicine')
    ORDER BY (d.specialization = ?) DESC,
      (u.email IN ('dr.yushika@medicare.com','dr.vidya@medicare.com','dr.akaash@medicare.com','dr.omkar@medicare.com','dr.bijoy@medicare.com','dr.radhe@medicare.com')) DESC,
      d.verified DESC, d.id DESC LIMIT 4`, [specialty, specialty]);
  if (doctors.length) {
    const [slots] = await pool.query('SELECT DISTINCT doctor_id, slot_time FROM doctor_slots WHERE doctor_id IN (?) ORDER BY slot_time', [doctors.map(doctor => doctor.id)]);
    for (const doctor of doctors) doctor.availableSlots = slots.filter(slot => slot.doctor_id === doctor.id).map(slot => slot.slot_time);
  }
  return doctors;
}

router.post('/chat', rateLimit, async (req, res) => {
  const messages = validateMessages(req.body.messages);
  if (!messages || messages.at(-1).role !== 'user') return res.status(400).json({ success: false, message: 'Send up to 20 short conversation messages, ending with your symptoms or answer.' });
  try {
    const assessment = await assessSymptoms(messages, req.body.aiConsent === true);
    if (assessment.emergency) return res.json({ success: true, mode: assessment.mode, emergency: true, urgency: 'emergency', reply: EMERGENCY_REPLY, question: null, doctors: [], specialty: null });
    const medicationRequest = /\b(prescrib\w*|prescription|dosage|dose|which medicine|what medicine|what drug|which tablet)\b/i.test(messages.at(-1).content);
    const intro = medicationRequest ? 'I cannot prescribe medicines, suggest doses, or confirm a diagnosis. A clinician needs to assess you. ' : '';
    const reply = assessment.ready
      ? `${intro}${assessment.urgency === 'urgent' ? 'Please seek an in-person medical assessment today, especially if symptoms are worsening. ' : ''}A ${assessment.specialty} consultation may be a suitable starting point. A clinician must assess the cause; this is a care-navigation suggestion, not a diagnosis. If symptoms are severe, sudden, or worsening, seek urgent care rather than waiting for a booking.`
      : `${intro}${QUESTIONS[assessment.question]}`;
    const doctors = assessment.ready ? await recommendedDoctors(assessment.specialty) : [];
    return res.json({ success: true, mode: assessment.mode, emergency: false, urgency: assessment.urgency, reply, question: assessment.ready ? null : assessment.question, specialty: assessment.ready ? assessment.specialty : null, doctors });
  } catch { return res.status(503).json({ success: false, message: 'Care navigation is temporarily unavailable. For urgent or worsening symptoms, contact a clinician directly.' }); }
});

router.get('/availability', async (req, res) => {
  const id = Number(req.query.doctorId);
  if (!Number.isSafeInteger(id) || id < 1 || !validDate(req.query.date)) return res.status(400).json({ success: false, message: 'Choose a valid doctor and a date within the next 90 days.' });
  try {
    const [slots] = await pool.query(`SELECT DISTINCT s.slot_time FROM doctor_slots s
      JOIN doctors d ON d.id = s.doctor_id JOIN users u ON u.id = d.user_id
      WHERE s.doctor_id = ? AND u.status = 'Active' AND NOT EXISTS (
        SELECT 1 FROM appointments a WHERE a.doctor_id = s.doctor_id AND a.appointment_date = ?
        AND a.time_slot = s.slot_time AND a.status IN ('Confirmed','Pending')) ORDER BY s.slot_time`, [id, req.query.date]);
    return res.json({ success: true, slots: slots.map(slot => slot.slot_time).filter(slot => futureSlot(req.query.date, slot)), date: req.query.date });
  } catch { return res.status(503).json({ success: false, message: 'Availability could not be loaded. Please retry.' }); }
});

router.post('/book', protect, authorizeRoles('patient'), rateLimit, async (req, res) => {
  const { doctorId, date, slot } = req.body;
  if (!Number.isSafeInteger(doctorId) || !validDate(date) || typeof slot !== 'string' || slot.length > 20 || !futureSlot(date, slot)) return res.status(400).json({ success: false, message: 'Choose a doctor, future date, and available time slot.' });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[doctor]] = await connection.query(`SELECT d.*, u.status FROM doctors d JOIN users u ON u.id = d.user_id WHERE d.id = ? FOR UPDATE`, [doctorId]);
    if (!doctor || doctor.status !== 'Active' || doctor.currency !== 'INR') { await connection.rollback(); return res.status(404).json({ success: false, message: 'This doctor is not currently available.' }); }
    const [[available]] = await connection.query('SELECT id FROM doctor_slots WHERE doctor_id = ? AND slot_time = ? LIMIT 1', [doctorId, slot]);
    const [booked] = await connection.query("SELECT id FROM appointments WHERE doctor_id = ? AND appointment_date = ? AND time_slot = ? AND status IN ('Confirmed','Pending')", [doctorId, date, slot]);
    if (!available || booked.length) { await connection.rollback(); return res.status(409).json({ success: false, message: 'That slot is no longer available. Please choose another.' }); }
    const [[patient]] = await connection.query('SELECT name, email, phone, gender FROM users WHERE id = ?', [req.user.id]);
    const code = 'APT-' + randomUUID().slice(0, 8).toUpperCase();
    const [result] = await connection.query(`INSERT INTO appointments
      (appointment_code, patient_id, doctor_id, hospital_id, patient_name, patient_email, patient_phone, patient_gender, appointment_date, time_slot, symptoms, status, fee, currency)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', 'Confirmed', ?, 'INR')`,
    [code, req.user.id, doctorId, doctor.hospital_id, patient.name, patient.email, patient.phone || '', patient.gender || 'Other', date, slot, doctor.consultation_fee]);
    await connection.commit();
    return res.status(201).json({ success: true, appointmentId: result.insertId, appointmentCode: code, amount: Number(doctor.consultation_fee), currency: 'INR', date, slot });
  } catch { await connection.rollback(); return res.status(503).json({ success: false, message: 'Booking could not be completed. Please retry.' }); }
  finally { connection.release(); }
});

router.post('/history', protect, authorizeRoles('patient'), async (req, res) => {
  const messages = validateMessages(req.body.messages);
  if (req.body.consent !== true || !messages) return res.status(400).json({ success: false, message: 'Explicit consent and a valid conversation are required to save.' });
  if (!historyAvailable()) return res.status(503).json({ success: false, message: 'Encrypted storage is not configured. Your conversation has not been saved.' });
  try {
    await pool.query('DELETE FROM assistant_conversations WHERE expires_at <= NOW()');
    const [[count]] = await pool.query('SELECT COUNT(*) AS count FROM assistant_conversations WHERE user_id = ?', [req.user.id]);
    if (count.count >= 30) return res.status(409).json({ success: false, message: 'You have 30 saved chats. Delete an older chat before saving another.' });
    const id = randomUUID();
    await pool.query('INSERT INTO assistant_conversations (id, user_id, encrypted_payload, consent_version, expires_at) VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 30 DAY))', [id, req.user.id, encryptHistory({ messages }, req.user.id), 'health-chat-v1']);
    return res.status(201).json({ success: true, id, retentionDays: 30 });
  } catch { return res.status(503).json({ success: false, message: 'The chat was not saved. Please retry later.' }); }
});
router.get('/history', protect, authorizeRoles('patient'), async (req, res) => {
  if (!historyAvailable()) return res.status(503).json({ success: false, message: 'Encrypted history is unavailable.' });
  try {
    const [rows] = await pool.query('SELECT id, encrypted_payload, created_at, expires_at FROM assistant_conversations WHERE user_id = ? AND expires_at > NOW() ORDER BY created_at DESC LIMIT 30', [req.user.id]);
    return res.json({ success: true, conversations: rows.map(row => ({ id: row.id, createdAt: row.created_at, expiresAt: row.expires_at, ...decryptHistory(row.encrypted_payload, req.user.id) })) });
  } catch { return res.status(503).json({ success: false, message: 'Saved chats could not be loaded.' }); }
});
router.delete('/history/:id', protect, authorizeRoles('patient'), async (req, res) => {
  if (!/^[a-f0-9-]{36}$/i.test(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid saved chat.' });
  try {
    const [result] = await pool.query('DELETE FROM assistant_conversations WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    return res.status(result.affectedRows ? 200 : 404).json({ success: Boolean(result.affectedRows), message: result.affectedRows ? 'Saved chat deleted.' : 'Saved chat not found.' });
  } catch { return res.status(503).json({ success: false, message: 'Chat could not be deleted.' }); }
});
export default router;
