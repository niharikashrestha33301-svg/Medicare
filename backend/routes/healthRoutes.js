import express from 'express';
import pool from '../config/db.js';
import { protect, authorizeRoles } from '../middleware/authMiddleware.js';
import { ensureHealthSchema } from '../services/healthSchema.js';
import { ensureMedicineSchema } from '../services/medicineSchema.js';
import { ensureCareSchema } from '../services/careSchema.js';
import {consultationHistory} from '../services/videoStore.js';
import {appointmentSchedules} from '../services/appointmentScheduleStore.js';
import {appointmentDisplay} from '../services/consultationSchedule.js';

const router = express.Router();
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const invalid = message => Object.assign(new Error(message), { status: 400 });
const text = (value, max, required = true) => {
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) throw invalid('Please complete all fields within the allowed length.');
  return value.trim();
};
const date = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw invalid('Enter a valid date.');
  return value;
};
router.use(protect, authorizeRoles('patient'));
router.use((req, res, next) => express.json({ limit: req.path === '/documents' ? '3mb' : '100kb' })(req, res, next));
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
router.use((req, res, next) => ensureHealthSchema().then(() => next()).catch(next));

router.get('/', wrap(async (req, res) => {
  await ensureMedicineSchema();
  await ensureCareSchema();
  const owner = req.user.id;
  const [[records], [readings], [documents], [doses], [appointments]] = await Promise.all([
    pool.query("SELECT id, category, title, details, DATE_FORMAT(record_date, '%Y-%m-%d') AS record_date, dosage, schedule_time FROM patient_health_records WHERE patient_id = ? ORDER BY record_date DESC, id DESC", [owner]),
    pool.query("SELECT id, metric, value, secondary_value, DATE_FORMAT(measured_at, '%Y-%m-%dT%H:%i:%s') AS measured_at FROM patient_health_readings WHERE patient_id = ? ORDER BY measured_at, id", [owner]),
    pool.query('SELECT id, filename, mime_type, byte_size, created_at FROM patient_health_documents WHERE patient_id = ? ORDER BY id DESC', [owner]),
    pool.query("SELECT medication_id, DATE_FORMAT(taken_date, '%Y-%m-%d') AS taken_date FROM patient_medication_doses WHERE patient_id = ?", [owner]),
    pool.query(`SELECT a.id, a.appointment_code, DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS date,
      a.time_slot, a.status, u.name AS doctor_name, d.specialization, h.name AS hospital_name
      FROM appointments a JOIN doctors d ON d.id = a.doctor_id JOIN users u ON u.id = d.user_id
      JOIN hospitals h ON h.id = a.hospital_id WHERE a.patient_id = ? ORDER BY a.appointment_date, a.time_slot`, [owner])
  ]);
  const [[medicineCounts]] = await pool.query('SELECT COUNT(*) AS schedules, COALESCE(SUM(active=TRUE AND stock<=refill_at),0) AS lowSupply FROM medicine_plans WHERE patient_id=?', [owner]);
  const [[adherence]] = await pool.query("SELECT COUNT(*) AS scheduled, COALESCE(SUM(status='Taken'),0) AS taken FROM medicine_events WHERE patient_id=? AND status<>'Cancelled' AND due_at BETWEEN DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY) AND UTC_TIMESTAMP()", [owner]);
  const [recentDoses] = await pool.query("SELECT name, dosage, status, DATE_FORMAT(due_at, '%Y-%m-%dT%H:%i:%sZ') AS due_at FROM medicine_events WHERE patient_id=? AND status<>'Cancelled' AND due_at<=UTC_TIMESTAMP() ORDER BY due_at DESC LIMIT 5", [owner]);
  let consultations=[],consultationsError=null;
  try{consultations=await consultationHistory(req.user);}catch{consultationsError='Consultation history is temporarily unavailable. Check the video database connection.';}
  const schedules=await appointmentSchedules(appointments.map(a=>a.id));
  const visits=appointments.map(a=>{const display=appointmentDisplay({...a,...schedules.get(a.id)});return {...display,time_slot:display.timeSlot};});
  res.json({ success: true, user: { name: req.user.name, email: req.user.email }, records, readings, documents, doses, appointments:visits,consultations,consultationsError,
    medicineReminders: { ...medicineCounts, adherence: { ...adherence, percentage: adherence.scheduled ? Math.round(adherence.taken / adherence.scheduled * 100) : null }, recentDoses } });
}));

