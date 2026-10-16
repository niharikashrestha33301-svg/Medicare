import { randomUUID } from 'node:crypto';
import pool from '../config/db.js';
import { CURRENCY } from '../config/currency.js';
import { id, date, slot, string, badRequest, fail } from '../utils/validation.js';
import {ensureCareSchema} from '../services/careSchema.js';
import {appointmentMoment,roomAccess,appointmentDisplay,appointmentTimezone} from '../services/consultationSchedule.js';
import {appointmentSchedules} from '../services/appointmentScheduleStore.js';
import {utcSQL} from '../services/medicineTime.js';
import {ensureBookingSchema} from '../services/bookingSchema.js';
import {syncAppointment} from '../services/appointmentSync.js';

export const bookAppointment = async (req, res) => {
  let connection;
  try {
    await ensureBookingSchema();
    const doctorId = id(req.body.doctorId, 'doctor');
    const appointmentDate = date(req.body.appointmentDate), timeSlot = slot(req.body.timeSlot);
    const at=appointmentMoment(appointmentDate,timeSlot);if(!at||at.getTime()<=Date.now())throw badRequest('Choose a future appointment date and time.');
    if(req.createVideoRoom)await ensureCareSchema();
    const patientName = string(req.body.patientName || req.user.name, 'patient name', 150);
    const patientPhone = string(req.body.patientPhone || '', 'phone', 30);
    const phoneDigits=patientPhone.replace(/\D/g,'');if(!/^\+?[\d ().-]+$/.test(patientPhone)||phoneDigits.length<7||phoneDigits.length>15)throw badRequest('Enter a valid patient contact phone number.');
    const symptoms = string(req.body.symptoms || '', 'symptoms', 5000, false);
    const suppliedAge=req.body.patientAge??req.user.age,age=suppliedAge===null||suppliedAge===undefined||suppliedAge===''?null:Number(suppliedAge),gender=req.body.patientGender||req.user.gender||'Other';
    if (age!==null&&(!Number.isInteger(age)||age<0||age>130)||!['Male','Female','Other'].includes(gender)) throw badRequest('Invalid patient age or gender.');
    connection = await pool.getConnection(); await connection.beginTransaction();
    // Serialize all bookings for this doctor, including requests on separate API workers.
    const [[doctor]] = await connection.query(`SELECT d.consultation_fee, d.hospital_id, d.currency, d.verified, u.status FROM doctors d JOIN users u ON u.id = d.user_id WHERE d.id = ? FOR UPDATE`, [doctorId]);
    if (!doctor || doctor.status !== 'Active') throw Object.assign(new Error('Doctor is unavailable.'), { status: 404 });
    if (!doctor.verified) throw Object.assign(new Error('This doctor is awaiting administrator verification.'), { status: 409 });
    const amount = Number(doctor.consultation_fee);
    if (doctor.currency !== CURRENCY || !Number.isFinite(amount) || amount < 0) throw badRequest('Doctor fee must be configured in INR.');
    const [slots] = await connection.query('SELECT slot_time FROM doctor_slots WHERE doctor_id = ?', [doctorId]);
    if (!slots.some(s => { try { return slot(s.slot_time) === timeSlot; } catch { return false; } })) throw badRequest('Choose an available doctor time slot.');
    const [conflicts] = await connection.query("SELECT id,time_slot FROM appointments WHERE doctor_id = ? AND appointment_date = ? AND status IN ('Pending','Confirmed') FOR UPDATE", [doctorId, appointmentDate]);
    if (conflicts.some(a=>{try{return slot(a.time_slot)===timeSlot;}catch{return false;}})) throw Object.assign(new Error('This appointment slot is already booked. Choose another time.'), { status: 409 });
    const code = `APT-${randomUUID()}`;
    const [result] = await connection.query(`INSERT INTO appointments (appointment_code, patient_id, doctor_id, hospital_id, patient_name, patient_email, patient_phone, patient_age, patient_gender, appointment_date, time_slot, symptoms, status, fee, currency) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Confirmed', ?, ?)`, [code, req.user.id, doctorId, doctor.hospital_id, patientName, req.user.email, patientPhone, age, gender, appointmentDate, timeSlot, symptoms, amount, CURRENCY]);
    await connection.query('INSERT INTO appointment_schedules(appointment_id,starts_at_utc,timezone) VALUES(?,?,?)',[result.insertId,utcSQL(at),appointmentTimezone()]);
    let roomId;
    if(req.createVideoRoom){roomId=randomUUID();await connection.query('INSERT INTO video_consultations (id,appointment_id) VALUES (?,?)',[roomId,result.insertId]);}
    await connection.query('INSERT INTO appointment_cloud_sync(appointment_id,next_attempt) VALUES (?,UTC_TIMESTAMP())',[result.insertId]);
    await connection.commit();
    const supabase=await syncAppointment(req.user,result.insertId);
    res.status(201).json({ success: true, appointmentId: result.insertId, appointmentCode: code, amount, currency: CURRENCY,status:'Confirmed',date:appointmentDate,timeSlot,startsAt:at.toISOString(),timezone:appointmentTimezone(),doctorId,storage:{primary:'MySQL',supabase},...(roomId?{roomId}:{} ) });
  } catch (error) { if (connection) await connection.rollback(); fail(res, error); }
  finally { connection?.release(); }
};

