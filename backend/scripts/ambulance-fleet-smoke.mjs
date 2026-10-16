import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import pool from '../config/db.js';
const tag='fleet-test-'+Date.now(),ids=[],password='fleet-test-password';
async function api(path,account,method='GET',body){const response=await fetch('http://localhost:5000/api'+path,{method,headers:{'Content-Type':'application/json',...(account?{Authorization:'Bearer '+account.token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});return {status:response.status,data:await response.json()};}
try{
 const [adminRow]=await pool.query("INSERT INTO users(name,email,password,role) VALUES(?,?,?,'admin')",['Fleet Test Admin',tag+'-admin@example.com',await bcrypt.hash(password,10)]);ids.push(adminRow.insertId);const admin=(await api('/auth/login',null,'POST',{email:tag+'-admin@example.com',password})).data;
 async function register(suffix){const r=await api('/auth/register',null,'POST',{name:'Fleet Test '+suffix,email:tag+'-'+suffix+'@example.com',password});assert.equal(r.status,201);ids.push(r.data.user.id);return r.data;}
 const driver=await register('driver'),other=await register('other'),a=await register('a'),b=await register('b');
 const point={latitude:12.97,longitude:77.59,accuracy:15,measuredAt:new Date().toISOString(),shareLocation:true};const pickup={...point,latitude:12.98,phone:'0000000000'};
 assert.equal((await api('/ambulance/account')).status,401);assert.equal((await api('/ambulance/requests',a,'POST',pickup)).status,503,'No provider means no fake request');
 assert.equal((await api('/ambulance/drivers',driver,'POST',{organization:'Disposable test provider',licenseReference:tag,phone:'0000000000',status:'Approved'})).status,201);
 assert.equal((await api('/ambulance/account',driver)).data.application.status,'Pending');assert.equal((await api('/ambulance/vehicles',driver,'POST',{registration:tag,description:'Fixture only'})).status,403);
 assert.equal((await api('/ambulance/reviews/drivers/'+driver.user.id,driver,'PUT',{decision:'Approved'})).status,403);
 assert.equal((await api('/ambulance/reviews/drivers/'+driver.user.id,admin,'PUT',{decision:'Approved',reason:'Disposable fixture only'})).status,200);
 const vehicleResult=await api('/ambulance/vehicles',driver,'POST',{registration:tag,description:'Disposable test vehicle'});assert.equal(vehicleResult.status,201);const vehicle=vehicleResult.data.id;
 assert.equal((await api('/ambulance/vehicles/'+vehicle+'/location',driver,'PUT',point)).status,404);
 assert.equal((await api('/ambulance/reviews/vehicles/'+vehicle,admin,'PUT',{decision:'Approved',reason:'Disposable fixture only'})).status,200);
 assert.equal((await api('/ambulance/vehicles/'+vehicle+'/availability',driver,'PUT',{available:true})).status,409);
 assert.equal((await api('/ambulance/vehicles/'+vehicle+'/location',other,'PUT',point)).status,403);
 assert.equal((await api('/ambulance/vehicles/'+vehicle+'/location',driver,'PUT',{...point,latitude:99})).status,400);
 assert.equal((await api('/ambulance/vehicles/'+vehicle+'/location',driver,'PUT',{...point,measuredAt:new Date(Date.now()-180000).toISOString()})).status,400);
 assert.equal((await api('/ambulance/vehicles/'+vehicle+'/location',driver,'PUT',point)).status,200);
 assert.equal((await api('/ambulance/vehicles/'+vehicle+'/availability',driver,'PUT',{available:true})).status,200);
 const race=await Promise.all([api('/ambulance/requests',a,'POST',pickup),api('/ambulance/requests',b,'POST',pickup)]);assert.deepEqual(race.map(r=>r.status).sort(),[201,503]);const winner=race[0].status===201?a:b,loser=winner===a?b:a,request=race.find(r=>r.status===201).data.request;
 assert.equal((await api('/ambulance/requests/'+request.id,loser)).status,404);
 let tracking=(await api('/ambulance/requests/'+request.id,winner)).data.request;assert.equal(tracking.trackingAvailable,false);assert.equal(tracking.position,null);
 const preaccept=(await api('/ambulance/provider/requests/'+request.id,driver)).data.request;assert.equal(preaccept.pickupApproximate,true);assert.equal(preaccept.patientPhone,undefined);
 assert.equal((await api('/ambulance/provider/requests/'+request.id+'/status',other,'PUT',{status:'Accepted'})).status,404);
 assert.equal((await api('/ambulance/provider/requests/'+request.id+'/status',driver,'PUT',{status:'Accepted'})).status,200);
 tracking=(await api('/ambulance/requests/'+request.id,winner)).data.request;assert.equal(tracking.trackingAvailable,true);assert.equal(tracking.position.latitude,point.latitude);assert.ok(tracking.distanceKm>0);assert.equal(tracking.etaSeconds,null);
 for(const status of ['En route','Arrived','Completed'])assert.equal((await api('/ambulance/provider/requests/'+request.id+'/status',driver,'PUT',{status})).status,200);
 tracking=(await api('/ambulance/requests/'+request.id,winner)).data.request;assert.equal(tracking.position,null);assert.equal(tracking.pickup,null);const [[closed]]=await pool.query('SELECT pickup_lat,pickup_lon FROM ambulance_requests WHERE id=?',[request.id]);assert.equal(closed.pickup_lat,null);assert.equal(closed.pickup_lon,null);
 await api('/ambulance/vehicles/'+vehicle+'/availability',driver,'PUT',{available:true});const cancel=(await api('/ambulance/requests',a,'POST',pickup)).data.request;assert.ok(cancel.id);assert.equal((await api('/ambulance/requests/'+cancel.id+'/cancel',a,'PUT',{})).status,200);assert.equal((await api('/ambulance/provider/requests/'+cancel.id+'/status',driver,'PUT',{status:'Accepted'})).status,409);
 await api('/ambulance/vehicles/'+vehicle+'/location',driver,'DELETE',{});assert.equal((await api('/ambulance/status')).data.tracking.available,false);
 console.log('PASS: real MySQL/API driver and vehicle approval, GPS consent/freshness, availability, competing requests, driver acceptance, private tracking, distance, completion, cancellation and location revocation. Synthetic coordinates were used only in disposable fixtures; no ambulance was dispatched.');
}finally{if(ids.length){await pool.query('DELETE FROM ambulance_requests WHERE patient_id IN (?) OR vehicle_id IN (SELECT id FROM ambulance_vehicles WHERE driver_id IN (?))',[ids,ids]);await pool.query('DELETE FROM users WHERE id IN (?) AND email LIKE ?',[ids,tag+'%']);}await pool.end();}
