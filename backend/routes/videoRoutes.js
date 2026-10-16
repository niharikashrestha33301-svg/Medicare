import express from 'express';
import {randomUUID} from 'node:crypto';
import pool from '../config/db.js';
import {protect,authorizeRoles} from '../middleware/authMiddleware.js';
import {ensureCareSchema} from '../services/careSchema.js';
import {uuid,problem,limiter,iceConfiguration} from '../services/careSecurity.js';
import {id,date,fail,badRequest} from '../utils/validation.js';
import {videoDatabase,videoStorageStatus,videoStoreName} from '../services/videoStore.js';
import {bookAppointment} from '../controllers/appointmentController.js';
import {appointmentMoment,roomAccess,appointmentTimezone,appointmentDisplay} from '../services/consultationSchedule.js';
import {appointmentSchedules} from '../services/appointmentScheduleStore.js';
import {doctorAvailability} from '../services/doctorAvailability.js';
const router=express.Router();
const wrap=fn=>(req,res)=>Promise.resolve(fn(req,res)).catch(error=>fail(res,videoStoreName()==='supabase'&&!error.status?problem('Supabase consultation storage is unavailable. Check the server connection, TLS certificate and MediCare migrations.',503):error));
router.use(protect,authorizeRoles('patient','doctor'),limiter(240));
router.use((req,res,next)=>ensureCareSchema().then(()=>next()).catch(next));
router.use((req,res,next)=>{try{req.videoDB=videoDatabase(req.user);next();}catch(error){fail(res,error);}});
const select=`SELECT v.*,a.patient_id,d.user_id AS doctor_user_id,a.status AS appointment_status,
 DATE_FORMAT(a.appointment_date,'%Y-%m-%d') AS appointment_date,a.time_slot,u.name AS doctor_name,a.patient_name,
 DATE_FORMAT(v.patient_seen,'%Y-%m-%dT%H:%i:%s') AS patient_seen,DATE_FORMAT(v.doctor_seen,'%Y-%m-%dT%H:%i:%s') AS doctor_seen,
 DATE_FORMAT(v.started_at,'%Y-%m-%dT%H:%i:%sZ') AS started_at,DATE_FORMAT(v.ended_at,'%Y-%m-%dT%H:%i:%sZ') AS ended_at,
 u.status AS doctor_status,d.verified AS doctor_verified,pu.status AS patient_status
 FROM video_consultations v JOIN appointments a ON a.id=v.appointment_id JOIN doctors d ON d.id=a.doctor_id JOIN users u ON u.id=d.user_id JOIN users pu ON pu.id=a.patient_id`;
async function owned(connection,req,lock=false){
  const [[room]]=await connection.query(select+' WHERE v.id=?'+(lock?' FOR UPDATE':''),[uuid(req.params.room)]);
  if(!room||(req.user.role==='doctor'?room.doctor_user_id:room.patient_id)!==req.user.id)throw problem('Consultation not found.',404);
  const schedules=await appointmentSchedules([room.appointment_id]);Object.assign(room,schedules.get(room.appointment_id));
  return room;
}
function withinWindow(room){
  if(room.doctor_status!=='Active'||room.patient_status!=='Active'||!room.doctor_verified)throw problem('A participant is unavailable or the doctor is not verified.',403);
  if(!['Pending','Confirmed'].includes(room.appointment_status)||room.status==='Ended')throw problem('This consultation is no longer open.');
  const access=roomAccess({...room,status:room.appointment_status});if(!access.canJoin)throw problem(access.joinReason);
}
function clientValid(room,req){
  const role=req.user.role;
  if(uuid(req.body.clientId||req.query.clientId)!==room[role+'_client']||!room[role+'_seen']||Date.now()-new Date(room[role+'_seen']+'Z').getTime()>45000)throw problem('Your room session expired. Leave and join again.',409);
}
// mysql DATETIME values are formatted before comparison to avoid host timezone assumptions.
const seenFresh=value=>value&&Date.now()-new Date(value instanceof Date?value.getTime():value+'Z').getTime()<45000;
function view(room){return {id:room.id,appointmentId:room.appointment_id,status:['Cancelled','Completed'].includes(room.appointment_status)?room.appointment_status:room.status,generation:room.generation,admitted:!!room.admitted,
  patientPresent:!!seenFresh(room.patient_seen),doctorPresent:!!seenFresh(room.doctor_seen),doctorName:room.doctor_name,patientName:room.patient_name,startedAt:room.started_at,endedAt:room.ended_at};}
