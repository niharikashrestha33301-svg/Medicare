import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from '../../frontend/node_modules/jsdom/lib/api.js';

const root = new URL('../../frontend/public/', import.meta.url);
const w = new JSDOM(fs.readFileSync(new URL('medicines.html', root), 'utf8'), { url: 'http://localhost:5000/medicines.html', runScripts: 'outside-only' }).window;
const $ = id => w.document.getElementById(id);
w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
w.HTMLDialogElement.prototype.close = function () { this.open = false; };
const timezone = w.Intl.DateTimeFormat().resolvedOptions().timeZone;
const day = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
let session = null, permissions = 0, registrations = 0, pushEnabled = false, permission = 'denied', subscription = null;
const calls = [];
Object.defineProperty(w,'isSecureContext',{value:true});
w.Notification = { permission: 'default', requestPermission: async () => { permissions++; w.Notification.permission=permission; return permission; } };
w.PushManager = function () {};
const sub = { endpoint:'https://fcm.googleapis.com/fcm/send/ui-test', toJSON() { return { endpoint:this.endpoint, keys:{} }; }, unsubscribe: async () => { subscription = null; } };
const registration = { active: {state:'activated'}, pushManager: { getSubscription: async () => subscription, subscribe: async () => { subscription = sub; return sub; } } };
Object.defineProperty(w.navigator,'serviceWorker',{value:{ getRegistration:async()=>registrations ? registration : undefined, register:async()=>{registrations++; return registration;}, ready:Promise.resolve(registration) }});
const data = { success:true, user:{id:123,name:'Test Patient'}, plans:[], events:[], prescriptions:[{id:4,title:'Saved prescription',dosage:'Prescribed instructions'}], deliveries:[], adherence:{taken:0,scheduled:0,percentage:null}, notifications:{pushConfigured:true,publicKey:'B'+'A'.repeat(86),emailConfigured:false,emailEnabled:false,emailVerified:false,devices:0,worker:{lastRun:new Date().toISOString()}} };
w.MedicareAPI = { session:()=>session, authenticate:async()=>{session={token:'test',user:{id:123,role:'patient'}};}, request:async(path,options)=>{
  calls.push({path,options}); const body=options?.body ? JSON.parse(options.body) : {};
  if(path.endsWith('/push/status')) return {success:true,enabled:pushEnabled};
  if(path.endsWith('/push/test')) return {success:true,message:'Test scheduled; background delivery unverified.'};
  if(path.endsWith('/push') && options?.method==='POST') pushEnabled=true;
  if(path.endsWith('/push') && options?.method==='DELETE') pushEnabled=false;
  if(path.endsWith('/plans') && options?.method==='POST') {
    data.plans.push({id:10,name:body.name,dosage:body.dosage,instructions:body.instructions,timings:body.timings,timezone:body.timezone,start_date:body.startDate,end_date:body.endDate,stock:+body.stock,units_per_dose:+body.unitsPerDose,refill_at:+body.refillAt,prescription_id:+body.prescriptionId,active:body.active});
    data.events.push({id:11,plan_id:10,name:body.name,dosage:body.dosage,status:'Pending',local_date:day,local_time:'08:00',due_at:new Date(Date.now()-60000).toISOString()});
  }
  if(path.includes('/events/')) { data.events[0].status=body.status; data.adherence={taken:body.status==='Taken'?1:0,scheduled:1,percentage:body.status==='Taken'?100:0}; }
  if(path.endsWith('/refill')) data.plans[0].stock+=body.amount;
  return structuredClone(data);
}};
const settle=async()=>{for(let i=0;i<7;i++) await new Promise(resolve=>setTimeout(resolve,0));};
const submit=id=>$(id).dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
try {
  w.eval(fs.readFileSync(new URL('medicines.js',root),'utf8')); await settle();
  assert.equal($('auth').hidden,false); assert.equal(permissions,0); assert.equal(registrations,0);
  submit('login'); await settle(); assert.equal($('app').hidden,false); assert.ok($('dose-list').textContent.includes('No scheduled doses'));
  $('add-medicine').click(); const form=$('plan-form');
  form.elements.namedItem('name').value='<script>Test medicine</script>'; form.elements.namedItem('dosage').value='Exactly as prescribed'; form.elements.namedItem('prescriptionId').value='4'; form.elements.namedItem('stock').value='2';
  submit('plan-form'); await settle(); assert.equal($('editor').open,false);
  assert.equal(w.document.querySelectorAll('#plan-list script').length,0); assert.ok($('plan-list').textContent.includes('Exactly as prescribed'));
  assert.ok($('plan-list').textContent.includes('Saved prescription'));
  w.document.querySelector('[data-edit="10"]').click(); assert.equal(form.elements.namedItem('dosage').readOnly,true);
  $('dose-confirm').checked=true; $('dose-confirm').dispatchEvent(new w.Event('change')); assert.equal(form.elements.namedItem('dosage').readOnly,false);
  $('close-editor').click();
  w.document.querySelector('[data-status="Taken"]').click(); await settle(); assert.ok($('adherence-chart').textContent.includes('100%'));
  w.document.querySelector('[data-refill="10"]').click(); $('refill-form').elements.namedItem('amount').value='6'; submit('refill-form'); await settle(); assert.ok($('plan-list').textContent.includes('8 supply units'));
  assert.equal($('email-toggle').disabled,false); $('email-toggle').click(); await settle(); assert.equal($('notification-setup').open,true);
  $('enable-push').click(); await settle(); assert.equal(permissions,1); assert.equal(registrations,0); assert.ok($('notice').textContent.includes('not granted'));
  $('enable-push').click(); await settle(); assert.equal(permissions,1,'Blocked permission opens instructions without another prompt');
  w.Notification.permission='default'; permission='granted'; $('enable-push').click(); await settle(); assert.equal(registrations,1); assert.equal(pushEnabled,true); assert.equal($('disable-push').hidden,false);
  assert.equal($('schedule-test-push').hidden,false); $('schedule-test-push').click(); await settle();
  assert.ok(calls.some(c=>c.path.endsWith('/push/test')&&JSON.parse(c.options.body).delaySeconds===60));
  assert.ok($('background-status').textContent.includes('not been verified'));
  $('disable-push').click(); await settle(); assert.equal(pushEnabled,false); assert.equal(subscription,null);
  $('signout').click(); session=null; assert.equal($('app').hidden,true);
  assert.ok(calls.some(c=>c.path.includes('/events/11')&&JSON.parse(c.options.body).status==='Taken'));
  console.log('PASS: patient sign-in gate, empty calendar, prescription-linked schedule creation, dosage-edit confirmation, safe rendering, dose tracking/adherence, refill form, unavailable email, explicit notification permission, push enable/disable, and sign-out.');
} finally {w.close();}
