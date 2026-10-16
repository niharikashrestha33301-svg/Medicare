import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import pool from '../config/db.js';
import {approveUsingAdminPanel} from './admin-review-ui.mjs';
import {today} from '../utils/validation.js';
const tag='approval-test-'+Date.now(),ids=[],password='approval-test-password';
async function api(path,token,method='GET',body){
 const r=await fetch('http://localhost:5000/api'+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
 return {status:r.status,data:await r.json()};
}
try{
 assert.equal((await api('/health')).data.status,'Healthy');
 const [created]=await pool.query("INSERT INTO users(name,email,password,role) VALUES(?,?,?,'admin')",['Approval Test Admin',tag+'-admin@example.com',await bcrypt.hash(password,10)]);ids.push(created.insertId);
 const admin=(await api('/auth/login',null,'POST',{email:tag+'-admin@example.com',password})).data;
 async function register(role){const r=await api('/auth/register',null,'POST',{name:tag+'-'+role,email:tag+'-'+role+'@example.com',password,role,hospitalId:1,licenseNo:tag,consultationFee:650});assert.equal(r.status,201,JSON.stringify(r.data));ids.push(r.data.user.id);return r.data;}
 const doctor=await register('doctor'),patient=await register('patient');
 const [[d]]=await pool.query('SELECT id,verified FROM doctors WHERE user_id=?',[doctor.user.id]);assert.equal(d.verified,0);
 const booking={doctorId:d.id,appointmentDate:'2038-12-15',timeSlot:'09:00 AM',patientPhone:'0000000000'};
 assert.equal((await api('/admin/doctors',patient.token)).status,403);
 assert.equal((await api('/admin/doctors/'+d.id+'/review',doctor.token,'PUT',{decision:'Approved'})).status,403);
 assert.equal((await api('/appointments',patient.token,'POST',booking)).status,409);
 const review=body=>api('/admin/doctors/'+d.id+'/review',admin.token,'PUT',body);
 assert.equal((await review({decision:'Rejected'})).status,400);
 assert.equal((await review({decision:'Rejected',reason:'Test license could not be verified',version:0})).status,200);
 let publicDoctor=(await api('/doctors?search='+tag)).data.doctors[0];assert.equal(publicDoctor.verificationStatus,'Rejected');assert.equal(publicDoctor.verified,0);assert.equal(publicDoctor.reviewReason,undefined);
 assert.equal((await review({decision:'Approved',version:0})).status,409,'Stale admin review rejected');
 await approveUsingAdminPanel(admin,d.id);
 assert.equal((await review({decision:'Approved'})).status,200,'Approval is idempotent');
 const [[audit]]=await pool.query('SELECT COUNT(*) AS count FROM doctor_review_events WHERE doctor_id=? AND reviewer_id=?',[d.id,admin.user.id]);assert.equal(audit.count,2);
 assert.equal((await api('/appointments',patient.token,'POST',{...booking,appointmentDate:'2020-01-01'})).status,400);
 assert.equal((await api('/appointments',patient.token,'POST',{...booking,appointmentDate:today(),timeSlot:'12:00 AM'})).status,400,'Earlier times today are rejected');
 const competing=await Promise.all([api('/appointments',patient.token,'POST',booking),api('/appointments',patient.token,'POST',booking)]);assert.deepEqual(competing.map(r=>r.status).sort(),[201,409]);
 const saved=competing.find(r=>r.status===201).data;assert.equal(saved.status,'Confirmed');assert.equal(saved.date,booking.appointmentDate);assert.equal(saved.timeSlot,booking.timeSlot);assert.equal(saved.storage.primary,'MySQL');
 const [[row]]=await pool.query('SELECT patient_id,doctor_id,status,fee FROM appointments WHERE id=?',[saved.appointmentId]);assert.equal(row.patient_id,patient.user.id);assert.equal(row.doctor_id,d.id);assert.equal(row.status,'Confirmed');assert.equal(Number(row.fee),650);
 assert.equal((await api('/appointments/my',doctor.token)).data.appointments[0].appointmentCode,saved.appointmentCode);
 assert.equal((await api('/appointments/'+saved.appointmentId+'/cancel',patient.token,'PUT',{reason:'Test cancellation'})).status,200);
 assert.equal((await review({decision:'Revoked',reason:'Test revocation'})).status,200);
 assert.equal((await api('/appointments',patient.token,'POST',booking)).status,409);
 assert.equal((await api('/appointments/'+saved.appointmentId+'/status',doctor.token,'PUT',{status:'Confirmed'})).status,409,'Unverified doctor cannot reopen a booking');
 assert.equal((await api('/doctors/'+d.id,doctor.token,'PUT',{qualifications:'Changed test credentials',verified:true})).status,200);
 publicDoctor=(await api('/doctors?search='+tag)).data.doctors[0];assert.equal(publicDoctor.verificationStatus,'Pending');assert.equal(publicDoctor.verified,0,'Editing credentials never grants approval');
 console.log('PASS: real MySQL connection, pending registration, admin-only review, rejection reasons, optimistic concurrency, audit events, idempotent approval, confirmed booking persistence, past-date protection, concurrent double-booking prevention, cancellation and revoked booking protection.');
}finally{
 if(ids.length){await pool.query('DELETE FROM appointments WHERE patient_id IN (?) OR doctor_id IN (SELECT id FROM doctors WHERE user_id IN (?))',[ids,ids]);await pool.query('DELETE FROM users WHERE id IN (?) AND email LIKE ?',[ids,tag+'%']);}await pool.end();
}
