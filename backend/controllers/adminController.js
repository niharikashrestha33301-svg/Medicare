import pool from '../config/db.js';
import { fail,id,string,badRequest } from '../utils/validation.js';
import {ensureBookingSchema} from '../services/bookingSchema.js';

// @desc   Get All Users (Admin)
// @route  GET /api/admin/users
export const getAllUsers = async (req, res) => {
  try {
    const [users] = await pool.query('SELECT id, name, email, phone, role, status, dob, gender, blood_group, created_at FROM users ORDER BY id DESC');
    res.json({ success: true, count: users.length, users });
  } catch (error) {
    fail(res, error);
  }
};

// @desc   Toggle User Status (Active / Suspended)
// @route  PATCH /api/admin/users/:id/status
export const toggleUserStatus = async (req, res) => {
  try {
    if (Number(req.params.id) === req.user.id) return res.status(400).json({ success: false, message: 'You cannot suspend your own administrator account.' });
    const [users] = await pool.query('SELECT status FROM users WHERE id = ?', [req.params.id]);
    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const nextStatus = users[0].status === 'Active' ? 'Suspended' : 'Active';
    await pool.query('UPDATE users SET status = ? WHERE id = ?', [nextStatus, req.params.id]);

    res.json({ success: true, message: `User status changed to ${nextStatus}`, status: nextStatus });
  } catch (error) {
    fail(res, error);
  }
};

// @desc   Toggle Doctor Verification Status
// @route  PATCH /api/admin/doctors/:id/verify
export const toggleDoctorVerification = async (req, res) => {
  return reviewDoctor(req,res,true);
};

export async function reviewDoctor(req,res,legacy=false){
  let connection;
  try{
    await ensureBookingSchema();const doctorId=id(req.params.id,'doctor');connection=await pool.getConnection();await connection.beginTransaction();
    const [[doctor]]=await connection.query('SELECT verified FROM doctors WHERE id=? FOR UPDATE',[doctorId]);
    if(!doctor)throw Object.assign(new Error('Doctor not found.'),{status:404});
    const decision=legacy?(doctor.verified?'Revoked':'Approved'):req.body.decision;
    if(!['Pending','Approved','Rejected','Revoked'].includes(decision))throw badRequest('Choose an explicit approval, rejection or revocation.');
    const reason=string(req.body.reason||(legacy?'Administrator verification action':''),'review reason',1000,decision==='Rejected'||decision==='Revoked');
    const [[prior]]=await connection.query('SELECT * FROM doctor_registration_reviews WHERE doctor_id=?',[doctorId]);
    if(req.body.version!==undefined&&Number(req.body.version)!==(prior?.version||0))throw Object.assign(new Error('This registration changed. Refresh before reviewing it.'),{status:409});
    const same=prior?.status===decision&&prior.reason===reason&&!!doctor.verified===(decision==='Approved');
    if(!same){
      await connection.query('UPDATE doctors SET verified=? WHERE id=?',[decision==='Approved',doctorId]);
      await connection.query(`INSERT INTO doctor_registration_reviews(doctor_id,status,reason,reviewer_id,reviewed_at) VALUES (?,?,?,?,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE status=VALUES(status),reason=VALUES(reason),reviewer_id=VALUES(reviewer_id),reviewed_at=VALUES(reviewed_at),version=version+1`,[doctorId,decision,reason,req.user.id]);
      await connection.query('INSERT INTO doctor_review_events(doctor_id,reviewer_id,decision,reason,created_at) VALUES (?,?,?,?,UTC_TIMESTAMP())',[doctorId,req.user.id,decision,reason]);
    }
    await connection.commit();res.json({success:true,verified:decision==='Approved',verificationStatus:decision,message:'Doctor registration '+decision.toLowerCase()+'.'});
  }catch(error){await connection?.rollback();fail(res,error);}finally{connection?.release();}
}

// @desc   Get All Appointments System-wide
// @route  GET /api/admin/appointments
export const getAllAppointments = async (req, res) => {
  try {
    const [appointments] = await pool.query(`
      SELECT 
        a.id, a.appointment_code AS appointmentCode,
        a.patient_name AS patientName, a.patient_email AS patientEmail, a.patient_phone AS patientPhone,
        u_doc.name AS doctorName, d.specialization,
        h.name AS hospitalName,
        a.appointment_date AS date, a.time_slot AS timeSlot,
        a.symptoms, a.status, a.fee, a.created_at AS createdAt
      FROM appointments a
      JOIN doctors d ON a.doctor_id = d.id
      JOIN users u_doc ON d.user_id = u_doc.id
      JOIN hospitals h ON a.hospital_id = h.id
      ORDER BY a.id DESC
    `);

    res.json({ success: true, count: appointments.length, appointments });
  } catch (error) {
    fail(res, error);
  }
};