router.get('/',wrap(async(req,res)=>{
  const [rooms]=await req.videoDB.query(select+` WHERE ${req.user.role==='doctor'?'d.user_id':'a.patient_id'}=? ORDER BY v.created_at DESC`,[req.user.id]);
  const schedules=await appointmentSchedules(rooms.map(r=>r.appointment_id));
  res.json({success:true,rooms:rooms.map(r=>{const display=appointmentDisplay({date:r.appointment_date,timeSlot:r.time_slot,...schedules.get(r.appointment_id)});return {...view(r),date:display.date,time:display.timeSlot,startsAt:display.startsAt,timezone:display.timezone};}),configuration:{...iceConfiguration(req.user.id),storage:videoStorageStatus()}});
}));
router.get('/availability/:doctor',wrap(async(req,res)=>{
  const doctorId=id(req.params.doctor),day=date(req.query.date);
  res.json(await doctorAvailability(doctorId,day));
}));
router.post('/book',authorizeRoles('patient'),(req,res,next)=>{req.createVideoRoom=true;next();},bookAppointment);
router.post('/',wrap(async(req,res)=>{
  const appointmentId=id(req.body.appointmentId),connection=await req.videoDB.getConnection();
  try{await connection.beginTransaction();
    const [[a]]=await connection.query('SELECT a.*,d.user_id AS doctor_user_id FROM appointments a JOIN doctors d ON d.id=a.doctor_id WHERE a.id=? FOR UPDATE',[appointmentId]);
    if(!a||(req.user.role==='doctor'?a.doctor_user_id:a.patient_id)!==req.user.id)throw problem('Appointment not found.',404);
    if(!['Pending','Confirmed'].includes(a.status))throw problem('Choose an active appointment.');
    await connection.query('INSERT IGNORE INTO video_consultations (id,appointment_id) VALUES (?,?)',[randomUUID(),appointmentId]);
    const [[room]]=await connection.query('SELECT id FROM video_consultations WHERE appointment_id=?',[appointmentId]);await connection.commit();res.status(201).json({success:true,id:room.id});
  }catch(error){await connection.rollback();throw error;}finally{connection.release();}
}));
router.post('/:room/join',wrap(async(req,res)=>{
  const connection=await req.videoDB.getConnection(),clientId=uuid(req.body.clientId);
  try{await connection.beginTransaction();const room=await owned(connection,req,true);withinWindow(room);
    const role=req.user.role;
    if(room[role+'_client']!==clientId&&seenFresh(room[role+'_seen']))throw problem('Your account is already in this consultation on another tab or device.');
    if(room[role+'_client']!==clientId){await connection.query('UPDATE video_consultations SET admitted=FALSE,generation=generation+1 WHERE id=?',[room.id]);await connection.query('DELETE FROM video_signals WHERE consultation_id=?',[room.id]);}
    await connection.query(`UPDATE video_consultations SET ${role}_client=?,${role}_seen=UTC_TIMESTAMP(),status=IF(admitted=TRUE,'In progress','Waiting') WHERE id=?`,[clientId,room.id]);
    const updated=await owned(connection,req);await connection.commit();res.json({success:true,room:view(updated),configuration:iceConfiguration(req.user.id)});
  }catch(error){await connection.rollback();throw error;}finally{connection.release();}
}));
router.get('/:room/poll',wrap(async(req,res)=>{
  const connection=await req.videoDB.getConnection();
  try{await connection.beginTransaction();const room=await owned(connection,req,true);withinWindow(room);clientValid(room,req);
    await connection.query(`UPDATE video_consultations SET ${req.user.role}_seen=UTC_TIMESTAMP() WHERE id=?`,[room.id]);
    const after=Number(req.query.after||0);if(!Number.isSafeInteger(after)||after<0)throw badRequest('Invalid signal cursor.');
    const [signals]=await connection.query("SELECT id,payload FROM video_signals WHERE consultation_id=? AND generation=? AND sender_role<>? AND id>? AND created_at>DATE_SUB(UTC_TIMESTAMP(),INTERVAL 2 MINUTE) ORDER BY id LIMIT 100",[room.id,room.generation,req.user.role,after]);
    await connection.commit();res.json({success:true,room:view(room),signals:room.admitted?signals.map(s=>({id:s.id,payload:JSON.parse(s.payload)})):[]});
  }catch(error){await connection.rollback();throw error;}finally{connection.release();}
}));
router.post('/:room/admit',authorizeRoles('doctor'),wrap(async(req,res)=>{
  const connection=await req.videoDB.getConnection();try{await connection.beginTransaction();const room=await owned(connection,req,true);withinWindow(room);clientValid(room,req);
    if(!seenFresh(room.patient_seen))throw problem('The patient has not entered the waiting room.');
    if(!room.admitted){await connection.query("UPDATE video_consultations SET admitted=TRUE,status='In progress',generation=generation+1,started_at=COALESCE(started_at,UTC_TIMESTAMP()) WHERE id=?",[room.id]);await connection.query('DELETE FROM video_signals WHERE consultation_id=?',[room.id]);}
    await connection.commit();res.json({success:true});
  }catch(error){await connection.rollback();throw error;}finally{connection.release();}
}));
router.post('/:room/signal',wrap(async(req,res)=>{
  const connection=await req.videoDB.getConnection();try{await connection.beginTransaction();const room=await owned(connection,req,true);withinWindow(room);clientValid(room,req);
    if(!room.admitted||Number(req.body.generation)!==room.generation||!seenFresh(room.patient_seen)||!seenFresh(room.doctor_seen))throw problem('Both participants must be present and the doctor must admit the patient.');
    const p=req.body.payload;
    if(!p||!['offer','answer','candidate'].includes(p.type))throw badRequest('Invalid call signal.');
    if(p.type==='offer'&&req.user.role!=='doctor'||p.type==='answer'&&req.user.role!=='patient')throw badRequest('Invalid negotiation role.');
    let clean;
    if(p.type==='candidate'){
      if(typeof p.candidate?.candidate!=='string'||p.candidate.candidate.length>4000||p.candidate.sdpMid!==null&&typeof p.candidate.sdpMid!=='string'||p.candidate.sdpMLineIndex!==null&&!Number.isInteger(p.candidate.sdpMLineIndex))throw badRequest('Invalid ICE candidate.');
      clean={type:p.type,candidate:{candidate:p.candidate.candidate,sdpMid:p.candidate.sdpMid,sdpMLineIndex:p.candidate.sdpMLineIndex}};
    }else{if(typeof p.sdp!=='string'||p.sdp.length>50000)throw badRequest('Invalid session description.');clean={type:p.type,sdp:p.sdp};}
    const [[count]]=await connection.query('SELECT COUNT(*) AS total FROM video_signals WHERE consultation_id=? AND generation=?',[room.id,room.generation]);
    if(count.total>=500)throw problem('Call signaling limit reached. Leave and rejoin.');
    await connection.query('INSERT INTO video_signals (consultation_id,generation,sender_role,payload) VALUES (?,?,?,?)',[room.id,room.generation,req.user.role,JSON.stringify(clean)]);
    await connection.query('DELETE FROM video_signals WHERE consultation_id=? AND created_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 5 MINUTE)',[room.id]);
    await connection.commit();res.json({success:true});
  }catch(error){await connection.rollback();throw error;}finally{connection.release();}
}));
router.post('/:room/leave',wrap(async(req,res)=>{
  const connection=await req.videoDB.getConnection();try{await connection.beginTransaction();const room=await owned(connection,req,true);clientValid(room,req);
    const end=req.body.end===true;if(end&&req.user.role!=='doctor')throw problem('Only the treating doctor may end the consultation.',403);
    await connection.query(`UPDATE video_consultations SET admitted=FALSE,generation=generation+1,${req.user.role}_client=NULL,${req.user.role}_seen=NULL,status=?,ended_at=${end?'UTC_TIMESTAMP()':'ended_at'} WHERE id=?`,[end||room.status==='Ended'?'Ended':'Waiting',room.id]);
    await connection.query('DELETE FROM video_signals WHERE consultation_id=?',[room.id]);await connection.commit();res.json({success:true});
  }catch(error){await connection.rollback();throw error;}finally{connection.release();}
}));
export default router;
