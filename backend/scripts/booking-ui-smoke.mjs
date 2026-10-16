import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from '../../frontend/node_modules/jsdom/lib/api.js';
import React from '../../frontend/node_modules/react/index.js';
import ReactDOM from '../../frontend/node_modules/react-dom/client.js';
import {transform} from '../../frontend/node_modules/esbuild/lib/main.js';
import pool from '../config/db.js';
import bcrypt from 'bcryptjs';

globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {act}=React,tag='booking-ui-'+Date.now(),users=[];
try{
  const [adminRow]=await pool.query("INSERT INTO users(name,email,password,role) VALUES(?,?,?,'admin')",['Booking UI Admin',tag+'-admin@example.com',await bcrypt.hash('booking-test-password',10)]);users.push(adminRow.insertId);
  const admin=await (await fetch('http://localhost:5000/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:tag+'-admin@example.com',password:'booking-test-password'})})).json();
  let doctorId;const review=async decision=>{const r=await fetch('http://localhost:5000/api/admin/doctors/'+doctorId+'/review',{method:'PUT',headers:{'Content-Type':'application/json',Authorization:'Bearer '+admin.token},body:JSON.stringify({decision})});assert.equal(r.status,200);};
  const doctorResponse=await fetch('http://localhost:5000/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:tag,email:tag+'-doctor@example.com',password:'booking-test-password',role:'doctor',hospitalId:1,licenseNo:tag})});
  const doctor=await doctorResponse.json();assert.equal(doctorResponse.status,201);users.push(doctor.user.id);
  const [[fixtureDoctor]]=await pool.query('SELECT id FROM doctors WHERE user_id=?',[doctor.user.id]);doctorId=fixtureDoctor.id;await review('Approved');
  for(const [index,page]of ['index.html','patient.html'].entries()){
    await review('Approved');
    const response=await fetch('http://localhost:5000/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Booking UI Test',email:`${tag}-${index}@example.com`,password:'booking-test-password',phone:'0000000000'})});
    const account=await response.json();assert.equal(response.status,201);users.push(account.user.id);
    const w=new JSDOM('<div id="root"></div>',{url:'http://localhost:5000/'+page,runScripts:'outside-only'}).window;
    globalThis.window=w;globalThis.document=w.document;Object.defineProperty(globalThis,'navigator',{value:w.navigator,configurable:true});
    w.React=React;w.ReactDOM={createRoot:(...args)=>{w.testRoot=ReactDOM.createRoot(...args);return w.testRoot;}};w.lucide={createIcons(){}};w.AbortController=AbortController;w.AbortSignal=AbortSignal;
    w.localStorage.setItem('mc_user',JSON.stringify(account.user));w.localStorage.setItem('mc_token',JSON.stringify(account.token));
    const pending=[],posts=[],results=[];
    w.fetch=(url,options)=>{const booking=String(url).endsWith('/appointments')&&options?.method==='POST';if(booking)posts.push(JSON.parse(options.body));const target=String(url).endsWith('/doctors')?url+'?search='+tag:url;const p=fetch(target,options).then(async response=>{if(booking)results.push(await response.clone().json());return response;});pending.push(p);return p;};
    const settle=async()=>act(async()=>{for(let n=0;n<10;n++){await Promise.all(pending.splice(0));await new Promise(r=>setTimeout(r,20));}});
    try{
      for(const asset of ['currency.js','portal-api.js'])w.eval(fs.readFileSync(new URL('../../frontend/public/'+asset,import.meta.url),'utf8'));
      const html=fs.readFileSync(new URL('../../'+page,import.meta.url),'utf8'),source=html.match(/<script type="text\/babel">([\s\S]*?)<\/script>/)[1];
      await act(async()=>w.eval((await transform(source,{loader:'jsx'})).code));await settle();
      const find=[...w.document.querySelectorAll('button')].find(b=>/^(find doctors|my patients \/ doctors)$/i.test(b.textContent.trim()));assert.ok(find,'Find Doctors navigation exists');await act(async()=>find.click());await settle();
      const open=[...w.document.querySelectorAll('button')].find(b=>/^(Book Slot|Book Appointment|Book OPD|Book Now|Book Visit)$/i.test(b.textContent.trim()));assert.ok(open,'Doctor booking button exists');await act(async()=>open.click());await settle();
      const form=[...w.document.forms].find(f=>f.elements.namedItem('patientPhone')&&f.elements.namedItem('date'));assert.ok(form);
      for(const [name,value]of Object.entries({date:`2038-10-${15+index}`,patientName:'Booking UI Test',patientEmail:account.user.email,patientPhone:'0000000000',patientAge:'30'})){if(form.elements.namedItem(name))form.elements.namedItem(name).value=value;}
      const slot=form.elements.namedItem('slot')||form.elements.namedItem('timeSlot');assert.ok(slot.value);
      const selected=slot.value;assert.ok(form.checkValidity());
      const button=form.querySelector('button[type="submit"]');await act(async()=>button.click());await settle();
      assert.equal(posts.length,1,'Confirm actually sends one booking request');assert.equal(posts[0].timeSlot,selected,'Selected time survives built-in form.slot collision');
      assert.equal(results[0]?.success,true,JSON.stringify(results[0]));
      const [[saved]]=await pool.query('SELECT COUNT(*) AS total FROM appointments WHERE patient_id=? AND time_slot=?',[account.user.id,selected]);assert.equal(saved.total,1,'Appointment persisted in real MySQL');
      assert.ok(![...w.document.forms].some(f=>f.elements.namedItem('patientPhone')&&f.elements.namedItem('date')),'Successful booking closes the modal');
      await review('Pending');
      const doctorsButton=[...w.document.querySelectorAll('button')].find(b=>/^(find doctors|my patients \/ doctors)$/i.test(b.textContent.trim()));await act(async()=>doctorsButton.click());await settle();
      const retryOpen=[...w.document.querySelectorAll('button')].find(b=>/^(Book Slot|Book Appointment|Book OPD|Book Now|Book Visit)$/i.test(b.textContent.trim()));await act(async()=>retryOpen.click());await settle();
      const failedForm=[...w.document.forms].find(f=>f.elements.namedItem('patientPhone')&&f.elements.namedItem('date'));failedForm.elements.namedItem('date').value='2039-10-15';failedForm.elements.namedItem('patientPhone').value='0000000000';const failedButton=failedForm.querySelector('button[type="submit"]');await act(async()=>failedButton.click());await settle();
      assert.ok(failedForm.textContent.includes('Choose an active, verified doctor.'),'Unavailable doctor is rejected by date-aware availability');assert.equal(failedButton.disabled,true,'Booking stays disabled after verification is revoked');
      await act(async()=>w.dispatchEvent(new w.Event('focus')));await settle();
      assert.ok([...w.document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Booking unavailable'&&b.disabled),'Returning to the page refreshes verification from the real database');
      await act(async()=>w.testRoot.unmount());
      await act(async()=>w.eval((await transform(source,{loader:'jsx'})).code));await settle();
      const pendingNav=[...w.document.querySelectorAll('button')].find(b=>/^(find doctors|my patients \/ doctors)$/i.test(b.textContent.trim()));await act(async()=>pendingNav.click());await settle();
      const blocked=[...w.document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Booking unavailable');assert.ok(blocked?.disabled,'Freshly loaded unverified doctor cannot open booking');
      console.log(`PASS: ${page} doctor selection → Confirm button click → real API → persisted appointment, with correct selected slot.`);
    }finally{await act(async()=>w.testRoot?.unmount());w.close();}
  }
}finally{if(users.length)await pool.query('DELETE FROM users WHERE id IN (?) AND email LIKE ?',[users,tag+'%']);await pool.end();}
