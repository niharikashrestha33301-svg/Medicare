import test from 'node:test';
import assert from 'node:assert/strict';
import {supabaseAuthConfiguration,verifySupabaseSession} from '../services/supabaseAuth.js';
test('prepared Supabase Auth binds project, remotely validates session and reads role under RLS',async()=>{
 const names=['SUPABASE_PROJECT_REF','SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SUPABASE_ANON_KEY'],saved=Object.fromEntries(names.map(n=>[n,process.env[n]])),original=globalThis.fetch;
 const id='11111111-1111-1111-1111-111111111111';let confirmed=true,status='Active',invalidToken=false,profileId=id;
 try{
  for(const name of names)delete process.env[name];assert.throws(supabaseAuthConfiguration,/not configured/);
  Object.assign(process.env,{SUPABASE_PROJECT_REF:'test-project',SUPABASE_URL:'https://different.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test_only'});assert.throws(supabaseAuthConfiguration,/must match/);
  process.env.SUPABASE_URL='https://test-project.supabase.co';process.env.SUPABASE_PUBLISHABLE_KEY='x.'+Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')+'.x';assert.throws(supabaseAuthConfiguration,/never a secret/);process.env.SUPABASE_PUBLISHABLE_KEY='sb_publishable_test_only';
  const calls=[];globalThis.fetch=async(url,options)=>{calls.push(url);assert.equal(options.headers.Authorization,'Bearer test-token');assert.equal(options.headers.apikey,'sb_publishable_test_only');return {ok:!invalidToken,status:invalidToken?401:200,json:async()=>url.includes('/auth/v1/user')?{id,email:'patient@example.invalid',email_confirmed_at:confirmed?'2026-10-16T00:00:00Z':null,user_metadata:{role:'admin'}}:[{id:profileId,name:'Patient',role:'patient',status,phone:''}]};};
  assert.equal((await verifySupabaseSession('test-token')).role,'patient','Editable Auth metadata cannot grant admin');assert.equal(calls.length,2);assert.ok(calls[0].endsWith('/auth/v1/user'));assert.ok(calls[1].includes('/rest/v1/medicare_profiles?'));
  confirmed=false;await assert.rejects(verifySupabaseSession('test-token'),/Verify your/);confirmed=true;status='Suspended';await assert.rejects(verifySupabaseSession('test-token'),/suspended/);status='Active';profileId='other';await assert.rejects(verifySupabaseSession('test-token'),/unavailable/);profileId=id;invalidToken=true;await assert.rejects(verifySupabaseSession('test-token'),/Invalid or expired/);
 }finally{globalThis.fetch=original;for(const name of names){if(saved[name]===undefined)delete process.env[name];else process.env[name]=saved[name];}}
});
