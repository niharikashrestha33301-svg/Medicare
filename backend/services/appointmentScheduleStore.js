import pool from '../config/db.js';
import {ensureBookingSchema} from './bookingSchema.js';
import {appointmentMoment} from './consultationSchedule.js';
import {utcSQL} from './medicineTime.js';
export async function captureExistingAppointmentTimes(timezone){
 await ensureBookingSchema();const [rows]=await pool.query("SELECT a.id,DATE_FORMAT(a.appointment_date,'%Y-%m-%d') AS date,a.time_slot FROM appointments a LEFT JOIN appointment_schedules s ON s.appointment_id=a.id WHERE s.appointment_id IS NULL");
 let captured=0;for(const row of rows){const at=appointmentMoment(row.date,row.time_slot,timezone);if(!at)throw new Error('An existing appointment has an invalid time; no timezone change should be activated.');const [r]=await pool.query('INSERT IGNORE INTO appointment_schedules(appointment_id,starts_at_utc,timezone) VALUES(?,?,?)',[row.id,utcSQL(at),timezone]);captured+=r.affectedRows;}return captured;
}
export async function appointmentSchedules(ids){
 await ensureBookingSchema();if(!ids.length)return new Map();const [rows]=await pool.query("SELECT appointment_id,DATE_FORMAT(starts_at_utc,'%Y-%m-%dT%H:%i:%sZ') AS startsAt,timezone AS originalTimezone FROM appointment_schedules WHERE appointment_id IN (?)",[ids]);return new Map(rows.map(row=>[row.appointment_id,row]));
}
