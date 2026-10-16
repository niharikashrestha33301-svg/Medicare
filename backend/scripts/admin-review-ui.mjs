import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from '../../frontend/node_modules/jsdom/lib/api.js';
import React from '../../frontend/node_modules/react/index.js';
import ReactDOM from '../../frontend/node_modules/react-dom/client.js';
import {transform} from '../../frontend/node_modules/esbuild/lib/main.js';
export async function approveUsingAdminPanel(account,doctorId){
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const w=new JSDOM('<div id="root"></div>',{url:'http://localhost:5000/admin.html',runScripts:'outside-only'}).window;
 globalThis.window=w;globalThis.document=w.document;Object.defineProperty(globalThis,'navigator',{value:w.navigator,configurable:true});
 w.React=React;w.ReactDOM={createRoot:(...args)=>{w.testRoot=ReactDOM.createRoot(...args);return w.testRoot;}};w.lucide={createIcons(){}};w.AbortController=AbortController;
 w.localStorage.setItem('mc_user',JSON.stringify(account.user));w.localStorage.setItem('mc_token',JSON.stringify(account.token));
 const pending=[],reviews=[];
 w.fetch=(url,options)=>{const promise=fetch(url,options).then(async r=>{if(String(url).includes('/review'))reviews.push({status:r.status,data:await r.clone().json()});return r;});pending.push(promise);return promise;};
 const settle=async()=>React.act(async()=>{for(let i=0;i<12;i++){await Promise.all(pending.splice(0));await new Promise(r=>setTimeout(r,20));}});
 try{
  for(const asset of ['currency.js','portal-api.js'])w.eval(fs.readFileSync(new URL('../../frontend/public/'+asset,import.meta.url),'utf8'));
  const html=fs.readFileSync(new URL('../../admin.html',import.meta.url),'utf8'),source=html.match(/<script type="text\/babel">([\s\S]*?)<\/script>/)[1];
  await React.act(async()=>w.eval((await transform(source,{loader:'jsx'})).code));await settle();
  const tab=[...w.document.querySelectorAll('button')].find(b=>b.textContent.includes('Manage Doctors'));assert.ok(tab);await React.act(async()=>tab.click());await settle();
  const panel=w.document.querySelector(`[data-doctor-review="${doctorId}"]`);assert.ok(panel,'Fixture doctor is in the real admin directory');
  const approve=[...panel.querySelectorAll('button')].find(b=>b.textContent==='Approve Doctor');assert.ok(approve);await React.act(async()=>approve.click());await settle();
  assert.equal(reviews.length,1);assert.equal(reviews[0].status,200);assert.equal(reviews[0].data.verificationStatus,'Approved');
  const updated=w.document.querySelector(`[data-doctor-review="${doctorId}"]`);assert.ok(updated.closest('tr').textContent.includes('Approved'));assert.ok([...updated.querySelectorAll('button')].some(b=>b.textContent==='Revoke Approval'));
  console.log('PASS: simulated admin DOM click sends a real authenticated approval, refreshes the database-backed directory and displays Approved.');
 }finally{await React.act(async()=>w.testRoot?.unmount());w.close();}
}
