import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite();
const a='11111111-1111-1111-1111-111111111111',b='22222222-2222-2222-2222-222222222222',doctor='33333333-3333-3333-3333-333333333333';
async function actor(uid,task){await db.exec('BEGIN; SET LOCAL ROLE authenticated;');try{await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[uid]);const result=await task();await db.exec('COMMIT');return result;}catch(error){await db.exec('ROLLBACK');throw error;}}
try{
  // Emulate only the Auth schema contract for real PostgreSQL policy tests.
  // This is not a Supabase Auth email/signup/SMTP integration test.
  await db.exec(`create role anon nologin;create role authenticated nologin;create schema auth;
    create table auth.users(id uuid primary key,raw_user_meta_data jsonb,email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,public to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;
    create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,update,delete on storage.objects to authenticated;`);
  await db.exec(fs.readFileSync(new URL('../../supabase/migrations/20261015135806_medicare_patient_security.sql',import.meta.url),'utf8'));
  await db.query("insert into auth.users values ($1,'{\"name\":\"Patient A\",\"role\":\"admin\"}',now()),($2,'{\"name\":\"Patient B\"}',now()),($3,'{\"name\":\"Doctor\"}',now())",[a,b,doctor]);
  assert.equal((await db.query('select role from public.medicare_profiles where id=$1',[a])).rows[0].role,'patient','Signup metadata cannot assign admin');
  await assert.rejects(actor(a,()=>db.query("update public.medicare_profiles set role='admin' where id=$1",[a])),/permission denied/i);
  await db.query("update public.medicare_profiles set role='doctor' where id=$1",[doctor]);
  const doc=(await db.query("insert into public.medicare_doctors(profile_id,name,specialization,fee_paise,verified,active) values ($1,'Doctor','General',12500,true,true) returning id",[doctor])).rows[0];
  const slot=(await db.query("insert into public.medicare_availability(doctor_id,starts_at,ends_at) values ($1,now()+interval '1 day',now()+interval '1 day 30 minutes') returning id",[doc.id])).rows[0];
  const visit=(await actor(a,()=>db.query('select public.medicare_book_visit($1,$2) as result',[slot.id,'0000000000']))).rows[0].result;
  assert.ok(visit.roomId);assert.equal((await actor(a,()=>db.query('select * from public.medicare_appointments'))).rows[0].fee_paise,12500);
  assert.equal((await actor(b,()=>db.query('select * from public.medicare_consultations'))).rows.length,0);
  assert.equal((await actor(doctor,()=>db.query('select * from public.medicare_consultations'))).rows[0].id,visit.roomId);
  await assert.rejects(actor(b,()=>db.query('select public.medicare_book_visit($1,$2)',[slot.id,'0000000000'])),/already booked/i);
  await assert.rejects(actor(b,()=>db.query('select public.medicare_cancel_visit($1)',[visit.appointmentId])),/not found/i);
  await actor(a,()=>db.query('select public.medicare_cancel_visit($1)',[visit.appointmentId]));
  assert.ok((await actor(b,()=>db.query('select public.medicare_book_visit($1,$2) as result',[slot.id,'0000000000']))).rows[0].result.appointmentId);
  await actor(a,()=>db.query("insert into public.medicare_health_records(patient_id,category,title,record_date) values ($1,'history','Private history',current_date)",[a]));
  assert.equal((await actor(b,()=>db.query('select * from public.medicare_health_records'))).rows.length,0);
  await assert.rejects(actor(a,()=>db.query('update public.medicare_health_records set patient_id=$1',[b])),/row.level security/i);
  await assert.rejects(actor(a,()=>db.query("update public.medicare_consultations set admitted=true")),/permission denied/i);
  await assert.rejects(actor(a,()=>db.query("insert into public.medicare_notification_history(patient_id,kind,channel,status) values ($1,'dose','push','Sent')",[a])),/permission denied/i);
  await actor(a,()=>db.query("insert into storage.objects(bucket_id,name) values ('medicare-medical-reports',$1)",[a+'/report.pdf']));
  assert.equal((await actor(b,()=>db.query('select * from storage.objects'))).rows.length,0);
  await assert.rejects(actor(b,()=>db.query("insert into storage.objects(bucket_id,name) values ('medicare-medical-reports',$1)",[a+'/forged.pdf'])),/row.level security/i);
  await db.query("update public.medicare_profiles set status='Suspended' where id=$1",[a]);
  assert.equal((await actor(a,()=>db.query('select * from public.medicare_health_records'))).rows.length,0,'Suspension applies even to an old Auth JWT');
  console.log('PASS: native Supabase-schema PostgreSQL policies: signup role injection denied, immutable roles, atomic real slot/fee booking, room ownership, duplicate rejection, owner-only cancellation, slot release, private health rows and backend-only notification/admission writes. Auth service itself is not live-verified.');
}finally{await db.close();}
