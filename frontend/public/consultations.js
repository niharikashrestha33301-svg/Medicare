(() => {
  'use strict';
  const {$,api,esc,notice,json,gate,empty,money}=Care;
  let doctors=[],rooms=[],current=null,stream=null,pc=null,timer=null,polling=false,generation=-1,cursor=0,pendingCandidates=[],signalQueue=Promise.resolve(),disposed=0,mediaReady=false,loading=false,joining=false,joinTicket=0,availabilityRequest=0,loadAgain=false,lastAuthorizedPoll=0;
  const showNotice=(text,error=false)=>{notice(text,error);$('notice').scrollIntoView?.({block:'nearest'});};
  const roomURL=id=>{const url=new URL(location.href);url.search='';url.hash='';url.searchParams.set('room',id);return url.href;};
  const request=(path='',options)=>api.request('/consultations'+path,options);
  const role=()=>api.session()?.user.role;
  function stopPeer(){if(pc){pc.onicecandidate=null;pc.onconnectionstatechange=null;pc.close();pc=null;}$('remote').srcObject=null;pendingCandidates=[];}
  function stopLocal(){disposed++;joinTicket++;joining=false;clearInterval(timer);timer=null;current=null;mediaReady=false;stopPeer();stream?.getTracks().forEach(t=>t.stop());stream=null;$('local').srcObject=null;$('call').hidden=true;}
  async function leave(end=false){const old=current,token=api.session()?.token;stopLocal();if(old&&token)try{await request('/'+old.id+'/leave',json('POST',{clientId:old.clientId,end}));}catch(error){notice(error.message,true);}await load();}
  window.addEventListener('care-leave',stopLocal);
  window.addEventListener('pagehide',()=>{const old=current;if(old){fetch(api.base+'/consultations/'+old.id+'/leave',{method:'POST',keepalive:true,headers:{'Content-Type':'application/json',Authorization:'Bearer '+api.session()?.token},body:JSON.stringify({clientId:old.clientId})}).catch(()=>{});}stopLocal();});
  async function load(){
    if(!gate(['patient','doctor'])){stopLocal();$('appointments').textContent='';$('history').textContent='';doctors=[];$('doctors').innerHTML='';$('slots').innerHTML='';return;}
    if(loading){loadAgain=true;return;}loading=true;const token=api.session()?.token;
    $('refresh').disabled=true;$('refresh').textContent='Loading appointments…';$('appointments').setAttribute('aria-busy','true');
    if(!$('appointments').textContent)$('appointments').textContent='Loading your saved appointments…';
    try{
      const results=await Promise.allSettled([request(),api.request('/appointments/my'),role()==='patient'?api.request('/doctors'):Promise.resolve({doctors:[]})]);if(token!==api.session()?.token)return;
      const [roomResult,appointmentResult,doctorResult]=results;
      if(roomResult.status==='fulfilled'){const data=roomResult.value;rooms=data.rooms;$('setup').textContent=data.configuration.message+' '+(data.configuration.storage?.message||'');$('booking-zone').textContent=data.configuration.appointmentTimezone;try{$('appointment-date').min=new Intl.DateTimeFormat('en-CA',{timeZone:data.configuration.appointmentTimezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}catch{}}
      else{$('setup').textContent='Consultation room setup needs attention: '+roomResult.reason.message;rooms=[];}
      $('schedule-card').hidden=role()!=='patient';
      if(appointmentResult.status==='rejected'){$('appointments').innerHTML=empty(appointmentResult.reason.message);throw appointmentResult.reason;}
      const appointments=appointmentResult.value;
      $('appointments').innerHTML=appointments.appointments.map(a=>{
        const room=rooms.find(r=>r.appointmentId===a.id);
        const active=['Pending','Confirmed'].includes(a.status)&&room?.status!=='Ended';
        const reason=room?.status==='Ended'?'The doctor has ended this consultation.':a.joinReason||'';
        return `<article class="list-row" data-appointment="${a.id}"><div class="row"><div><h3>${esc(role()==='doctor'?a.patientName:a.doctorName)}</h3><p>${esc(a.date)} · ${esc(a.timeSlot)}${a.timezone?' · '+esc(a.timezone):''}</p><small>${esc(a.specialization)} · ${esc(a.status)}</small>${reason?'<p class="muted">'+esc(reason)+'</p>':''}</div><div class="actions">${active?`<button class="primary" ${a.canJoin===false?'disabled':''} title="${esc(reason)}" data-join="${a.id}">${room?'Join room':'Create & join room'}</button><button ${a.canJoin===false?'disabled':''} title="${esc(reason)}" data-audio="${a.id}">Audio only</button>`:''}${active&&role()==='patient'?`<button data-cancel="${a.id}">Cancel appointment</button>`:''}${role()==='doctor'&&['Pending','Confirmed'].includes(a.status)?`<button data-complete="${a.id}">Complete appointment</button>`:''}${room?`<button data-copy="${room.id}">Copy room link</button><a class="button" href="${esc(roomURL(room.id))}">Open room link</a>`:''}</div></div><p id="appointment-message-${a.id}" class="muted" role="status" aria-live="polite"></p></article>`;
      }).join('')||empty('No saved appointments. Book a visit to create a private room.');
      $('history').innerHTML=rooms.map(r=>`<div class="list-row"><strong>${esc(role()==='doctor'?r.patientName:r.doctorName)}</strong><p>${esc(r.date)} · ${esc(r.time)} · ${esc(r.status)}</p><small>${r.startedAt?'Doctor admitted patient: '+esc(new Date(r.startedAt).toLocaleString()):'Not admitted yet'}${r.endedAt?' · Room ended: '+esc(new Date(r.endedAt).toLocaleString()):''}</small></div>`).join('')||empty('No consultation rooms yet.');
      if(role()==='patient'){
        const selected=$('doctors').value;
        if(doctorResult.status==='fulfilled'){doctors=doctorResult.value.doctors;$('doctors').innerHTML='<option value="">Choose your doctor</option>'+doctors.map(d=>`<option value="${d.id}" ${!d.verified||!d.availableSlots?.length?'disabled':''}>${esc(d.name)} · ${esc(d.specialization)}${!d.verified?' - Booking unavailable':!d.availableSlots?.length?' - No published times':''}</option>`).join('');$('doctors').value=selected;if(!doctors.some(d=>d.verified&&d.availableSlots?.length))$('fee').textContent='No verified doctors have published appointment slots. Ask the clinic to publish availability.';}
        else{$('fee').textContent='Doctor directory unavailable: '+doctorResult.reason.message;}
        await availability();
      }
      const linked=new URL(location.href).searchParams.get('room');
      if(linked&&!current){const target=rooms.find(r=>r.id===linked);$('linked-room').hidden=false;$('linked-room').textContent=target?'Room link verified for '+(role()==='doctor'?target.patientName:target.doctorName)+'. Use Join room or Audio only below. Joining never starts automatically.':'This room link is unavailable to this account. Sign in as the booked patient or assigned doctor, then refresh.';if(target)document.querySelector('[data-appointment="'+target.appointmentId+'"]')?.scrollIntoView?.({block:'nearest'});}
    }catch(error){if(token===api.session()?.token){showNotice(error.message,true);if([401,403].includes(error.status)){stopLocal();$('account').hidden=true;$('auth').hidden=false;}}}finally{loading=false;$('refresh').disabled=false;$('refresh').textContent='Refresh appointments';$('appointments').setAttribute('aria-busy','false');if(loadAgain){loadAgain=false;load();}}
  }
  async function availability(){
    const ticket=++availabilityRequest,doctor=doctors.find(d=>String(d.id)===$('doctors').value),day=$('appointment-date').value;
    $('slots').innerHTML='<option value="">'+(!doctor?'Choose a doctor first':!day?'Choose an appointment date':'Checking available times…')+'</option>';
    $('book-consultation').disabled=true;
    if(doctor)$('fee').textContent=money(Math.round(Number(doctor.consultationFee)*100))+' consultation fee';
    if(!doctor){$('availability-note').textContent='Choose a verified doctor and date to see bookable times.';return;}
    if(!doctor.verified||!doctor.availableSlots?.length){$('availability-note').textContent='This doctor is not currently accepting bookings. Choose another doctor or contact the clinic.';return;}
    if(!doctor||!day)return;
    try{const data=await request('/availability/'+encodeURIComponent(doctor.id)+'?date='+encodeURIComponent(day));if(ticket!==availabilityRequest)return;const available=data.slots.filter(s=>s.available);$('slots').innerHTML='<option value="">'+(available.length?'Choose an available time':'No available times on this date')+'</option>'+data.slots.map(s=>`<option value="${esc(s.time)}" ${s.available?'':'disabled'}>${esc(s.time)}${s.reason?' · '+esc(s.reason):''}</option>`).join('');$('availability-note').textContent=available.length?'Available times in '+data.timezone+'. Booked slots cannot be selected.':'No open slots. Choose another date or doctor.';$('book-consultation').disabled=!available.length;}
    catch(error){if(ticket!==availabilityRequest)return;$('availability-note').textContent=error.message;$('slots').innerHTML='<option value="">Availability unavailable — refresh to retry</option>';}
  }
  $('doctors').onchange=availability;$('appointment-date').onchange=availability;
  const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());$('appointment-date').min=day;$('appointment-date').value=day;
  $('schedule').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget,button=$('book-consultation');button.disabled=true;button.textContent='Saving your appointment…';try{const body=Object.fromEntries(new FormData(form));const booked=await request('/book',json('POST',body));showNotice('Appointment '+booked.appointmentCode+' booked. A private room was saved with the appointment; use its room link below.');await load();}catch(error){showNotice(error.message,true);if(error.status===409)await availability();}finally{button.disabled=![...$('slots').options].some(option=>option.value&&!option.disabled);button.textContent='Book video consultation';}};
  async function join(appointmentId,audioOnly){
    if(current)throw new Error('Leave your current room before joining another.');
    if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia||!window.RTCPeerConnection)throw new Error('Calls need HTTPS (or localhost), a supported browser, and camera/microphone permission.');
    const token=api.session()?.token,attempt=++disposed;
    const data=await request('',json('POST',{appointmentId})),clientId=crypto.randomUUID();
    const joined=await request('/'+data.id+'/join',json('POST',{clientId}));
    if(attempt!==disposed||token!==api.session()?.token)return;
    current={id:data.id,clientId,audioOnly,configuration:joined.configuration};generation=-1;cursor=0;signalQueue=Promise.resolve();$('call').hidden=false;$('room-title').textContent=(audioOnly?'Private voice consultation · ':'Private video consultation · ')+(role()==='doctor'?joined.room.patientName:joined.room.doctorName);$('call-state').textContent='Requesting device permission';
    lastAuthorizedPoll=Date.now();
    $('call').scrollIntoView?.({block:'start'});$('waiting').textContent=audioOnly?'Allow microphone access to join your voice consultation. The camera will not be requested.':'Allow microphone and camera access to join. Choose Audio only if no camera is available.';
    $('mic').disabled=true;$('camera').disabled=true;$('admit').hidden=true;$('end').hidden=role()!=='doctor';
    // Heartbeat while the permission dialog is open; never mark preview as connected.
    timer=setInterval(poll,2000);poll();
    try{
      let permissionTimer,expired=false;
      const media=navigator.mediaDevices.getUserMedia({audio:true,video:audioOnly?false:{width:{ideal:1280},height:{ideal:720}}});
      media.then(value=>{if(expired||attempt!==disposed||token!==api.session()?.token)value.getTracks().forEach(t=>t.stop());}).catch(()=>{});
      let acquired;
      try{acquired=await Promise.race([media,new Promise((resolve,reject)=>{permissionTimer=setTimeout(()=>{expired=true;reject(new Error('Device permission is still pending. Close or answer the browser permission prompt, then join again.'));},45000);})]);}finally{clearTimeout(permissionTimer);}
      if(attempt!==disposed||token!==api.session()?.token){acquired.getTracks().forEach(t=>t.stop());return;}
      stream=acquired;mediaReady=true;$('local').srcObject=stream;$('mic').disabled=false;$('camera').disabled=audioOnly;$('camera').textContent=audioOnly?'Audio-only consultation':'Camera on';$('camera').setAttribute('aria-pressed',String(!audioOnly));$('mic').textContent='Microphone on';$('mic').setAttribute('aria-pressed','true');await poll();
    }catch(error){if(attempt!==disposed)return;await leave();throw new Error(error.name==='NotAllowedError'?'Microphone/camera permission was denied. Allow this site in browser settings, then join again.':error.name==='NotFoundError'?'The requested camera or microphone was not found. Connect a microphone, or try Audio only if your camera is unavailable.':error.name==='NotReadableError'?'Your camera or microphone is in use by another application. Close that application and retry.':error.message);}
  }
  async function send(payload){const active=current,gen=generation;if(!active)return;signalQueue=signalQueue.catch(()=>{}).then(()=>request('/'+active.id+'/signal',json('POST',{clientId:active.clientId,generation:gen,payload})));return signalQueue;}
  async function peer(room){
    if(pc||!mediaReady)return;const active=current,gen=generation;
    const connection=new RTCPeerConnection({iceServers:active.configuration.iceServers,iceTransportPolicy:active.configuration.iceTransportPolicy});pc=connection;
    stream.getTracks().forEach(track=>connection.addTrack(track,stream));
    connection.onicecandidate=event=>{if(event.candidate&&pc===connection)send({type:'candidate',candidate:event.candidate.toJSON()}).catch(error=>notice(error.message,true));};
    connection.ontrack=event=>{if(pc!==connection)return;if(active.audioOnly&&event.track.kind==='video'){event.track.stop();return;}const remote=$('remote');const incoming=event.streams[0]?.getTracks()||[event.track],combined=remote.srcObject||new MediaStream();for(const track of incoming){if(active.audioOnly&&track.kind!=='audio')continue;if(!combined.getTracks().some(existing=>existing.id===track.id))combined.addTrack(track);}remote.srcObject=combined;remote.play().catch(()=>showNotice('Use Enable speaker audio to hear the other participant.'));};
    connection.onconnectionstatechange=()=>{if(pc!==connection)return;$('call-state').textContent=connection.connectionState==='connected'?'Connected':connection.connectionState;
      $('connection-note').textContent=connection.connectionState==='connected'?'WebRTC reports a connected media transport. Confirm you can see/hear the other participant.':connection.connectionState==='failed'?'Media connection failed. Leave and rejoin. A configured TURN relay is needed for reliable cross-network calls.':'Connecting real media; the local preview does not confirm a call.';};
    if(role()==='doctor'){
      await connection.setLocalDescription(await connection.createOffer());
      if(current===active&&generation===gen&&pc===connection)await send({type:'offer',sdp:connection.localDescription.sdp});
    }
  }
  async function poll(){
    if(current&&Date.now()-lastAuthorizedPoll>45000){stopLocal();showNotice('The server could not renew your room authorization. Media was stopped. Check the connection and join again.',true);return;}
    if(!current||polling)return;polling=true;const active=current,token=api.session()?.token;
    try{const data=await request('/'+active.id+'/poll?clientId='+active.clientId+'&after='+cursor);if(current!==active||token!==api.session()?.token)return;
      lastAuthorizedPoll=Date.now();
      const room=data.room;$('admit').hidden=role()!=='doctor'||room.admitted;$('admit').disabled=!room.patientPresent;$('end').hidden=role()!=='doctor';
      if(!room.admitted||!room.patientPresent||!room.doctorPresent){stopPeer();generation=-1;cursor=0;$('call-state').textContent=mediaReady?'Waiting room':'Waiting for device permission';if(mediaReady)$('waiting').textContent=role()==='doctor'?(room.patientPresent?'Patient is waiting. Admit them to begin.':'Waiting for your patient to join.'):'Waiting for your doctor to join and admit you.';return;}
      $('waiting').textContent='Patient admitted. Establishing the private media connection.';
      if(generation!==room.generation){stopPeer();generation=room.generation;cursor=0;}
      if(!mediaReady)return;await peer(room);
      for(const signal of data.signals){if(signal.id<=cursor)continue;const p=signal.payload;
        if(p.type==='offer'&&role()==='patient'){await pc.setRemoteDescription({type:'offer',sdp:p.sdp});if(active.audioOnly)for(const transceiver of pc.getTransceivers?.()||[])if(transceiver.receiver.track.kind==='video')transceiver.direction='inactive';for(const candidate of pendingCandidates)await pc.addIceCandidate(candidate);pendingCandidates=[];await pc.setLocalDescription(await pc.createAnswer());await send({type:'answer',sdp:pc.localDescription.sdp});}
        else if(p.type==='answer'&&role()==='doctor'){await pc.setRemoteDescription({type:'answer',sdp:p.sdp});for(const candidate of pendingCandidates)await pc.addIceCandidate(candidate);pendingCandidates=[];}
        else if(p.type==='candidate'){if(pc.remoteDescription)await pc.addIceCandidate(p.candidate);else pendingCandidates.push(p.candidate);}
        cursor=signal.id;
      }
    }catch(error){if(current===active){notice(error.message,true);if([401,403,404,409].includes(error.status))stopLocal();}}finally{polling=false;}
  }
  document.addEventListener('click',async event=>{
    const button=event.target.closest('[data-join],[data-audio],[data-cancel],[data-complete],[data-copy]');if(!button)return;
    const appointmentId=Number(button.dataset.join||button.dataset.audio||button.dataset.cancel||button.dataset.complete),inline=$('appointment-message-'+appointmentId),original=button.textContent;
    if((button.dataset.join||button.dataset.audio)&&joining)return;
    button.disabled=true;const isJoin=!!(button.dataset.join||button.dataset.audio),ticket=isJoin?++joinTicket:joinTicket;
    try{
      if(button.dataset.copy){const url=roomURL(button.dataset.copy);if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(url);else{showNotice('Private room link: '+url+' (sign-in is required).');return;}showNotice('Private room link copied. Only the booked patient and assigned doctor can join.');return;}
      if(button.dataset.complete){button.textContent='Completing appointment...';await api.request('/appointments/'+appointmentId+'/status',json('PUT',{status:'Completed'}));if(current&&rooms.find(r=>r.appointmentId===appointmentId)?.id===current.id)await leave(true);else await load();showNotice('Appointment completed. Room access is closed.');return;}
      if(button.dataset.cancel){button.textContent='Cancelling…';if(current&&rooms.find(r=>r.appointmentId===appointmentId)?.id===current.id)await leave();await api.request('/appointments/'+appointmentId+'/cancel',json('PUT',{reason:'Cancelled from Video Consultation'}));showNotice('Appointment cancelled. The slot is available for another booking.');await load();return;}
      joining=true;button.textContent=button.dataset.audio?'Joining voice room…':'Joining video room…';if(inline)inline.textContent='Checking your scheduled room and device permissions…';
      await join(appointmentId,!!button.dataset.audio);if(inline)inline.textContent='Room opened. Check your device permission prompt and waiting-room status.';
    }catch(error){if(inline)inline.textContent=error.message;showNotice(error.message,true);}finally{if(isJoin&&ticket===joinTicket)joining=false;button.disabled=false;button.textContent=original;}
  });
  $('admit').onclick=async()=>{if(!current)return;$('admit').disabled=true;try{await request('/'+current.id+'/admit',json('POST',{clientId:current.clientId}));await poll();}catch(error){notice(error.message,true);}finally{$('admit').disabled=false;}};
  $('mic').onclick=()=>{const tracks=stream?.getAudioTracks()||[],enabled=!tracks[0]?.enabled;tracks.forEach(t=>t.enabled=enabled);$('mic').textContent=enabled?'Microphone on':'Microphone muted';$('mic').setAttribute('aria-pressed',String(enabled));};
  $('camera').onclick=()=>{const tracks=stream?.getVideoTracks()||[],enabled=!tracks[0]?.enabled;tracks.forEach(t=>t.enabled=enabled);$('camera').textContent=enabled?'Camera on':'Camera off';$('camera').setAttribute('aria-pressed',String(enabled));};
  $('audio').onclick=()=>$('remote').play().catch(()=>notice('Audio cannot play yet. Check your speaker settings and connection.',true));
  $('leave').onclick=()=>leave();$('end').onclick=()=>leave(true);$('refresh').onclick=load;
  window.addEventListener('care-session',()=>{doctors=[];$('schedule').reset();$('appointment-date').value=day;load();});load();
})();
