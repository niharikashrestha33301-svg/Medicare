import fs from 'node:fs';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite(),patient='11111111-1111-1111-1111-111111111111',other='22222222-2222-2222-2222-222222222222',admin='33333333-3333-3333-3333-333333333333';
async function actor(uid,fn,role='authenticated'){await db.exec('BEGIN;SET LOCAL ROLE '+role);try{await db.query("select set_config('request.jwt.claim.sub',$1,true)",[uid]);const result=await fn();await db.exec('COMMIT');return result;}catch(e){await db.exec('ROLLBACK');throw e;}}
try{
 await db.exec(`create role anon nologin;create role authenticated nologin;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated;grant execute on function auth.uid() to authenticated;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,update,delete on storage.objects to authenticated;`);

 await db.exec('grant usage on schema public to anon');
 for(const name of ['20261015135806_medicare_patient_security.sql','20261016130842_medicare_pharmacy_security.sql'])await db.exec(fs.readFileSync(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8'));
 await db.query("insert into auth.users values($1,'{}',now()),($2,'{}',now()),($3,'{}',now())",[patient,other,admin]);await db.query("update medicare_profiles set role='admin' where id=$1",[admin]);
 const product=(await db.query("insert into medicare_pharmacy_products(sku,name,category,description,manufacturer,pack_size,price_paise,stock,active) values('TEST','Fixture','Fixture','Fixture','Fixture','Fixture',12345,4,true) returning id")).rows[0].id;
 await db.query("insert into medicare_pharmacy_products(sku,name,category,description,manufacturer,pack_size,price_paise) values('HIDDEN','Fixture','Fixture','Fixture','Fixture','Fixture',12345)");
 assert.equal((await actor('',()=>db.query('select * from medicare_pharmacy_products'),'anon')).rows.length,1);
 assert.equal((await actor(admin,()=>db.query('select * from medicare_pharmacy_products'))).rows.length,2);
 const order=(await db.query("insert into medicare_pharmacy_orders(patient_id,checkout_key,status,total_paise,address,phone,prescription_required,review_status,payment_method) values($1,gen_random_uuid(),'Awaiting review',12345,'Fixture','0000000000',true,'Pending','COD') returning id",[patient])).rows[0].id;
 await db.query("insert into medicare_pharmacy_prescriptions values($1,'fixture.pdf','application/pdf',decode('25504446','hex'))",[order]);
 await db.query("insert into medicare_pharmacy_order_items values($1,$2,'Fixture',12345,1)",[order,product]);
 assert.equal((await actor(patient,()=>db.query('select * from medicare_pharmacy_orders'))).rows.length,1);
 assert.equal((await actor(other,()=>db.query('select * from medicare_pharmacy_orders'))).rows.length,0);
 assert.equal((await actor(other,()=>db.query('select * from medicare_pharmacy_order_items'))).rows.length,0);
 assert.equal((await actor(patient,()=>db.query('select * from medicare_pharmacy_prescriptions'))).rows.length,1);
 assert.equal((await actor(admin,()=>db.query('select * from medicare_pharmacy_prescriptions'))).rows.length,0,'Admin alone is not a pharmacist');
 await db.query("insert into medicare_pharmacists values($1,'Fixture',true)",[admin]);
 assert.equal((await actor(admin,()=>db.query('select * from medicare_pharmacy_prescriptions'))).rows.length,1);
 await assert.rejects(actor(patient,()=>db.query("update medicare_pharmacy_orders set review_status='Approved'")),/permission denied/);
 await assert.rejects(actor(admin,()=>db.query("update medicare_pharmacy_products set stock=999")),/permission denied/);
 await assert.rejects(actor(patient,()=>db.query("insert into medicare_pharmacists values($1,'Fixture',true)",[patient])),/permission denied/);
 await assert.rejects(db.query("update medicare_pharmacy_orders set status='Packing' where id=$1",[order]),/check constraint/);
 await db.query("update medicare_profiles set status='Suspended' where id=$1",[patient]);
 assert.equal((await actor(patient,()=>db.query('select * from medicare_pharmacy_prescriptions'))).rows.length,0);
 console.log('PASS: isolated PostgreSQL pharmacy schema, catalogue visibility, own-order/item/prescription RLS, pharmacist-only review access, blocked client stock/approval writes and dispensing constraints. Hosted Supabase integration is not configured or verified.');
}finally{await db.close();}
