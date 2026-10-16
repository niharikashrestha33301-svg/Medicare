import React from 'react';
export default function AppointmentSlots({doctorId,slotName='timeSlot',onReady}) {
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const [day,setDay]=React.useState(today),[slots,setSlots]=React.useState([]),[selected,setSelected]=React.useState(''),[busy,setBusy]=React.useState(true),[error,setError]=React.useState(''),[retry,setRetry]=React.useState(0);
  React.useEffect(()=>{
    let active=true;const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),15000);
    onReady?.(false);setBusy(true);setError('');setSlots([]);setSelected('');
    const preview=location.protocol==='file:'||(['localhost','127.0.0.1','[::1]'].includes(location.hostname)&&['5500','5501'].includes(location.port));
    const base=preview?'http://localhost:5000/api':new URL('/api',location.href).href.replace(/\/$/,'');
    if(!day){setBusy(false);clearTimeout(timeout);return ()=>{active=false;controller.abort();};}
    fetch(base+'/doctors/'+encodeURIComponent(doctorId)+'/availability?date='+encodeURIComponent(day),{signal:controller.signal}).then(async response=>{const data=await response.json();if(!response.ok||!data.success)throw new Error(data.message||'Could not load available times.');return data;}).then(data=>{
      if(!active)return;const available=data.slots.filter(slot=>slot.available);setSlots(data.slots);setSelected(available[0]?.time||'');onReady?.(available.length>0);
    }).catch(error=>{if(active)setError(error.name==='AbortError'?'Availability timed out. Please retry.':error.message);}).finally(()=>{clearTimeout(timeout);if(active)setBusy(false);});
    return ()=>{active=false;clearTimeout(timeout);controller.abort();};
  },[doctorId,day,retry,onReady]);
  const inputClass='w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl';
  return <div><div className="grid grid-cols-2 gap-3"><label className="text-xs font-bold text-slate-700">Appointment Date<input className={inputClass} type="date" name="date" value={day} min={today} required onChange={event=>setDay(event.target.value)}/></label><label className="text-xs font-bold text-slate-700">Available Slot (IST)<select className={inputClass} name={slotName} value={selected} onChange={event=>setSelected(event.target.value)} disabled={busy||!!error||!slots.some(slot=>slot.available)} required><option value="">{busy?'Loading times...':'Choose an available time'}</option>{slots.map(slot=><option key={slot.time} value={slot.time} disabled={!slot.available}>{slot.time}{slot.reason?' - '+slot.reason:''}</option>)}</select></label></div><p className="text-xs text-slate-500 mt-2" role="status">{error||(!busy&&!slots.some(slot=>slot.available)?'No available times on this date. Choose another date.':'Appointment times use Asia/Kolkata (IST).')}</p>{error&&<button type="button" className="text-xs text-blue-700" onClick={()=>setRetry(value=>value+1)}>Retry availability</button>}</div>;
}
