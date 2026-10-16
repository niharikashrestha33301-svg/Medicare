import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from '../../frontend/node_modules/jsdom/lib/api.js';
import pool from '../config/db.js';
const tag='connected-health-'+Date.now(),ids=[],base='http://localhost:5000',root=new URL('../../frontend/public/',import.meta.url);
async function api(path,account,method='GET',body){const r=await fetch(base+'/api'+path,{method,headers:{'Content-Type':'application/json',...(account?{Authorization:'Bearer '+account.token}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};}
try{
 const accounts=[];for(const suffix of ['a','b']){const r=await api('/auth/register',null,'POST',{name:'Connected Health '+suffix,email:tag+suffix+'@example.com',password:'connected-health-password'});assert.equal(r.status,201);ids.push(r.data.user.id);accounts.push(r.data);}const [a,b]=accounts;
 assert.equal((await api('/lab-bookings',a,'POST',{testName:'Complete Blood Count (CBC)',collectionDate:'2038-12-15',preference:'Visit Lab',patientName:'Test Patient',phone:'0000000000',address:''})).status,201);
 assert.equal((await api('/medicine-reminders/plans',a,'POST',{name:'Private fixture medicine A',dosage:'Fixture only',timings:['09:00','21:00'],timezone:'Asia/Kolkata',startDate:'2038-12-15',endDate:'2038-12-17',stock:0,unitsPerDose:1,refillAt:0,active:true})).status,201);
 async function page(account){
  const w=new JSDOM(fs.readFileSync(new URL('health.html',root),'utf8'),{url:base+'/health.html',runScripts:'outside-only'}).window;
  w.AbortController=AbortController;w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};w.localStorage.setItem('mc_token',JSON.stringify(account.token));w.localStorage.setItem('mc_user',JSON.stringify(account.user));let failOrders=false;const pending=[];
  w.fetch=(url,options)=>{const p=failOrders&&String(url).endsWith('/pharmacy/orders')?Promise.reject(new Error('Test offline')):fetch(url,options);pending.push(p.catch(()=>{}));return p;};
  const settle=async()=>{for(let i=0;i<25;i++){await Promise.all(pending.splice(0));await new Promise(r=>setTimeout(r,10));}};
  for(const asset of ['portal-api.js','health-dashboard.js','health-connections.js'])w.eval(fs.readFileSync(new URL(asset,root),'utf8'));await settle();return {w,settle,setOffline:()=>{failOrders=true;}};
 }
 const first=await page(a),$=id=>first.w.document.getElementById(id);
 try{
  assert.equal($('dashboard').hidden,false);assert.ok($('care-profile').textContent.includes(a.user.email));assert.ok($('care-tests').textContent.includes('Complete Blood Count'));assert.ok($('care-medicines').textContent.includes('Private fixture medicine A'));assert.ok($('care-medicines').textContent.includes('Asia/Kolkata'));assert.ok($('care-orders').textContent.includes('No pharmacy orders'));
  first.setOffline();$('care-refresh').click();await first.settle();assert.ok($('care-orders').textContent.includes('temporarily unavailable'));assert.ok($('care-tests').textContent.includes('Complete Blood Count'),'Other services survive an order API failure');
  $('signout').click();for(const id of ['care-profile','care-tests','care-orders','care-medicines'])assert.equal($(id).textContent,'','Private section cleared on logout');
 }finally{first.w.close();}
 const second=await page(b);try{assert.ok(second.w.document.getElementById('care-tests').textContent.includes('No saved test bookings'));assert.ok(second.w.document.getElementById('care-medicines').textContent.includes('No medicine schedules'));assert.ok(!second.w.document.getElementById('dashboard').textContent.includes('Private fixture medicine A'));}finally{second.w.close();}
 console.log('PASS: simulated dashboard loads real MySQL/API profile, tests and medicine schedules, shows empty orders, isolates patients, tolerates partial service failure and clears private cards on logout.');
}finally{if(ids.length)await pool.query('DELETE FROM users WHERE id IN (?) AND email LIKE ?',[ids,tag+'%']);await pool.end();}
