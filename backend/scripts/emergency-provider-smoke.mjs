import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pool from '../config/db.js';
import {ensureAmbulanceSchema,patientDispatchTracking,validateAmbulancePosition} from '../services/ambulanceDispatches.js';
const tag='emergency-provider-test-'+Date.now(),ids=[],dispatchId=randomUUID();
async function api(path,token){const r=await fetch('http://localhost:5000/api'+path,{headers:token?{Authorization:'Bearer '+token}:{}});return {status:r.status,data:await r.json()};}
try{
 await ensureAmbulanceSchema();const accounts=[];
 for(const suffix of ['a','b']){const r=await fetch('http://localhost:5000/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Emergency Test Patient',email:tag+'-'+suffix+'@example.com',password:'emergency-test-password'})});assert.equal(r.status,201);const account=await r.json();ids.push(account.user.id);accounts.push(account);}
 const [a,b]=accounts;const base='/emergency/tracking/dispatches';
 assert.equal((await api(base)).status,401);assert.deepEqual((await api(base,a.token)).data.dispatches,[]);
 await pool.query('INSERT INTO ambulance_dispatches(id,patient_id,provider_name,provider_dispatch_id) VALUES(?,?,?,?)',[dispatchId,a.user.id,'Test adapter',tag]);
 assert.equal((await api(base,a.token)).data.dispatches[0].id,dispatchId);assert.deepEqual((await api(base,b.token)).data.dispatches,[]);
 assert.equal((await api(base+'/'+dispatchId,b.token)).status,404);
 const unavailable=await api(base+'/'+dispatchId,a.token);assert.equal(unavailable.status,503);assert.equal(unavailable.data.tracking.available,false);assert.deepEqual(unavailable.data.tracking.vehicles,[]);
 let called=0;const position={dispatchId:tag,latitude:12.97,longitude:77.59,updatedAt:new Date().toISOString()};
 // Synthetic adapter is injected in this test only. It is never registered in the API.
 const provider={name:'Test adapter',getDispatchLocation:async()=>{called++;return position;}};
 assert.equal((await patientDispatchTracking(b.user.id,dispatchId,{provider})).status,404);assert.equal(called,0,'Never request locations for an unauthorized patient');
 assert.equal((await patientDispatchTracking(a.user.id,dispatchId,{provider})).status,200);
 for(const change of [{latitude:91},{longitude:181},{latitude:'12.97'},{updatedAt:new Date(Date.now()-180000).toISOString()},{updatedAt:new Date(Date.now()+60000).toISOString()},{dispatchId:'unrelated-dispatch'}])assert.equal((await patientDispatchTracking(a.user.id,dispatchId,{provider:{...provider,getDispatchLocation:async()=>({...position,...change})}})).status,503);
 assert.throws(()=>validateAmbulancePosition({...position,updatedAt:'2026-10-15T12:00:00'}));
 const status=(await api('/emergency/tracking')).data.tracking;assert.equal(status.available,false);assert.deepEqual(status.vehicles,[]);
 assert.equal((await api('/emergency')).status,200);
 console.log('PASS: real MySQL dispatch ownership, authentication, private history, unavailable unconfigured provider, and isolated adapter validation for wrong/stale/future/invalid locations. Synthetic adapter used only in this test; no real tracking or dispatch was performed.');
}finally{if(ids.length)await pool.query('DELETE FROM users WHERE id IN (?) AND email LIKE ?',[ids,tag+'%']);await pool.end();}
