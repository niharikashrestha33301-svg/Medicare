import test from 'node:test';
import assert from 'node:assert/strict';
import { createECDH, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
import { localParts, zonedUTC, addDays } from '../services/medicineTime.js';
import { safeSubscription, sendEmail, pushSetup, emailSetup } from '../services/medicineDelivery.js';
import nodemailer from 'nodemailer';
import webpush from 'web-push';

test('daily schedules preserve local times in half-hour and quarter-hour timezones', () => {
  assert.equal(zonedUTC('2026-10-15','08:00','Asia/Kathmandu').toISOString(), '2026-10-15T02:15:00.000Z');
  assert.equal(zonedUTC('2026-10-15','08:00','Asia/Kolkata').toISOString(), '2026-10-15T02:30:00.000Z');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});
test('DST missing times are skipped and repeated clock times resolve to a single occurrence', () => {
  assert.equal(zonedUTC('2026-03-08','02:30','America/New_York'), null);
  const repeated = zonedUTC('2026-11-01','01:30','America/New_York');
  assert.deepEqual(localParts(repeated, 'America/New_York'), { date: '2026-11-01', time: '01:30' });
});
test('push subscriptions reject internal URLs, spoofed hosts, credentials, ports, and invalid keys', () => {
  const crypto = createECDH('prime256v1'); crypto.generateKeys();
  const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/test', keys: { p256dh: crypto.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') } };
  assert.equal(safeSubscription(sub), true);
  for (const endpoint of ['http://localhost:3306','https://127.0.0.1','https://fcm.googleapis.com.attacker.example/token','https://user:pass@fcm.googleapis.com/token','https://fcm.googleapis.com:444/token','https://example.com/token']) assert.equal(safeSubscription({ ...sub, endpoint }), false);
  assert.equal(safeSubscription({ ...sub, keys: { p256dh: 'invalid', auth: 'invalid' } }), false);
});
test('service worker displays generic content, opens only the reminder page, and never caches medical data', async () => {
  const handlers = {}, shown = [], opened = [];
  const self = { location: { origin: 'https://medicare.example', href: 'https://medicare.example/frontend/public/medicine-sw.js' }, addEventListener: (type, handler) => { handlers[type] = handler; }, registration: { showNotification: async (...args) => { shown.push(args); } }, clients: { matchAll: async () => [], openWindow: async url => opened.push(url) } };
  vm.runInNewContext(fs.readFileSync(new URL('../../frontend/public/medicine-sw.js', import.meta.url), 'utf8'), { self, URL });
  assert.equal(handlers.fetch, undefined);
  let pending;
  handlers.push({ data: { json: () => ({ body: 'Private medication details', url: 'https://attacker.example', tag: 'dose-1' }) }, waitUntil: promise => { pending = promise; } });
  await pending;
  assert.equal(shown[0][0], 'MediCare medicine reminder'); assert.ok(!shown[0][1].body.includes('Private medication'));
  handlers.notificationclick({ notification: { close() {}, data: { url: 'https://attacker.example' } }, waitUntil: promise => { pending = promise; } });
  await pending; assert.equal(opened[0], 'https://medicare.example/frontend/public/medicines.html');
});
test('Web Push can construct an encrypted and VAPID-signed reminder without sending it', () => {
  const crypto = createECDH('prime256v1'); crypto.generateKeys();
  const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/unit-test', keys: { p256dh: crypto.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') } };
  const keys = webpush.generateVAPIDKeys();
  const details = webpush.generateRequestDetails(subscription, JSON.stringify({kind:'dose',tag:'test'}), { vapidDetails:{subject:'mailto:test@example.com',publicKey:keys.publicKey,privateKey:keys.privateKey} });
  assert.equal(details.method, 'POST'); assert.ok(details.body.length > 0); assert.ok(details.headers.Authorization);
});

test('simulated worker records display only after success and reports whether site windows exist', async () => {
  for (const state of ['no_windows','visible','hidden','failure']) {
    const handlers={}, calls=[], messages=[];
    const windows=state==='no_windows'?[]:[{visibilityState:state,postMessage:value=>messages.push(value)}];
    const self={location:{href:'https://medicare.example/medicine-sw.js'},addEventListener:(name,fn)=>handlers[name]=fn,
      registration:{showNotification:async()=>{if(state==='failure')throw new Error('blocked');}},clients:{matchAll:async()=>windows}};
    vm.runInNewContext(fs.readFileSync(new URL('../../frontend/public/medicine-sw.js',import.meta.url),'utf8'),{self,URL,AbortController,setTimeout,clearTimeout,fetch:async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return {ok:true};}});
    let pending;handlers.push({data:{json:()=>({receipt:{id:'11111111-1111-1111-1111-111111111111',token:'a'.repeat(64)}})},waitUntil:p=>pending=p});
    if(state==='failure'){await assert.rejects(pending);assert.equal(calls.length,0);continue;}
    await pending;assert.equal(calls.length,1);assert.equal(calls[0].body.clientState,state);assert.equal(calls[0].url,'https://medicare.example/api/medicine-reminders/receipt');
    if(windows.length){assert.equal(messages[0].type,'medicare:medicine-receipt');assert.equal(messages[0].token,undefined);}
  }
});

test('SMTP uses TLS and disables file/URL attachments; missing credentials and mismatched push keys are unavailable', async () => {
  const names=['SMTP_HOST','SMTP_PORT','SMTP_FROM','SMTP_USER','SMTP_PASSWORD','VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY','VAPID_SUBJECT'];
  const saved=Object.fromEntries(names.map(name=>[name,process.env[name]])), original=nodemailer.createTransport;
  let settings, message, closed=false;
  try {
    for(const name of names)delete process.env[name];
    assert.equal(emailSetup().configured,false);assert.equal(pushSetup().configured,false);
    Object.assign(process.env,{SMTP_HOST:'smtp.example.com',SMTP_PORT:'587',SMTP_FROM:'reminders@example.com',SMTP_USER:'user'});
    assert.equal(emailSetup().configured,false);
    process.env.SMTP_PASSWORD='test-only';
    nodemailer.createTransport=value=>{settings=value;return {sendMail:async value=>{message=value;return {accepted:[value.to]};},close:()=>{closed=true;}};};
    await sendEmail('patient@example.com','MediCare reminder','Sign in to review your schedule.','test');
    assert.equal(settings.requireTLS,true);assert.equal(settings.secure,false);assert.equal(message.disableFileAccess,true);assert.equal(message.disableUrlAccess,true);assert.equal(closed,true);
    const a=webpush.generateVAPIDKeys(),b=webpush.generateVAPIDKeys();
    Object.assign(process.env,{VAPID_PUBLIC_KEY:a.publicKey,VAPID_PRIVATE_KEY:b.privateKey,VAPID_SUBJECT:'mailto:test@example.com'});
    assert.equal(pushSetup().configured,false);
  } finally {nodemailer.createTransport=original;for(const name of names){if(saved[name]===undefined)delete process.env[name];else process.env[name]=saved[name];}}
});
