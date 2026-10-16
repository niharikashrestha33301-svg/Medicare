import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from '../../frontend/node_modules/jsdom/lib/api.js';
import React from '../../frontend/node_modules/react/index.js';
import ReactDOM from '../../frontend/node_modules/react-dom/client.js';
import {transform} from '../../frontend/node_modules/esbuild/lib/main.js';
import pool from '../config/db.js';
const tag='lab-test-'+Date.now(),ids=[],base='http://localhost:5000',password='lab-test-password';
async function api(path,token,method='GET',body){const r=await fetch(base+'/api'+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};}
function windowFor(page,account,url=base+'/'){const w=new JSDOM(page,{url,runScripts:'outside-only'}).window;w.AbortController=AbortController;w.localStorage.setItem('mc_user',JSON.stringify(account.user));w.localStorage.setItem('mc_token',JSON.stringify(account.token));return w;}
try{
 const register=async suffix=>{const r=await api('/auth/register',null,'POST',{name:'Lab Test Patient',email:tag+suffix+'@example.com',password});assert.equal(r.status,201);ids.push(r.data.user.id);return r.data;};const a=await register('-a'),b=await register('-b');
 assert.equal((await api('/lab-bookings/my')).status,401);
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;const w=windowFor('<div id="root"></div>',a);globalThis.window=w;globalThis.document=w.document;Object.defineProperty(globalThis,'navigator',{value:w.navigator,configurable:true});
 w.React=React;w.ReactDOM={createRoot:(...args)=>{w.testRoot=ReactDOM.createRoot(...args);return w.testRoot;}};w.lucide={createIcons(){}};
 const pending=[];w.fetch=(url,options)=>{const p=fetch(url,options);pending.push(p);return p;};const settle=async()=>React.act(async()=>{for(let i=0;i<10;i++){await Promise.all(pending.splice(0));await new Promise(r=>setTimeout(r,20));}});
 try{
  w.eval(fs.readFileSync(new URL('../../frontend/public/currency.js',import.meta.url),'utf8'));
  const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8'),source=html.match(/<script type="text\/babel">([\s\S]*?)<\/script>/)[1];await React.act(async()=>w.eval((await transform(source,{loader:'jsx'})).code));await settle();
  const nav=[...w.document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Book Tests');assert.ok(nav);await React.act(async()=>nav.click());await settle();
  const book=[...w.document.querySelectorAll('button')].find(x=>x.textContent==='Book Test');await React.act(async()=>book.click());await settle();
  const form=[...w.document.forms].find(f=>f.elements.namedItem('tn'));assert.ok(form);for(const [name,value]of Object.entries({tn:'Lab Test Patient',tp:'0000000000',te:a.user.email,td:'2038-12-15',addr:'Disposable test address'})){if(form.elements.namedItem(name))form.elements.namedItem(name).value=value;}
  assert.ok(form.checkValidity());await React.act(async()=>form.querySelector('[type="submit"]').click());await settle();assert.ok(w.document.body.textContent.includes('Test request received'));assert.ok(w.document.querySelector('a[href="./test-bookings.html"]'));
 }finally{await React.act(async()=>w.testRoot?.unmount());w.close();}
 let list=await api('/lab-bookings/my',a.token);assert.equal(list.status,200);assert.equal(list.data.bookings.length,1);const saved=list.data.bookings[0];assert.equal(saved.status,'Requested');assert.equal(Number(saved.price),299);
 const [[stored]]=await pool.query('SELECT patient_id,email FROM patient_lab_bookings WHERE id=?',[saved.id]);assert.equal(stored.patient_id,a.user.id);assert.equal(stored.email,a.user.email);
 assert.equal((await api('/lab-bookings/my',b.token)).data.bookings.length,0);assert.equal((await api('/lab-bookings/'+saved.id+'/cancel',b.token,'PUT',{})).status,404);
 const body={testName:saved.testName,collectionDate:saved.collectionDate,patientName:'Lab Test Patient',phone:'0000000000',address:'Disposable test address',preference:'Home Collection',price:1,patientId:b.user.id};
 assert.equal((await api('/lab-bookings',a.token,'POST',body)).status,409);assert.equal((await api('/lab-bookings',a.token,'POST',{...body,collectionDate:'2020-01-01'})).status,400);assert.equal((await api('/lab-bookings',a.token,'POST',{...body,testName:'Unknown test'})).status,400);
 const historyPage=fs.readFileSync(new URL('../../frontend/public/test-bookings.html',import.meta.url),'utf8');
 for(const origin of ['http://127.0.0.1:5500','http://localhost:5501']){
  const preview=windowFor(historyPage,a,origin+'/frontend/public/test-bookings.html'),pending=[];preview.fetch=(url,options)=>{const promise=fetch(url,options);pending.push(promise);return promise;};
  try{for(const file of ['portal-api.js','care-page.js','test-bookings.js'])preview.eval(fs.readFileSync(new URL('../../frontend/public/'+file,import.meta.url),'utf8'));for(let i=0;i<10;i++){await Promise.all(pending.splice(0));await new Promise(r=>setTimeout(r,20));}assert.equal(preview.MedicareAPI.base,base+'/api');assert.equal(preview.document.getElementById('account').hidden,false);assert.ok(preview.document.getElementById('bookings').textContent.includes(saved.bookingCode),'Saved booking renders under Live Server origin');}finally{preview.close();}
 }
 const h=windowFor(historyPage,a,base+'/test-bookings.html');const requests=[];h.fetch=(url,options)=>{const p=fetch(url,options);requests.push(p);return p;};
 const wait=async()=>{for(let i=0;i<10;i++){await Promise.all(requests.splice(0));await new Promise(r=>setTimeout(r,20));}};
 try{for(const file of ['portal-api.js','care-page.js','test-bookings.js'])h.eval(fs.readFileSync(new URL('../../frontend/public/'+file,import.meta.url),'utf8'));await wait();assert.ok(h.document.getElementById('bookings').textContent.includes(saved.bookingCode));h.document.querySelector('[data-cancel]').click();await wait();assert.ok(h.document.getElementById('bookings').textContent.includes('Cancelled'));}finally{h.close();}
 assert.equal((await api('/lab-bookings/my',a.token)).data.bookings[0].status,'Cancelled');
 const repeat=await api('/lab-bookings',a.token,'POST',body);assert.equal(repeat.status,201);assert.equal((await api('/lab-bookings/'+repeat.data.bookingId+'/cancel',a.token,'PUT',{})).status,200,'Repeated cancel/rebook cycles are supported');
 console.log('PASS: simulated booking and history UI with real MySQL/API persistence, owner-only retrieval/cancellation, duplicate and past-date validation, authoritative prices/identity, history reload and rebooking. No lab dispatch or payment was performed.');
}finally{if(ids.length)await pool.query('DELETE FROM users WHERE id IN (?) AND email LIKE ?',[ids,tag+'%']);await pool.end();}
