import pool from '../config/db.js';
import {ensureBookingSchema} from './bookingSchema.js';
import {videoDatabase,videoStoreName} from './videoStore.js';
let running=false;
export async function syncAppointment(user,appointmentId){
  if(videoStoreName()!=='supabase')return 'Not configured';
  try{
    const [rows]=await videoDatabase(user).query('SELECT id FROM appointments WHERE id=? AND patient_id=?',[appointmentId,user.id]);
    if(!rows.length)throw new Error('Appointment sync returned no owned record');
    await pool.query("UPDATE appointment_cloud_sync SET status='Synced',synced_at=UTC_TIMESTAMP(),error_code=NULL WHERE appointment_id=?",[appointmentId]);return 'Synced';
  }catch(error){await pool.query("UPDATE appointment_cloud_sync SET status='Pending',attempts=attempts+1,next_attempt=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 MINUTE),error_code=? WHERE appointment_id=?",[String(error.code||'SUPABASE_UNAVAILABLE').slice(0,60),appointmentId]).catch(()=>console.error('Appointment cloud sync remains pending.'));return 'Pending';}
}
export async function syncPendingAppointments(){
  if(running||videoStoreName()!=='supabase')return;running=true;
  try{await ensureBookingSchema();const [jobs]=await pool.query("SELECT a.id,u.id AS patient_id,u.name,u.status FROM appointment_cloud_sync q JOIN appointments a ON a.id=q.appointment_id JOIN users u ON u.id=a.patient_id WHERE q.status='Pending' AND q.next_attempt<=UTC_TIMESTAMP() AND u.status='Active' ORDER BY q.next_attempt LIMIT 10");
    for(const row of jobs)await syncAppointment({id:row.patient_id,name:row.name,role:'patient',status:row.status},row.id);
  }finally{running=false;}
}
