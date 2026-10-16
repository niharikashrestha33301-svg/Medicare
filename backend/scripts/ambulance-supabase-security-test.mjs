import fs from 'node:fs';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite(),patient='11111111-1111-1111-1111-111111111111',other='22222222-2222-2222-2222-222222222222',driver='33333333-3333-3333-3333-333333333333';
async function actor(uid,fn){await db.exec('BEGIN;SET LOCAL ROLE authenticated');try{await db.query("select set_config('request.jwt.claim.sub',$1,true)",[uid]);const result=await fn();await db.exec('COMMIT');return result;}catch(e){await db.exec('ROLLBACK');throw e;}}
try{
 await db.exec(`create role anon nologin;create role authenticated nologin;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated;grant execute on function auth.uid() to authenticated;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,update,delete on storage.objects to authenticated;`);
 for(const name of ['20261015135806_medicare_patient_security.sql','20261016084650_medicare_ambulance_security.sql'])await db.exec(fs.readFileSync(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8'));
 await db.query("insert into auth.users values($1,'{}',now()),($2,'{}',now()),($3,'{}',now())",[patient,other,driver]);
 await actor(driver,()=>db.query('insert into public.medicare_ambulance_drivers(user_id,organization,license_reference,phone) values($1,\'Test only\',\'Test only\',\'0000000000\')',[driver]));
 await assert.rejects(actor(driver,()=>db.query("update public.medicare_ambulance_drivers set status='Approved' where user_id=$1",[driver])),/permission denied/);
 await db.query("update public.medicare_ambulance_drivers set status='Approved' where user_id=$1",[driver]);
 const vehicle=(await db.query("insert into public.medicare_ambulance_vehicles(driver_id,registration,description,status) values($1,'TEST-ONLY','Fixture','Approved') returning id",[driver])).rows[0].id;
 const request=(await db.query('insert into public.medicare_emergency_requests(patient_id,vehicle_id) values($1,$2) returning id',[patient,vehicle])).rows[0].id;
 await db.query("insert into public.medicare_emergency_pickups values($1,12.98,77.59,'0000000000')",[request]);
 await db.query('insert into public.medicare_ambulance_positions values($1,12.97,77.59,now(),now())',[request]);
 assert.equal((await actor(driver,()=>db.query('select * from public.medicare_emergency_pickups'))).rows.length,0,'Exact pickup hidden before acceptance');
 assert.equal((await actor(patient,()=>db.query('select * from public.medicare_ambulance_positions'))).rows.length,0);
 await db.query("update public.medicare_emergency_requests set status='Accepted' where id=$1",[request]);
 assert.equal((await actor(patient,()=>db.query('select * from public.medicare_ambulance_positions'))).rows.length,1);
 assert.equal((await actor(driver,()=>db.query('select * from public.medicare_emergency_pickups'))).rows.length,1);
 assert.equal((await actor(other,()=>db.query('select * from public.medicare_ambulance_positions'))).rows.length,0);
 assert.equal((await actor(other,()=>db.query('select * from public.medicare_emergency_requests'))).rows.length,0);
 await assert.rejects(actor(driver,()=>db.query('insert into public.medicare_ambulance_positions values($1,1,1,now(),now())',[request])),/permission denied/);
 await db.query("update public.medicare_ambulance_drivers set status='Rejected' where user_id=$1",[driver]);assert.equal((await actor(patient,()=>db.query('select * from public.medicare_ambulance_positions'))).rows.length,0,'Revoked provider immediately loses location access');
 await db.query("update public.medicare_ambulance_drivers set status='Approved' where user_id=$1",[driver]);await db.query("update public.medicare_ambulance_positions set measured_at=now()-interval '3 minutes'");assert.equal((await actor(patient,()=>db.query('select * from public.medicare_ambulance_positions'))).rows.length,0,'Stale positions are hidden');
 await db.query('update public.medicare_ambulance_positions set measured_at=now()');await db.query("update public.medicare_emergency_requests set status='Cancelled' where id=$1",[request]);assert.equal((await actor(patient,()=>db.query('select * from public.medicare_ambulance_positions'))).rows.length,0);
 console.log('PASS: isolated PostgreSQL ambulance RLS, pending registration, immutable approval, assigned-only GPS, pickup privacy, stale/revoked/cancelled access denial and no browser GPS writes. No live Supabase or Realtime connection was tested.');
}finally{await db.close();}
