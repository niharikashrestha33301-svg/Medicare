import fs from 'node:fs';
import {createHash} from 'node:crypto';
import pg from 'pg';
import mysql from '../config/db.js';
import {postgresOptions} from '../services/videoStore.js';

let client;
try{
  if(!process.env.SUPABASE_PROJECT_REF)throw new Error('Set SUPABASE_PROJECT_REF to the new MediCare project ref. Do not use any unrelated project.');
  client=new pg.Client(postgresOptions());await client.connect();
  if(!(await client.query("SELECT to_regclass('auth.users') AS users")).rows[0].users)throw new Error('The target is not a configured Supabase Auth database. Nothing was migrated.');
  await client.query('BEGIN');
  await client.query("SELECT pg_advisory_xact_lock(hashtext('medicare-schema-setup'))");
  await client.query('CREATE SCHEMA IF NOT EXISTS medicare_video');
  await client.query('CREATE TABLE IF NOT EXISTS medicare_video.schema_migrations (name text PRIMARY KEY,sha256 text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
  await client.query('ALTER TABLE medicare_video.schema_migrations ENABLE ROW LEVEL SECURITY');
  const directory=new URL('../../supabase/migrations/',import.meta.url);
  for(const name of fs.readdirSync(directory).filter(name=>name.endsWith('.sql')).sort()){
    const source=fs.readFileSync(new URL(name,directory),'utf8'),checksum=createHash('sha256').update(source).digest('hex');
    const prior=(await client.query('SELECT sha256 FROM medicare_video.schema_migrations WHERE name=$1',[name])).rows[0];
    if(prior){if(prior.sha256!==checksum)throw new Error('An applied migration changed. Create a new additive migration before continuing.');continue;}
    await client.query(source);await client.query('INSERT INTO medicare_video.schema_migrations(name,sha256) VALUES ($1,$2)',[name,checksum]);
  }
  await client.query('COMMIT');
  const checks=await client.query("SELECT schemaname,tablename,rowsecurity FROM pg_tables WHERE schemaname='medicare_video' OR schemaname='public' AND tablename LIKE 'medicare_%'");
  if(checks.rows.some(row=>!row.rowsecurity))throw new Error('A MediCare table is missing RLS. Keep VIDEO_STORE=mysql until corrected.');
  console.log('MediCare Supabase migrations and RLS check passed. Existing MySQL data and authentication were preserved. Set VIDEO_STORE=supabase and restart the API to use the consultation bridge. Native Supabase Auth account migration is a separate verified cutover.');
}catch(error){await client?.query('ROLLBACK').catch(()=>{});console.error('Supabase setup did not complete:',error.code||error.message);process.exitCode=1;}
finally{await client?.end();await mysql.end();}
