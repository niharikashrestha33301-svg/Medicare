import pool from '../config/db.js';
import { id, slot, string, badRequest, fail } from '../utils/validation.js';
import {ensureBookingSchema} from '../services/bookingSchema.js';

// @desc   Get All Doctors with filters & slots
// @route  GET /api/doctors
export const getDoctors = async (req, res) => {
  try {
    await ensureBookingSchema();
    const { specialization, hospitalId, search } = req.query;

    let query = `
      SELECT 
        d.id, d.user_id, u.name, u.email, u.phone,
        d.specialization, d.license_no AS licenseNo, d.qualifications,
        d.experience, d.consultation_fee AS consultationFee, d.currency,
        d.about, d.verified, d.image,COALESCE(r.status,IF(d.verified,'Approved','Pending')) AS verificationStatus,
        ${req.adminDirectory?'r.reason AS reviewReason,COALESCE(r.version,0) AS reviewVersion,u.status AS accountStatus,':''}
        h.id AS hospitalId, h.name AS hospital
      FROM doctors d
      JOIN users u ON d.user_id = u.id
      JOIN hospitals h ON d.hospital_id = h.id
      LEFT JOIN doctor_registration_reviews r ON r.doctor_id=d.id
      WHERE ${req.adminDirectory?'1=1':"u.status = 'Active'"}
    `;
    const params = [];

    if (specialization && specialization !== 'All') {
      query += ' AND d.specialization = ?';
      params.push(specialization);
    }

    if (hospitalId && hospitalId !== 'All') {
      query += ' AND d.hospital_id = ?';
      params.push(hospitalId);
    }

    if (search) {
      query += ' AND (u.name LIKE ? OR d.specialization LIKE ? OR h.name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ` ORDER BY CASE u.email
      WHEN 'dr.ananya@medicare.com' THEN -1
      WHEN 'dr.yushika@medicare.com' THEN 0
      WHEN 'dr.vidya@medicare.com' THEN 1
      WHEN 'dr.akaash@medicare.com' THEN 2
      WHEN 'dr.omkar@medicare.com' THEN 3
      WHEN 'dr.bijoy@medicare.com' THEN 4
      WHEN 'dr.radhe@medicare.com' THEN 5
      ELSE 7 END, d.verified DESC, d.id DESC`;

    const [doctors] = await pool.query(query, params);

    // Load all matching slots together to keep large directories fast.
    const slotsByDoctor = new Map();
    if (doctors.length) {
      const [slots] = await pool.query('SELECT doctor_id, slot_time FROM doctor_slots WHERE doctor_id IN (?) ORDER BY id', [doctors.map(doctor => doctor.id)]);
      for (const slot of slots) {
        if (!slotsByDoctor.has(slot.doctor_id)) slotsByDoctor.set(slot.doctor_id, []);
        slotsByDoctor.get(slot.doctor_id).push(slot.slot_time);
      }
    }
    for (const doctor of doctors) doctor.availableSlots = slotsByDoctor.get(doctor.id) || [];

    res.json({ success: true, count: doctors.length, doctors });
  } catch (error) {
    console.error('Error fetching doctors:', error);
    fail(res, error);
  }
};

// @desc   Get Single Doctor
// @route  GET /api/doctors/:id
export const getDoctorById = async (req, res) => {
  try {
    const [doctors] = await pool.query(`
      SELECT 
        d.id, d.user_id, u.name, u.email, u.phone,
        d.specialization, d.license_no AS licenseNo, d.qualifications,
        d.experience, d.consultation_fee AS consultationFee, d.currency,
        d.about, d.verified, d.image,
        h.id AS hospitalId, h.name AS hospital
      FROM doctors d
      JOIN users u ON d.user_id = u.id
      JOIN hospitals h ON d.hospital_id = h.id
      WHERE d.id = ?
    `, [req.params.id]);

    if (doctors.length === 0) {
      return res.status(404).json({ success: false, message: 'Doctor not found' });
    }

    const doc = doctors[0];
    const [slots] = await pool.query('SELECT slot_time FROM doctor_slots WHERE doctor_id = ?', [doc.id]);
    doc.availableSlots = slots.map(s => s.slot_time);

    res.json({ success: true, doctor: doc });
  } catch (error) {
    fail(res, error);
  }
};

// @desc   Add Doctor Slot
// @route  POST /api/doctors/:id/slots
export const addSlot = async (req, res) => {
  let connection;
  try {
    const slotTime = slot(req.body.slotTime), doctorId = id(req.params.id);
    connection = await pool.getConnection(); await connection.beginTransaction();
    const [[doctor]] = await connection.query('SELECT user_id FROM doctors WHERE id = ? FOR UPDATE', [doctorId]);
    if (!doctor || doctor.user_id !== req.user.id) { await connection.rollback(); return res.status(404).json({ success: false, message: 'Doctor not found' }); }
    const [existing] = await connection.query('SELECT id FROM doctor_slots WHERE doctor_id = ? AND slot_time = ?', [doctorId, slotTime]);
    if (existing.length) throw Object.assign(new Error('This slot already exists.'), { status: 409 });
    await connection.query('INSERT INTO doctor_slots (doctor_id, slot_time) VALUES (?, ?)', [doctorId, slotTime]);
    await connection.commit();
    res.status(201).json({ success: true, message: `Slot ${slotTime} added successfully` });
  } catch (error) {
    if (connection) await connection.rollback(); fail(res, error);
  } finally { connection?.release(); }
};

export const removeSlot = async (req, res) => {
  try {
    const [result] = await pool.query(`DELETE s FROM doctor_slots s JOIN doctors d ON d.id = s.doctor_id WHERE d.id = ? AND d.user_id = ? AND s.slot_time = ?`, [id(req.params.id), req.user.id, slot(req.body.slotTime)]);
    if (!result.affectedRows) return res.status(404).json({ success: false, message: 'Slot not found' });
    res.json({ success: true });
  } catch (error) { fail(res, error); }
};

export const updateDoctor = async (req, res) => {
  let connection;
  try {
    await ensureBookingSchema();
    const doctorId = id(req.params.id), body = req.body;
    connection = await pool.getConnection(); await connection.beginTransaction();
    const [[existing]] = await connection.query('SELECT * FROM doctors WHERE id = ? AND user_id = ? FOR UPDATE', [doctorId, req.user.id]);
    if (!existing) {await connection.rollback();return res.status(404).json({ success: false, message: 'Doctor not found' });}
    const fee = body.consultationFee === undefined ? Number(existing.consultation_fee) : Number(body.consultationFee);
    if (!Number.isFinite(fee) || fee < 0 || fee > 999999) throw badRequest('Enter a valid INR consultation fee.');
    const qualifications = string(body.qualifications ?? existing.qualifications, 'qualifications', 255);
    const experience = string(body.experience ?? existing.experience, 'experience', 50);
    const about = string(body.about ?? existing.about ?? '', 'about', 5000, false);
    const specialization = string(body.specialization ?? existing.specialization, 'specialization', 100);
    const license = string(body.licenseNo ?? existing.license_no, 'license number', 100);
    const name = string(body.name ?? req.user.name, 'name', 150), phone = string(body.phone ?? req.user.phone ?? '', 'phone', 30, false);
    await connection.query('UPDATE users SET name = ?, phone = ? WHERE id = ?', [name, phone, req.user.id]);
    const verified = license === existing.license_no && qualifications === existing.qualifications && specialization === existing.specialization ? existing.verified : 0;
    await connection.query('UPDATE doctors SET qualifications = ?, experience = ?, about = ?, specialization = ?, consultation_fee = ?, currency = ?, license_no = ?, verified = ? WHERE id = ? AND user_id = ?', [qualifications, experience, about, specialization, fee, 'INR', license, verified, doctorId, req.user.id]);
    if(license!==existing.license_no||qualifications!==existing.qualifications||specialization!==existing.specialization){
      const reason='Professional credentials changed; administrator review required.';
      await connection.query("INSERT INTO doctor_registration_reviews(doctor_id,status,reason,version) VALUES (?,'Pending',?,1) ON DUPLICATE KEY UPDATE status='Pending',reason=VALUES(reason),reviewer_id=NULL,reviewed_at=NULL,version=version+1",[doctorId,reason]);
      await connection.query("INSERT INTO doctor_review_events(doctor_id,decision,reason,created_at) VALUES (?,'Pending',?,UTC_TIMESTAMP())",[doctorId,reason]);
    }
    await connection.commit();
    return getDoctorById(req, res);
  } catch (error) { if (connection) await connection.rollback(); fail(res, error); }
  finally { connection?.release(); }
};
