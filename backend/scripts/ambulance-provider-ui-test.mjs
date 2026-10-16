import fs from 'node:fs';
import assert from 'node:assert/strict';
import {JSDOM} from '../../frontend/node_modules/jsdom/lib/api.js';
const root=new URL('../../frontend/public/',import.meta.url);
const w=new JSDOM(fs.readFileSync(new URL('ambulance-provider.html',root),'utf8'),{url:'http://localhost:5000/ambulance-provider.html',runScripts:'outside-only'}).window;
let app=null,vehicles=[],gpsCallback,cleared=false;const calls=[];const settle=()=>new Promise(r=>setTimeout(r,15));
w.MedicareAPI={base:'/api',session:()=>({token:'test-only',user:{role:'patient',name:'Fixture'}}),request:async(path,options={})=>{calls.push([path,options]);const body=options.body?JSON.parse(options.body):{};if(path.endsWith('/account'))return{application:app,vehicles,canReview:false};if(path.endsWith('/drivers')){app={organization:body.organization,status:'Pending'};return{message:'Saved'};}if(path.endsWith('/provider/requests'))return{requests:[]};if(path.endsWith('/vehicles')){vehicles=[{id:'test-vehicle',registration:body.registration,description:body.description,status:'Pending',available:false}];return{message:'Saved'};}return{success:true};}};
Object.defineProperty(w,'isSecureContext',{value:true});Object.defineProperty(w.navigator,'geolocation',{value:{watchPosition(ok){gpsCallback=ok;return 7;},clearWatch(){cleared=true;}}});
try{
 w.eval(fs.readFileSync(new URL('care-page.js',root),'utf8'));w.eval(fs.readFileSync(new URL('ambulance-provider.js',root),'utf8'));await settle();
 const $=id=>w.document.getElementById(id);const submit=id=>$(id).dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 for(const [name,value] of Object.entries({organization:'Test provider',licenseReference:'Fixture only',phone:'+919876543210'}))$('application').elements.namedItem(name).value=value;
 submit('application');await settle();assert.ok($('application-status').textContent.includes('Pending'));assert.equal($('fleet-section').hidden,true);
 app.status='Approved';$('refresh').click();await settle();assert.equal($('fleet-section').hidden,false);
 $('vehicle-form').elements.namedItem('registration').value='TEST-ONLY';$('vehicle-form').elements.namedItem('description').value='Fixture only';submit('vehicle-form');await settle();assert.equal(w.document.querySelector('[data-gps]'),null);
 vehicles[0].status='Approved';$('refresh').click();await settle();w.document.querySelector('[data-gps]').click();await settle();assert.equal(calls.some(([p])=>p.endsWith('/location')),false);
 gpsCallback({timestamp:Date.now(),coords:{latitude:12,longitude:77,accuracy:15}});await settle();assert.ok(calls.some(([p,o])=>p.endsWith('/location')&&o.method==='PUT'&&JSON.parse(o.body).shareLocation));
 w.document.querySelector('[data-availability]').click();await settle();assert.ok(calls.some(([p,o])=>p.endsWith('/availability')&&JSON.parse(o.body).available===true));
 w.document.querySelector('[data-stop]').click();await settle();assert.equal(cleared,true);assert.ok(calls.some(([p,o])=>p.endsWith('/location')&&o.method==='DELETE'));
 console.log('PASS: provider UI application, approval visibility, vehicle registration, permission-gated GPS controls, availability and stop-sharing buttons. API and GPS are simulated in this UI test; real database workflow is tested separately.');
}finally{w.close();}
