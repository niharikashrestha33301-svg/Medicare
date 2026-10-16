import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {validSignature,iceConfiguration} from '../services/careSecurity.js';
import {gateway} from '../services/pharmacyPayments.js';
test('payment signatures bind the exact body and reject missing, altered or malformed signatures',()=>{
  const body='{"event":"payment.captured"}',secret='unit-only-secret',signature=createHmac('sha256',secret).update(body).digest('hex');
  assert.equal(validSignature(Buffer.from(body),signature,secret),true);assert.equal(validSignature(body+' ',signature,secret),false);assert.equal(validSignature(body,signature,undefined),false);assert.equal(validSignature(body,'not-hex',secret),false);
});

test('direct calls get STUN discovery, with explicit opt-out and URL validation',()=>{
  const names=['WEBRTC_TURN_URLS','WEBRTC_TURN_SECRET','WEBRTC_STUN_URLS'],saved=Object.fromEntries(names.map(n=>[n,process.env[n]]));
  try{
    for(const name of names)delete process.env[name];
    const configuration=iceConfiguration(1);assert.equal(configuration.relayConfigured,false);assert.equal(configuration.iceTransportPolicy,'all');assert.deepEqual(configuration.iceServers,[{urls:['stun:stun.l.google.com:19302']}]);
    process.env.WEBRTC_STUN_URLS='';assert.deepEqual(iceConfiguration(1).iceServers,[]);
    process.env.WEBRTC_STUN_URLS='https://untrusted.example';assert.throws(()=>iceConfiguration(1),/incorrectly configured/);
  }finally{for(const n of names){if(saved[n]===undefined)delete process.env[n];else process.env[n]=saved[n];}}
});
test('TURN uses expiring per-user credentials and relays media when configured; payment requests stay server-side',async()=>{
  const names=['WEBRTC_TURN_URLS','WEBRTC_TURN_SECRET','RAZORPAY_KEY_ID','RAZORPAY_KEY_SECRET','RAZORPAY_WEBHOOK_SECRET'];
  const saved=Object.fromEntries(names.map(n=>[n,process.env[n]])),original=globalThis.fetch;
  try{
    delete process.env.WEBRTC_TURN_URLS;delete process.env.WEBRTC_TURN_SECRET;assert.equal(iceConfiguration(1).relayConfigured,false);
    process.env.WEBRTC_TURN_URLS='turns:relay.example.com:5349';process.env.WEBRTC_TURN_SECRET='unit-only';
    const config=iceConfiguration(17),server=config.iceServers[0];assert.equal(config.iceTransportPolicy,'relay');assert.ok(server.username.endsWith(':17'));assert.equal(server.credential,createHmac('sha1','unit-only').update(server.username).digest('base64'));assert.ok(Number(server.username.split(':')[0])>Date.now()/1000);
    Object.assign(process.env,{RAZORPAY_KEY_ID:'rzp_test_unit',RAZORPAY_KEY_SECRET:'unit-secret',RAZORPAY_WEBHOOK_SECRET:'unit-webhook'});
    let called=false;globalThis.fetch=async(url,options)=>{called=true;assert.equal(url,'https://api.razorpay.com/v1/orders');assert.equal(options.method,'POST');assert.equal(options.headers.Authorization,'Basic '+Buffer.from('rzp_test_unit:unit-secret').toString('base64'));assert.equal(JSON.parse(options.body).currency,'INR');return {ok:true,json:async()=>({id:'unit-order'})};};
    assert.equal((await gateway('orders','POST',{amount:10000,currency:'INR',receipt:'unit'})).id,'unit-order');assert.equal(called,true);
  }finally{globalThis.fetch=original;for(const n of names){if(saved[n]===undefined)delete process.env[n];else process.env[n]=saved[n];}}
});