export const getMyAppointments = async (req, res) => {
  try {
    const admin = req.user.role === 'admin', doctor = req.user.role === 'doctor';
    const [appointments] = await pool.query(`SELECT a.id, a.appointment_code AS appointmentCode, a.patient_name AS patientName, a.patient_email AS patientEmail, a.patient_phone AS patientPhone, a.patient_age AS patientAge, a.patient_gender AS patientGender, u.name AS doctorName, u.email AS doctorEmail, d.specialization, h.name AS hospitalName, DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS date, a.time_slot AS timeSlot, a.symptoms, a.status, a.fee, a.currency, a.cancel_reason AS cancelReason, a.created_at AS createdAt FROM appointments a JOIN doctors d ON d.id = a.doctor_id JOIN users u ON u.id = d.user_id JOIN hospitals h ON h.id = a.hospital_id ${admin ? '' : doctor ? 'WHERE d.user_id = ?' : 'WHERE a.patient_id = ?'} ORDER BY a.appointment_date DESC, a.id DESC`, admin ? [] : [req.user.id]);
    const schedules=await appointmentSchedules(appointments.map(a=>a.id));
    res.json({ success: true, appointments:appointments.map(a=>{const view=appointmentDisplay({...a,...schedules.get(a.id)});return {...view,...roomAccess(view)};}) });
  } catch (error) { fail(res, error); }
};

export const cancelAppointment = async (req, res) => {
  req.body.status = 'Cancelled';
  return updateAppointmentStatus(req, res);
};

export const updateAppointmentStatus = async (req, res) => {
  let connection;
  try {
    await ensureBookingSchema();
    const appointmentId = id(req.params.id, 'appointment'), status = req.body.status;
    if (!['Pending','Confirmed','Completed','Cancelled'].includes(status)) throw badRequest('Invalid appointment status.');
    if (req.user.role === 'patient' && status !== 'Cancelled') return res.status(403).json({ success: false, message: 'Patients may only cancel their own bookings.' });
    const reason = string(req.body.reason || '', 'cancellation reason', 255, false);
    connection = await pool.getConnection(); await connection.beginTransaction();
    const [[found]] = await connection.query('SELECT doctor_id FROM appointments WHERE id = ?', [appointmentId]);
    if (!found) throw Object.assign(new Error('Appointment not found'), { status: 404 });
    // Use the same lock order as booking to prevent concurrent slot reactivation.
    const [[bookingDoctor]]=await connection.query('SELECT id,verified FROM doctors WHERE id = ? FOR UPDATE', [found.doctor_id]);
    const [[appointment]] = await connection.query(`SELECT a.*,DATE_FORMAT(a.appointment_date,'%Y-%m-%d') AS booking_day, d.user_id AS doctor_user_id FROM appointments a JOIN doctors d ON d.id = a.doctor_id WHERE a.id = ? FOR UPDATE`, [appointmentId]);
    const allowed = req.user.role === 'admin' || (req.user.role === 'doctor' && appointment.doctor_user_id === req.user.id) || (req.user.role === 'patient' && appointment.patient_id === req.user.id);
    if (!allowed) throw Object.assign(new Error('Appointment not found'), { status: 404 });
    if(appointment.status==='Completed'&&status!==appointment.status)throw badRequest('Completed appointments cannot be changed.');
    if(appointment.status==='Cancelled'&&status==='Completed')throw badRequest('A cancelled appointment cannot be completed.');
    if (['Pending','Confirmed'].includes(status)) {
      if(!bookingDoctor?.verified)throw Object.assign(new Error('This doctor is awaiting administrator verification.'),{status:409});
      const [[schedule]]=await connection.query("SELECT DATE_FORMAT(starts_at_utc,'%Y-%m-%dT%H:%i:%sZ') AS startsAt FROM appointment_schedules WHERE appointment_id=?",[appointmentId]);
      const at=schedule?new Date(schedule.startsAt):appointmentMoment(appointment.booking_day,appointment.time_slot);if(!at||at.getTime()<=Date.now())throw badRequest('A past appointment cannot be reopened.');
      const [conflicts] = await connection.query("SELECT id,time_slot FROM appointments WHERE doctor_id = ? AND appointment_date = ? AND id <> ? AND status IN ('Pending','Confirmed') FOR UPDATE", [appointment.doctor_id, appointment.appointment_date, appointmentId]);
      if (conflicts.some(a=>{try{return slot(a.time_slot)===slot(appointment.time_slot);}catch{return false;}})) throw Object.assign(new Error('This slot has already been booked.'), { status: 409 });
    }
    await connection.query('UPDATE appointments SET status = ?, cancel_reason = ? WHERE id = ?', [status, status === 'Cancelled' ? reason || 'User requested cancellation' : null, appointmentId]);
    await connection.query("INSERT INTO appointment_cloud_sync(appointment_id,next_attempt) VALUES (?,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE status='Pending',next_attempt=UTC_TIMESTAMP()",[appointmentId]);
    await connection.commit(); res.json({ success: true, message: `Appointment ${status.toLowerCase()}.` });
  } catch (error) { if (connection) await connection.rollback(); fail(res, error); }
  finally { connection?.release(); }
};
