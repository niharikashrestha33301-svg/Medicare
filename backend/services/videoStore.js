import pg from 'pg';
import mysql from '../config/db.js';
import { problem } from './careSecurity.js';
import {appointmentSchedules} from './appointmentScheduleStore.js';
import {appointmentDisplay} from './consultationSchedule.js';

let cloudPool;
export const videoStoreName=()=>process.env.VIDEO_STORE||'mysql';
export function videoStorageStatus(){
  const provider=videoStoreName();
  return {provider,configured:provider==='mysql'||provider==='supabase'&&!!process.env.SUPABASE_DB_URL,
    message:provider==='supabase'?(process.env.SUPABASE_DB_URL?'Supabase selected. Connection and security policies are checked by each request.':'Supabase is selected but SUPABASE_DB_URL is missing. Configure the server connection and apply the migration. No MySQL fallback is used.'):'Using the existing MySQL database. Supabase is not activated; project and server database credentials are required.'};
}
export function postgresOptions(connectionString=process.env.SUPABASE_DB_URL){
  if(!connectionString)throw problem('Supabase database connection is missing. Configure SUPABASE_DB_URL in backend/.env.',503);
  const url=new URL(connectionString);
  if(!['postgres:','postgresql:'].includes(url.protocol))throw problem('Invalid Supabase PostgreSQL connection configuration.',503);
  const ref=process.env.SUPABASE_PROJECT_REF;
  if(ref&&url.hostname!==`db.${ref}.supabase.co`&&!(url.hostname.endsWith('.pooler.supabase.com')&&decodeURIComponent(url.username).endsWith('.'+ref)))throw problem('The database connection does not match SUPABASE_PROJECT_REF. No connection was made.',503);
  for(const key of ['sslmode','sslcert','sslkey','sslrootcert'])url.searchParams.delete(key);
  return {connectionString:url.href,ssl:{rejectUnauthorized:true,...(process.env.SUPABASE_DB_CA_BASE64?{ca:Buffer.from(process.env.SUPABASE_DB_CA_BASE64,'base64').toString('utf8')}:{})},max:5,connectionTimeoutMillis:10000,idleTimeoutMillis:30000,statement_timeout:15000};
}
function postgres(){if(!process.env.SUPABASE_PROJECT_REF)throw problem('Configure SUPABASE_PROJECT_REF for the new MediCare project before activating Supabase.',503);if(!cloudPool){cloudPool=new pg.Pool(postgresOptions());cloudPool.on('error',()=>console.error('Supabase video connection unavailable.'));}return cloudPool;}
// Translate only the fixed, parameterized statements in videoRoutes. No client SQL is accepted.
export function postgresVideoSQL(sql){
  let result=sql.replace(/DATE_FORMAT\((\w+\.\w+),\s*'%Y-%m-%dT%H:%i:%sZ'\)/g,`to_char($1 AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"')`)
    .replace(/DATE_FORMAT\((\w+\.\w+),\s*'%Y-%m-%dT%H:%i:%s'\)/g,`to_char($1 AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS')`)
    .replace(/DATE_FORMAT\((\w+\.\w+),\s*'%Y-%m-%d'\)/g,`to_char($1,'YYYY-MM-DD')`)
    .replace(/DATE_SUB\(UTC_TIMESTAMP\(\),INTERVAL (\d+) MINUTE\)/g,"(CURRENT_TIMESTAMP - INTERVAL '$1 minutes')")
    .replace(/UTC_TIMESTAMP\(\)/g,'CURRENT_TIMESTAMP')
    .replace(/status=IF\(admitted=TRUE,'In progress','Waiting'\)/g,"status=CASE WHEN admitted THEN 'In progress' ELSE 'Waiting' END")
    .replace(/\b(video_consultations|video_signals|appointments|doctors|users)\b/g,'medicare_video.$1');
  if(/INSERT IGNORE INTO/.test(result))result=result.replace('INSERT IGNORE INTO','INSERT INTO')+' ON CONFLICT DO NOTHING';
  if(/FOR UPDATE/.test(result))result=result.replace(/FOR UPDATE/,/SELECT v\.\*/.test(result)?'FOR UPDATE OF v':'');
  let index=0;return result.replace(/\?/g,()=>'$'+(++index));
}
const numbers=new Set(['id','appointment_id','patient_id','doctor_id','doctor_user_id','generation','total']);
function rows(result){return result.rows.map(row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key,numbers.has(key)&&typeof value==='string'&&/^\d+$/.test(value)?Number(value):value])));}
export async function actorContext(client,user){
  await client.query('SET LOCAL ROLE medicare_video_api');
  await client.query("SELECT set_config('medicare.actor_id',$1,true),set_config('medicare.actor_role',$2,true)",[String(user.id),user.role]);
}
async function syncScope(client,user){
  // MySQL remains the booking authority for all existing pages. Only minimal verified
  // directory/appointment data is mirrored; never copy passwords, tokens or medical notes.
  const [doctors]=await mysql.query('SELECT d.id,d.user_id,u.name,u.status,d.verified,d.specialization,d.consultation_fee,d.currency FROM doctors d JOIN users u ON u.id=d.user_id');
  const [availability]=await mysql.query('SELECT doctor_id,slot_time FROM doctor_slots');
  const [appointments]=await mysql.query(`SELECT a.id,a.patient_id,a.doctor_id,a.patient_name,a.status,DATE_FORMAT(a.appointment_date,'%Y-%m-%d') AS appointment_date,a.time_slot,p.status AS patient_status FROM appointments a JOIN doctors d ON d.id=a.doctor_id JOIN users p ON p.id=a.patient_id WHERE ${user.role==='doctor'?'d.user_id':'a.patient_id'}=?`,[user.id]);
  const users=[...doctors.map(d=>({id:d.user_id,name:d.name,role:'doctor',status:d.status})),...appointments.map(a=>({id:a.patient_id,name:a.patient_name,role:'patient',status:a.patient_status})),user].map(u=>({id:u.id,name:u.name,role:u.role,status:u.status}));
  const unique=[...new Map(users.map(u=>[u.id,u])).values()];
  await client.query(`INSERT INTO medicare_video.users(id,name,role,status) SELECT id,name,role,status FROM jsonb_to_recordset($1) AS x(id bigint,name text,role text,status text) ON CONFLICT(id) DO UPDATE SET name=excluded.name,role=excluded.role,status=excluded.status`,[JSON.stringify(unique)]);
  const slotsByDoctor=new Map();for(const slot of availability){if(!slotsByDoctor.has(slot.doctor_id))slotsByDoctor.set(slot.doctor_id,[]);slotsByDoctor.get(slot.doctor_id).push(slot.slot_time);}
  const directory=doctors.map(d=>({...d,verified:!!d.verified,available_slots:slotsByDoctor.get(d.id)||[]}));
  await client.query(`INSERT INTO medicare_video.doctors(id,user_id,verified,specialization,consultation_fee,currency,available_slots) SELECT id,user_id,verified,specialization,consultation_fee,currency,available_slots FROM jsonb_to_recordset($1) AS x(id bigint,user_id bigint,verified boolean,specialization text,consultation_fee numeric,currency text,available_slots jsonb) ON CONFLICT(id) DO UPDATE SET verified=excluded.verified,specialization=excluded.specialization,consultation_fee=excluded.consultation_fee,currency=excluded.currency,available_slots=excluded.available_slots`,[JSON.stringify(directory)]);
  if(appointments.length){
    await client.query(`INSERT INTO medicare_video.appointments(id,patient_id,doctor_id,patient_name,status,appointment_date,time_slot) SELECT id,patient_id,doctor_id,patient_name,status,appointment_date,time_slot FROM jsonb_to_recordset($1) AS x(id bigint,patient_id bigint,doctor_id bigint,patient_name text,status text,appointment_date date,time_slot text) ON CONFLICT(id) DO UPDATE SET status=excluded.status,appointment_date=excluded.appointment_date,time_slot=excluded.time_slot,patient_name=excluded.patient_name`,[JSON.stringify(appointments)]);
    const [legacyRooms]=await mysql.query("SELECT v.id,v.appointment_id,v.status,DATE_FORMAT(v.started_at,'%Y-%m-%dT%H:%i:%sZ') AS started_at,DATE_FORMAT(v.ended_at,'%Y-%m-%dT%H:%i:%sZ') AS ended_at FROM video_consultations v WHERE v.appointment_id IN (?)",[appointments.map(a=>a.id)]);
    await client.query(`INSERT INTO medicare_video.video_consultations(id,appointment_id,status,started_at,ended_at) SELECT id,appointment_id,status,started_at,ended_at FROM jsonb_to_recordset($1) AS x(id uuid,appointment_id bigint,status text,started_at timestamptz,ended_at timestamptz) ON CONFLICT(appointment_id) DO NOTHING`,[JSON.stringify(legacyRooms.map(room=>({...room,status:room.status==='Ended'?'Ended':'Scheduled'})))]);
  }
}
export function videoDatabase(user,{poolOverride,syncOverride}={}){
  if(videoStoreName()==='mysql'&&!poolOverride)return mysql;
  if(videoStoreName()!=='supabase'&&!poolOverride)throw problem('Unsupported VIDEO_STORE. Use mysql or supabase.',503);
  let synced;
  async function getConnection(){
    const client=await(poolOverride||postgres()).connect();let active=false,done=false;
    try{
      if(!synced){synced=(async()=>{await client.query('BEGIN');try{await(syncOverride||syncScope)(client,user);await client.query('COMMIT');}catch(error){await client.query('ROLLBACK');throw error;}})();await synced;}
      else await synced;
      return {
        async beginTransaction(){if(!active){await client.query('BEGIN');active=true;await actorContext(client,user);}},
        async query(sql,values=[]){if(!active)throw new Error('Video transaction required');const result=await client.query(postgresVideoSQL(sql),values);return [/^\s*(SELECT|WITH)/i.test(sql)?rows(result):{affectedRows:result.rowCount}];},
        async commit(){if(active){await client.query('COMMIT');active=false;}},
        async rollback(){if(active){await client.query('ROLLBACK');active=false;}},
        release(){if(!done){done=true;client.release();}}
      };
    }catch(error){client.release();throw error;}
  }
  return {getConnection,async query(sql,values){const connection=await getConnection();try{await connection.beginTransaction();const result=await connection.query(sql,values);await connection.commit();return result;}catch(error){await connection.rollback();throw error;}finally{connection.release();}}};
}
export async function closeVideoPool(){if(cloudPool){await cloudPool.end();cloudPool=undefined;}}
export async function purgeCloudVideoSignals(){if(videoStoreName()==='supabase')await postgres().query("DELETE FROM medicare_video.video_signals WHERE created_at<now()-interval '5 minutes'");}
export async function consultationHistory(user){
  const [history]=await videoDatabase(user).query(`SELECT v.id,v.status,DATE_FORMAT(v.started_at,'%Y-%m-%dT%H:%i:%sZ') AS started_at,DATE_FORMAT(v.ended_at,'%Y-%m-%dT%H:%i:%sZ') AS ended_at,a.id AS appointment_id,a.status AS appointment_status,DATE_FORMAT(a.appointment_date,'%Y-%m-%d') AS date,a.time_slot,u.name AS doctor_name FROM video_consultations v JOIN appointments a ON a.id=v.appointment_id JOIN doctors d ON d.id=a.doctor_id JOIN users u ON u.id=d.user_id WHERE a.patient_id=? ORDER BY v.created_at DESC LIMIT 30`,[user.id]);
  const schedules=await appointmentSchedules(history.map(a=>a.appointment_id));
  return history.map(a=>{const display=appointmentDisplay({...a,...schedules.get(a.appointment_id)});return {...display,time_slot:display.timeSlot,status:['Cancelled','Completed'].includes(a.appointment_status)?a.appointment_status:a.status};});
}
