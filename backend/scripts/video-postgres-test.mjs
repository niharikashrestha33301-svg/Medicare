import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {videoDatabase,postgresVideoSQL,postgresOptions} from '../services/videoStore.js';
import mysql from '../config/db.js';

const db=new PGlite(),room=randomUUID(),otherRoom=randomUUID();
const migration=fs.readFileSync(new URL('../../supabase/migrations/20261015135003_medicare_video_security.sql',import.meta.url),'utf8');
const poolOverride={connect:async()=>({query:(...args)=>db.query(...args),release(){}})};
const connection=user=>videoDatabase(user,{poolOverride,syncOverride:async()=>{}});
try{
  await db.exec(migration);
  await db.exec(`INSERT INTO medicare_video.users VALUES (1,'Patient A','patient','Active'),(2,'Patient B','patient','Active'),(10,'Doctor A','doctor','Active'),(11,'Doctor B','doctor','Active');
    INSERT INTO medicare_video.doctors(id,user_id,verified,specialization,consultation_fee,currency) VALUES (20,10,true,'General',100,'INR'),(21,11,true,'General',100,'INR');
    INSERT INTO medicare_video.appointments VALUES (30,1,20,'Patient A','Confirmed','2026-10-15','09:00 AM'),(31,2,21,'Patient B','Confirmed','2026-10-15','09:00 AM');`);
  await db.query('INSERT INTO medicare_video.video_consultations(id,appointment_id) VALUES ($1,30),($2,31)',[room,otherRoom]);
  const a=connection({id:1,role:'patient'}),b=connection({id:2,role:'patient'}),doctor=connection({id:10,role:'doctor'});
  const [owned]=await a.query('SELECT id,appointment_id FROM video_consultations');assert.equal(owned.length,1);assert.equal(owned[0].id,room,'RLS applies even without an application WHERE');
  const [notOwned]=await b.query('SELECT id FROM video_consultations WHERE id=?',[room]);assert.equal(notOwned.length,0);
  const [doctorOwned]=await doctor.query('SELECT id FROM video_consultations');assert.equal(doctorOwned[0].id,room);assert.equal(doctorOwned.length,1);
  const [anonymous]=await connection({id:0,role:'guest'}).query('SELECT id FROM video_consultations');assert.equal(anonymous.length,0);
  await assert.rejects(b.query('INSERT INTO video_consultations(id,appointment_id) VALUES (?,?)',[randomUUID(),30]),/row.level security/i);
  await assert.rejects(a.query('INSERT INTO video_signals(consultation_id,generation,sender_role,payload) VALUES (?,?,?,?)',[room,0,'patient','{}']),/row.level security/i,'No signaling before admission');
  await doctor.query("UPDATE video_consultations SET admitted=TRUE,status='In progress',generation=1,doctor_seen=UTC_TIMESTAMP() WHERE id=?",[room]);
  await a.query('INSERT INTO video_signals(consultation_id,generation,sender_role,payload) VALUES (?,?,?,?)',[room,1,'patient','{"type":"answer"}']);
  const [signals]=await doctor.query("SELECT id,payload FROM video_signals WHERE consultation_id=? AND created_at>DATE_SUB(UTC_TIMESTAMP(),INTERVAL 2 MINUTE)",[room]);assert.equal(signals.length,1);
  assert.equal((await b.query('SELECT id FROM video_signals'))[0].length,0);
  await assert.rejects(a.query('INSERT INTO video_signals(consultation_id,generation,sender_role,payload) VALUES (?,?,?,?)',[room,1,'doctor','{}']),/row.level security/i);
  await assert.rejects(a.query('UPDATE video_consultations SET appointment_id=? WHERE id=?',[31,room]),/permission denied/i,'Immutable ownership column');
  const client=await a.getConnection();try{await client.beginTransaction();const [r]=await client.query("SELECT v.*,a.patient_id,d.user_id AS doctor_user_id, DATE_FORMAT(v.patient_seen,'%Y-%m-%dT%H:%i:%s') AS patient_seen FROM video_consultations v JOIN appointments a ON a.id=v.appointment_id JOIN doctors d ON d.id=a.doctor_id WHERE v.id=? FOR UPDATE",[room]);assert.equal(r.length,1);await client.commit();}finally{client.release();}
  await doctor.query('UPDATE video_consultations SET admitted=FALSE WHERE id=?',[room]);await a.query('DELETE FROM video_signals WHERE consultation_id=?',[room]);assert.equal((await db.query('SELECT id FROM medicare_video.video_signals')).rows.length,0);
  const [afterContext]=await db.query("SELECT current_setting('medicare.actor_id',true) AS id").then(r=>r.rows);assert.ok(!afterContext.id,'Actor settings do not leak between transactions');
  assert.equal(postgresOptions('postgresql://user:password@example.com/postgres?sslmode=no-verify').ssl.rejectUnauthorized,true);
  assert.ok(postgresVideoSQL('INSERT IGNORE INTO video_consultations (id,appointment_id) VALUES (?,?)').endsWith('ON CONFLICT DO NOTHING'));
  console.log('PASS: actual isolated PostgreSQL migration, RLS patient/doctor isolation, deny-by-default guest access, immutable ownership, admission-gated signaling, sender role, scoped locks, ephemeral cleanup, transaction-context isolation and verified TLS configuration. This is not a live Supabase or media test.');
}finally{await db.close();await mysql.end();}
