import pool from '../config/db.js';
import {appointmentMoment,appointmentTimezone} from './consultationSchedule.js';
import {slot} from '../utils/validation.js';
export async function doctorAvailability(doctorId,day){
 const [[doctor]]=await pool.query('SELECT d.id,d.verified,u.status FROM doctors d JOIN users u ON u.id=d.user_id WHERE d.id=?',[doctorId]);
 if(!doctor||!doctor.verified||doctor.status!=='Active')throw Object.assign(new Error('Choose an active, verified doctor.'),{status:404});
 const [[published],[booked]]=await Promise.all([pool.query('SELECT slot_time FROM doctor_slots WHERE doctor_id=? ORDER BY id',[doctorId]),pool.query("SELECT time_slot FROM appointments WHERE doctor_id=? AND appointment_date=? AND status IN ('Pending','Confirmed')",[doctorId,day])]);
 const normalize=value=>{try{return slot(value);}catch{return null;}};
 const occupied=new Set(booked.map(a=>normalize(a.time_slot)));
 const slots=[...new Set(published.map(s=>normalize(s.slot_time)).filter(Boolean))].map(time=>{const at=appointmentMoment(day,time),reason=occupied.has(time)?'Already booked':!at||at.getTime()<=Date.now()?'Time has passed':'';return {time,startsAt:at?.toISOString()||null,available:!reason,reason};});
 return {success:true,timezone:appointmentTimezone(),slots};
}
