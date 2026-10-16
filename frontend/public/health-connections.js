(() => {
 'use strict';
 const api=MedicareAPI,$=id=>document.getElementById(id);
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const ids=['care-profile','care-tests','care-orders','care-medicines'];let generation=0,owner=null;
 const empty=text=>`<div class="empty"><strong>${escape(text)}</strong></div>`;
 const row=(title,description,status='')=>`<div class="list-item"><div><strong>${escape(title)}</strong><p>${escape(description)}</p></div>${status?`<span class="badge">${escape(status)}</span>`:''}</div>`;
 function clear(){generation++;owner=null;for(const id of ids){$(id).replaceChildren();$(id).setAttribute('aria-busy','false');}$('care-refresh').disabled=false;}
 async function load(){
  const session=api.session();if(!session||session.user.role!=='patient'){clear();return;}
  if(owner!==session.token){clear();owner=session.token;}
  const token=session.token,ticket=++generation;$('care-refresh').disabled=true;
  for(const id of ids){$(id).textContent='Loading your saved records...';$(id).setAttribute('aria-busy','true');}
  const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const results=await Promise.allSettled([api.request('/auth/me'),api.request('/lab-bookings/my'),api.request('/pharmacy/orders'),api.request('/medicine-reminders?timezone=Asia%2FKolkata&day='+day)]);
  if(ticket!==generation||api.session()?.token!==token)return;
  results.forEach((result,index)=>{
   const target=$(ids[index]);target.setAttribute('aria-busy','false');
   if(result.status==='rejected'){target.innerHTML=empty('This section is temporarily unavailable. Use Refresh care records to retry.');return;}
   try{
    const data=result.value;
    if(index===0){const p=data.user;const fields=[['Name',p.name],['Email',p.email],['Phone',p.phone],['Blood group',p.bloodGroup||p.blood_group],['Age',p.age],['Gender',p.gender],['Date of birth',p.dob?String(p.dob).slice(0,10):null]];target.innerHTML=fields.map(([label,value])=>row(label,value===null||value===undefined||value===''?'Not recorded':value)).join('');}
    if(index===1){const bookings=data.bookings||[];target.innerHTML=bookings.length?bookings.slice(0,5).map(b=>row(b.testName,`${b.collectionDate} | ${b.preference} | ${b.bookingCode}`,b.status)).join(''):empty('No saved test bookings yet. Book a test from the homepage.');}
    if(index===2){const orders=data.orders||[];target.innerHTML=orders.length?orders.slice(0,5).map(o=>row('Order '+String(o.id).slice(0,8),(o.items||[]).map(item=>`${item.name} x ${item.quantity}`).join(', ')+' | '+new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(Number(o.total_paise)/100),o.status)).join(''):empty('No pharmacy orders yet. Your saved orders will appear here.');}
    if(index===3){const plans=data.plans||[];target.innerHTML=plans.length?plans.map(p=>{const today=new Intl.DateTimeFormat('en-CA',{timeZone:p.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());return row(p.name,`${p.dosage} | ${(p.timings||[]).join(', ')} (${p.timezone}) | ${p.start_date} to ${p.end_date}`,!p.active?'Paused':p.end_date<today?'Schedule ended':p.start_date>today?'Scheduled':'Active');}).join(''):empty('No medicine schedules yet. Add details exactly as prescribed in Medicine Reminder.');const events=(data.events||[]).filter(e=>e.local_date===day);if(events.length)target.innerHTML+='<h3>Doses on '+escape(day)+'</h3>'+events.map(e=>row(e.name,`${e.local_time} (${plans.find(p=>p.id===e.plan_id)?.timezone||'schedule timezone'}) | ${e.dosage}`,e.status)).join('');}
   }catch{target.innerHTML=empty('These records could not be displayed. Refresh to retry.');}
  });
  $('care-refresh').disabled=false;
 }
 $('care-refresh').onclick=load;
 window.addEventListener('health-loaded',load);
 window.addEventListener('health-cleared',clear);
 window.addEventListener('storage',event=>{if(['mc_user','mc_token',null].includes(event.key))clear();});
 if(!$('dashboard').hidden&&api.session())load();
})();