router.post('/records', wrap(async (req, res) => {
  const { category } = req.body;
  if (!['history', 'prescription', 'medication'].includes(category)) throw invalid('Unknown record type.');
  const title = text(req.body.title, 160), details = text(req.body.details || '', 5000, false);
  const recordDate = date(req.body.recordDate), dosage = text(req.body.dosage || '', 120, false);
  const schedule = req.body.scheduleTime || '';
  if (schedule && !/^([01]\d|2[0-3]):[0-5]\d$/.test(schedule)) throw invalid('Enter a valid reminder time.');
  await pool.query(`INSERT INTO patient_health_records (patient_id, category, title, details, record_date, dosage, schedule_time)
    VALUES (?, ?, ?, ?, ?, ?, ?)`, [req.user.id, category, title, details, recordDate, dosage, schedule]);
  res.status(201).json({ success: true });
}));
router.delete('/records/:id', wrap(async (req, res) => {
  const [result] = await pool.query('DELETE FROM patient_health_records WHERE id = ? AND patient_id = ?', [req.params.id, req.user.id]);
  res.status(result.affectedRows ? 200 : 404).json({ success: !!result.affectedRows, message: 'Record not found' });
}));
router.put('/records/:id', wrap(async (req, res) => {
  const title = text(req.body.title, 160), details = text(req.body.details || '', 5000, false);
  const recordDate = date(req.body.recordDate), dosage = text(req.body.dosage || '', 120, false), schedule = req.body.scheduleTime || '';
  if (schedule && !/^([01]\d|2[0-3]):[0-5]\d$/.test(schedule)) throw invalid('Enter a valid reminder time.');
  const [result] = await pool.query('UPDATE patient_health_records SET title = ?, details = ?, record_date = ?, dosage = ?, schedule_time = ? WHERE id = ? AND patient_id = ?', [title, details, recordDate, dosage, schedule, req.params.id, req.user.id]);
  res.status(result.affectedRows ? 200 : 404).json({ success: !!result.affectedRows, message: 'Record not found' });
}));
router.post('/readings', wrap(async (req, res) => {
  const { metric, value, secondaryValue, measuredAt } = req.body;
  if (!['blood_pressure', 'heart_rate', 'weight', 'blood_sugar'].includes(metric)) throw invalid('Unknown measurement.');
  const number = v => typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 99999;
  if (!number(value) || (metric === 'blood_pressure' && !number(secondaryValue))) throw invalid('Enter positive numeric measurements.');
  if (typeof measuredAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(measuredAt)) throw invalid('Enter a valid measurement date and time.');
  date(measuredAt.slice(0, 10));
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(measuredAt.slice(11))) throw invalid('Enter a valid time.');
  await pool.query('INSERT INTO patient_health_readings (patient_id, metric, value, secondary_value, measured_at) VALUES (?, ?, ?, ?, ?)',
    [req.user.id, metric, value, metric === 'blood_pressure' ? secondaryValue : null, measuredAt.replace('T', ' ') + ':00']);
  res.status(201).json({ success: true });
}));
router.delete('/readings/:id', wrap(async (req, res) => {
  const [result] = await pool.query('DELETE FROM patient_health_readings WHERE id = ? AND patient_id = ?', [req.params.id, req.user.id]);
  res.status(result.affectedRows ? 200 : 404).json({ success: !!result.affectedRows, message: 'Reading not found' });
}));
router.put('/medications/:id/dose', wrap(async (req, res) => {
  const day = date(req.body.date);
  if (typeof req.body.taken !== 'boolean') throw invalid('Choose whether the dose was taken.');
  const [rows] = await pool.query("SELECT id FROM patient_health_records WHERE id = ? AND patient_id = ? AND category = 'medication'", [req.params.id, req.user.id]);
  if (!rows.length) return res.status(404).json({ success: false, message: 'Medication not found' });
  if (req.body.taken) await pool.query('INSERT IGNORE INTO patient_medication_doses (patient_id, medication_id, taken_date) VALUES (?, ?, ?)', [req.user.id, req.params.id, day]);
  else await pool.query('DELETE FROM patient_medication_doses WHERE patient_id = ? AND medication_id = ? AND taken_date = ?', [req.user.id, req.params.id, day]);
  res.json({ success: true });
}));

// Documents stay in MySQL and are delivered only through this owner-checked route.
router.post('/documents', express.json({ limit: '3mb' }), wrap(async (req, res) => {
  const filename = text(req.body.filename, 180).replace(/[\x00-\x1f\x7f/\\]/g, '_');
  const { content, mimeType } = req.body;
  if (typeof content !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(content)) throw invalid('Invalid file.');
  const bytes = Buffer.from(content, 'base64');
  if (!bytes.length || bytes.length > 2 * 1024 * 1024) throw invalid('Choose a file no larger than 2 MB.');
  const pdf = mimeType === 'application/pdf' && bytes.subarray(0, 5).toString() === '%PDF-';
  const png = mimeType === 'image/png' && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpeg = mimeType === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (!pdf && !png && !jpeg) throw invalid('Upload a PDF, PNG, or JPEG document.');
  await pool.query('INSERT INTO patient_health_documents (patient_id, filename, mime_type, content, byte_size) VALUES (?, ?, ?, ?, ?)', [req.user.id, filename, mimeType, bytes, bytes.length]);
  res.status(201).json({ success: true });
}));
router.get('/documents/:id', wrap(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM patient_health_documents WHERE id = ? AND patient_id = ?', [req.params.id, req.user.id]);
  if (!rows.length) return res.status(404).json({ success: false, message: 'Document not found' });
  const file = rows[0];
  res.set({ 'Content-Type': file.mime_type, 'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': `attachment; filename="medical-report"; filename*=UTF-8''${encodeURIComponent(file.filename)}` });
  res.send(file.content);
}));
router.delete('/documents/:id', wrap(async (req, res) => {
  const [result] = await pool.query('DELETE FROM patient_health_documents WHERE id = ? AND patient_id = ?', [req.params.id, req.user.id]);
  res.status(result.affectedRows ? 200 : 404).json({ success: !!result.affectedRows, message: 'Document not found' });
}));
router.use((error, req, res, next) => {
  console.error('Health dashboard:', error.code || error.message);
  res.status(error.status || 500).json({ success: false, message: error.status === 400 ? error.message : error.status === 413 ? 'File is too large.' : 'Health records are unavailable. Please retry.' });
});
export default router;
