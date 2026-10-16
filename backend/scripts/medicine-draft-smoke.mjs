import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {JSDOM} from '../../frontend/node_modules/jsdom/lib/api.js';
import pool from '../config/db.js';
const tag='medicine-draft-'+Date.now(),ids=[],root=new URL('../../frontend/public/',import.meta.url);
const draft={name:'Paracetamol 500 mg',dosage:'1 tablet (example only)',timings:['09:00','21:00'],startDate:'2026-10-16',endDate:'2026-10-18',timezone:'Asia/Kolkata',patient_id:999999};
const fragment='#reminder='+encodeURIComponent(JSON.stringify(draft));
try{
 const r=await fetch('http://localhost:5000/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Draft Test Patient',email:tag+'@example.com',password:'medicine-draft-password'})});assert.equal(r.status,201);const account=await r.json();ids.push(account.user.id);
 const w=new JSDOM(fs.readFileSync(new URL('medicines.html',root),'utf8'),{url:'http://localhost:5000/medicines.html'+fragment,runScripts:'outside-only'}).window;
 const pending=[],writes=[];w.AbortController=AbortController;w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 w.localStorage.setItem('mc_token',JSON.stringify(account.token));w.localStorage.setItem('mc_user',JSON.stringify(account.user));
 w.fetch=(url,options)=>{if(options?.method==='POST')writes.push(JSON.parse(options.body));const p=fetch(url,options);pending.push(p);return p;};
 const settle=async()=>{for(let i=0;i<15;i++){await Promise.all(pending.splice(0));await new Promise(r=>setTimeout(r,10));}};
 try{
  for(const asset of ['portal-api.js','medicines.js'])w.eval(fs.readFileSync(new URL(asset,root),'utf8'));await settle();
  assert.equal(writes.length,0,'A link alone must not create records');assert.equal(w.location.hash,'','Sensitive draft removed from address bar');
  const form=w.document.getElementById('plan-form');assert.equal(w.document.getElementById('editor').open,true);
  for(const [key,value]of Object.entries({name:draft.name,dosage:draft.dosage,timezone:'Asia/Kolkata',timings:'09:00, 21:00',startDate:draft.startDate,endDate:draft.endDate}))assert.equal(form.elements.namedItem(key).value,value);
  form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle();assert.equal(writes.length,1);assert.equal(writes[0].patient_id,undefined);assert.ok(w.document.getElementById('notice').textContent.includes('saved securely to your signed-in account (Asia/Kolkata)'));
  const [[saved]]=await pool.query('SELECT patient_id,timezone,timings,DATE_FORMAT(start_date,\'%Y-%m-%d\') AS start,DATE_FORMAT(end_date,\'%Y-%m-%d\') AS end FROM medicine_plans WHERE patient_id=?',[account.user.id]);assert.equal(saved.patient_id,account.user.id);assert.equal(saved.timezone,'Asia/Kolkata');assert.deepEqual(JSON.parse(saved.timings),draft.timings);assert.equal(saved.start,draft.startDate);assert.equal(saved.end,draft.endDate);
 }finally{w.close();}
 const launcher=fs.readFileSync(new URL('../../medicines.html',import.meta.url),'utf8');let target;
 vm.runInNewContext(launcher.match(/<script>([\s\S]*?)<\/script>/)[1],{URL,location:{href:'http://127.0.0.1:5500/medicines.html'+fragment,hash:fragment,protocol:'http:',replace:value=>{target=value;}},document:{getElementById:()=>({})}});assert.equal(target,'http://127.0.0.1:5500/frontend/public/medicines.html'+fragment);
 console.log('PASS: real authenticated draft save uses server-verified patient identity, IST times and dates, rejects draft account injection, displays success, and preserves fragments through Live Server. Browser delivery was not tested.');
}finally{if(ids.length)await pool.query('DELETE FROM users WHERE id IN (?) AND email LIKE ?',[ids,tag+'%']);await pool.end();}
