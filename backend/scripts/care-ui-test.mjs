import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from '../../frontend/node_modules/jsdom/lib/api.js';
const root=new URL('../../frontend/public/',import.meta.url);
const settle=async()=>{for(let n=0;n<12;n++)await new Promise(r=>setTimeout(r,0));};
function page(name){const w=new JSDOM(fs.readFileSync(new URL(name+'.html',root),'utf8'),{url:'http://localhost:5000/'+name+'.html',runScripts:'outside-only'}).window;
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  return w;
}
function script(w,name){w.eval(fs.readFileSync(new URL(name+'.js',root),'utf8'));}
function submit(w,id){w.document.getElementById(id).dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));}
{
  const w=page('pharmacy'),$=id=>w.document.getElementById(id),calls=[];let session=null,quantity=0,ordered=false;
  const product={id:1,sku:'REAL-API',name:'<script>Medicine</script>',category:'Category',description:'Saved medicine details',manufacturer:'Pharmacy',pack_size:'Pack',price_paise:12450,stock:4,requires_prescription:true};
  w.MedicareAPI={session:()=>session,authenticate:async()=>{session={token:'test',user:{role:'patient',name:'Patient'}};},request:async(path,options)=>{
    calls.push({path,options});const b=JSON.parse(options?.body||'{}');
    if(path.startsWith('/pharmacy/catalogue'))return {success:true,products:[product],categories:['Category'],services:{ordering:true,cod:true,onlinePayments:false,message:'Real catalogue'}};
    if(path==='/pharmacy/account')return {success:true,role:'patient',canReview:false};
    if(path==='/pharmacy/cart')return {success:true,items:quantity?[{...product,quantity}]:[]};
    if(path.startsWith('/pharmacy/cart/')){quantity=b.quantity;return {success:true};}
    if(path==='/pharmacy/orders'&&options?.method==='POST'){ordered=true;quantity=0;return {success:true,id:'order'};}
    if(path==='/pharmacy/orders')return {success:true,orders:ordered?[{id:'12345678-1111-1111-1111-111111111111',status:'Awaiting review',total_paise:12450,payment_method:'COD',payment_status:'Unpaid',review_status:'Pending',created_at:new Date().toISOString(),items:[{name:product.name,quantity:1}],events:[],address:'Private address',phone:'123'}]:[]};
    if(path==='/health-dashboard')return {success:true,documents:[{id:2,filename:'Prescription.pdf'}]};
    return {success:true};
  }};
  try{script(w,'care-page');script(w,'pharmacy-catalogue');script(w,'pharmacy');await settle();assert.equal($('account').hidden,true);assert.equal(w.document.querySelectorAll('#catalogue script').length,0);assert.ok($('catalogue').textContent.includes('₹124.50'));
    w.document.querySelector('[data-details]').click();assert.equal($('details').open,true);assert.ok($('details-body').textContent.includes('Saved medicine details'));$('close-details').click();
    submit(w,'login');await settle();assert.equal($('account').hidden,false,'Shared sign-in opens authenticated tools');
    w.document.querySelector('[data-add]').click();await settle();assert.equal($('cart-count').textContent,'1');
    w.document.querySelector('[data-quantity][data-value="2"]').click();await settle();assert.equal($('cart-count').textContent,'2');assert.ok($('cart-total').textContent.includes('249.00'));
    w.document.querySelector('[data-quantity][data-value="1"]').click();await settle();assert.equal($('cart-count').textContent,'1');
    w.document.querySelector('[data-quantity][data-value="0"]').click();await settle();assert.equal($('cart-count').textContent,'0');
    w.document.querySelector('[data-add]').click();await settle();assert.equal($('cart-count').textContent,'1');
    const form=$('checkout');form.elements.namedItem('address').value='Private address';form.elements.namedItem('phone').value='123';form.elements.namedItem('documentId').value='2';submit(w,'checkout');await settle();assert.equal(ordered,true);assert.ok($('orders').textContent.includes('Awaiting review'));assert.ok(calls.some(c=>c.path==='/pharmacy/orders'&&JSON.parse(c.options?.body||'{}').documentId==='2'));
    session=null;$('signout').click();await settle();assert.equal($('account').hidden,true);assert.equal($('orders').textContent,'');assert.equal(form.elements.namedItem('address').value,'');
  }finally{w.close();}
}
{
  const w=page('consultations'),$=id=>w.document.getElementById(id),calls=[],constraints=[],tracks=[{kind:'audio',enabled:true,stop(){this.stopped=true;}},{kind:'video',enabled:true,stop(){this.stopped=true;}}];let session=null,admitted=false,roomGeneration=1,peer,permissionFailure=false;
  const room={id:'11111111-1111-1111-1111-111111111111',appointmentId:1,status:'Waiting',generation:roomGeneration,admitted:false,patientPresent:true,doctorPresent:true,doctorName:'Doctor',patientName:'Patient'};
  const configuration={iceServers:[],iceTransportPolicy:'all',appointmentTimezone:'Asia/Kathmandu',message:'TURN unconfigured; real calling unverified.'};
  Object.defineProperty(w,'isSecureContext',{value:true});const stream={getTracks:()=>tracks,getAudioTracks:()=>[tracks[0]],getVideoTracks:()=>[tracks[1]]};Object.defineProperty(w.navigator,'mediaDevices',{value:{getUserMedia:async value=>{constraints.push(value);if(permissionFailure)throw Object.assign(new Error('Denied'),{name:'NotAllowedError'});return value.video?stream:{...stream,getTracks:()=>[tracks[0]],getVideoTracks:()=>[]};}}});
  w.HTMLMediaElement.prototype.play=async()=>{};
  w.MediaStream=class{constructor(tracks=[]){this.tracks=[...tracks];}getTracks(){return this.tracks;}addTrack(track){this.tracks.push(track);}};
  w.RTCPeerConnection=class{constructor(){peer=this;this.connectionState='new';}addTrack(){}close(){this.closed=true;}async setRemoteDescription(d){this.remoteDescription=d;}async setLocalDescription(d){this.localDescription=d;}async createAnswer(){return {type:'answer',sdp:'simulated-answer'};}async addIceCandidate(){}};
  w.MedicareAPI={session:()=>session,authenticate:async()=>{session={token:'test',user:{role:'patient',name:'Patient'}};},request:async(path,options)=>{
    calls.push({path,options});
    if(path==='/consultations'&&options?.method==='POST')return {success:true,id:room.id};
    if(path==='/consultations')return {success:true,rooms:[room],configuration};
    if(path==='/appointments/my')return {success:true,appointments:[{id:1,doctorName:'Doctor',status:'Confirmed',date:'2026-10-15',timeSlot:'09:00 AM',specialization:'General Physician'}]};
    if(path==='/doctors')return {success:true,doctors:[{id:5,name:'Saved doctor',specialization:'General',verified:true,availableSlots:['09:00 AM','10:00 AM'],consultationFee:123},{id:6,name:'Original unverified doctor',specialization:'General',verified:false,availableSlots:['09:00 AM'],consultationFee:123}]};
    if(path.startsWith('/consultations/availability/'))return {success:true,timezone:'Asia/Kathmandu',slots:[{time:'09:00 AM',available:false,reason:'Already booked'},{time:'10:00 AM',available:true,reason:''}]};
    if(path==='/consultations/book')return {success:true,appointmentId:2,appointmentCode:'Saved-appointment',roomId:room.id};
    if(path.endsWith('/join'))return {success:true,room,configuration};
    if(path.includes('/poll?'))return {success:true,room:{...room,admitted,generation:roomGeneration},signals:admitted?[{id:1,payload:{type:'offer',sdp:'simulated-offer'}}]:[]};
    return {success:true};
  }};
  try{script(w,'care-page');script(w,'consultations');await settle();submit(w,'login');await settle();assert.equal($('account').hidden,false);
    assert.equal($('doctors').querySelector('option[value="6"]').disabled,true,'Original doctors stay visible without bypassing verification');$('doctors').value='5';$('doctors').dispatchEvent(new w.Event('change'));await settle();assert.equal($('slots').querySelector('option[value="09:00 AM"]').disabled,true);assert.equal($('book-consultation').disabled,false);$('slots').value='10:00 AM';$('schedule').elements.namedItem('patientPhone').value='0000000000';submit(w,'schedule');await settle();assert.ok(calls.some(c=>c.path==='/consultations/book'));assert.ok($('notice').textContent.includes('booked'));
    w.document.querySelector('[data-join]').click();await settle();assert.equal($('call').hidden,false);assert.ok($('waiting').textContent.includes('Waiting for your doctor'));assert.equal(peer,undefined,'No remote media peer before admission');const roomLink=w.document.querySelector('a.button[href*="room="]');assert.equal(new URL(roomLink.href).searchParams.get('room'),room.id);w.document.querySelector('[data-copy]').click();await settle();assert.ok($('notice').textContent.includes(room.id),'Copy fallback exposes the valid private link without a token');
    admitted=true;roomGeneration++;await new Promise(r=>setTimeout(r,2100));await settle();assert.ok(peer);assert.ok(calls.some(c=>c.path.endsWith('/signal')&&JSON.parse(c.options.body).payload.type==='answer'));
    assert.notEqual($('call-state').textContent,'Connected','Preview/negotiation does not claim connected');
    peer.connectionState='connected';peer.onconnectionstatechange();assert.equal($('call-state').textContent,'Connected');
    peer.ontrack({track:{id:'remote-audio',kind:'audio'},streams:[]});peer.ontrack({track:{id:'remote-video',kind:'video'},streams:[]});assert.equal($('remote').srcObject.getTracks().length,2,'Streamless audio and video tracks must coexist');
    $('mic').click();assert.equal(tracks[0].enabled,false);$('camera').click();assert.equal(tracks[1].enabled,false);
    $('leave').click();await settle();assert.ok(tracks.every(t=>t.stopped));assert.equal(peer.closed,true);assert.equal($('call').hidden,true);
    w.document.querySelector('[data-audio]').click();await settle();assert.equal(constraints.at(-1).video,false,'Audio only must not request a camera');assert.equal($('camera').disabled,true);
    const realNow=w.Date.now;w.Date.now=()=>realNow()+46000;await new Promise(r=>setTimeout(r,2100));await settle();w.Date.now=realNow;assert.equal($('call').hidden,true,'Media stops if room authorization cannot be renewed');assert.ok($('notice').textContent.includes('authorization'));
    permissionFailure=true;w.document.querySelector('[data-join]').click();await settle();assert.ok($('notice').textContent.includes('permission was denied'));assert.equal($('call').hidden,true);
    w.document.querySelector('[data-cancel]').click();await settle();assert.ok(calls.some(c=>c.path==='/appointments/1/cancel'&&c.options.method==='PUT'));
    session=null;$('signout').click();await settle();assert.equal($('account').hidden,true);assert.equal($('history').textContent,'');
  }finally{w.close();}
}
{
  const w=page('consultations'),$=id=>w.document.getElementById(id),calls=[];let session=null,admitted=false,gen=1,peer,completed=false;
  const track={kind:'audio',enabled:true,stop(){this.stopped=true;}},stream={getTracks:()=>[track],getAudioTracks:()=>[track],getVideoTracks:()=>[]};
  const room={id:'11111111-1111-1111-1111-111111111111',appointmentId:1,status:'Waiting',generation:gen,admitted:false,patientPresent:true,doctorPresent:true,doctorName:'Doctor',patientName:'Patient'};
  const configuration={iceServers:[],iceTransportPolicy:'all',appointmentTimezone:'Asia/Kathmandu',message:'Unconfigured relay'};
  Object.defineProperty(w,'isSecureContext',{value:true});Object.defineProperty(w.navigator,'mediaDevices',{value:{getUserMedia:async c=>{assert.equal(c.video,false);return stream;}}});
  w.HTMLMediaElement.prototype.play=async()=>{};
  w.RTCPeerConnection=class{constructor(){peer=this;}addTrack(){}close(){this.closed=true;}async createOffer(){return {type:'offer',sdp:'doctor-offer'};}async setLocalDescription(d){this.localDescription=d;}async setRemoteDescription(d){this.remoteDescription=d;}async addIceCandidate(){}};
  w.MedicareAPI={session:()=>session,authenticate:async()=>{session={token:'doctor-token',user:{role:'doctor',name:'Doctor'}};},request:async(path,options)=>{
    calls.push({path,options});
    if(path==='/consultations'&&options?.method==='POST')return {success:true,id:room.id};
    if(path==='/consultations')return {success:true,rooms:[room],configuration};
    if(path==='/appointments/my')return {success:true,appointments:[{id:1,patientName:'Patient',status:completed?'Completed':'Confirmed',date:'2026-10-15',timeSlot:'09:00 AM'}]};
    if(path.endsWith('/join'))return {success:true,room,configuration};
    if(path==='/appointments/1/status'){completed=true;return {success:true};}
    if(path.endsWith('/admit')){admitted=true;gen++;return {success:true};}
    if(path.includes('/poll?'))return {success:true,room:{...room,admitted,generation:gen},signals:[]};
    return {success:true};
  }};
  try{script(w,'care-page');script(w,'consultations');submit(w,'login');await settle();assert.equal($('schedule-card').hidden,true);w.document.querySelector('[data-audio]').click();await settle();assert.equal($('admit').hidden,false);$('admit').click();await settle();assert.ok(peer);assert.ok(calls.some(c=>c.path.endsWith('/signal')&&JSON.parse(c.options.body).payload.type==='offer'));$('end').click();await settle();assert.ok(calls.some(c=>c.path.endsWith('/leave')&&JSON.parse(c.options.body).end===true));assert.equal(track.stopped,true);assert.equal(peer.closed,true);w.document.querySelector('[data-complete]').click();await settle();assert.equal(completed,true);assert.equal(w.document.querySelector('[data-join]'),null);assert.ok($('notice').textContent.includes('Appointment completed'));}finally{w.close();}
}
console.log('PASS: simulated patient/doctor sign-in, catalogue/cart, date-specific availability, booking/cancellation, private links, video/audio-only permission handling, admission, doctor offer/patient answer, actual-state-gated connection labels, controls and cleanup. Browser/media APIs were mocked; no real call was verified.');
