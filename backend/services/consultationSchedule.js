import {zonedUTC,localParts} from './medicineTime.js';
export const appointmentTimezone=()=>process.env.APPOINTMENT_TIMEZONE||'Asia/Kolkata';
export function appointmentMoment(day,time,timezone=appointmentTimezone()){
  const match=String(time).match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if(!match)return null;
  if(Number(match[1])<1||Number(match[1])>12||Number(match[2])>59)return null;
  const hour=Number(match[1])%12+(match[3].toUpperCase()==='PM'?12:0);
  try{return zonedUTC(day,`${String(hour).padStart(2,'0')}:${match[2]}`,timezone);}catch{return null;}
}
export function appointmentDisplay(appointment){
  const raw=appointment.startsAt||appointment.starts_at_utc;
  const parsed=raw?new Date(raw):appointmentMoment(appointment.date||appointment.appointment_date,appointment.timeSlot||appointment.time_slot);
  const at=parsed&&Number.isFinite(parsed.getTime())?parsed:null;
  if(!at||!Number.isFinite(at.getTime()))return appointment;
  const local=localParts(at,appointmentTimezone()),[hour,minute]=local.time.split(':').map(Number),timeSlot=String(hour%12||12).padStart(2,'0')+':'+String(minute).padStart(2,'0')+(hour>=12?' PM':' AM');
  return {...appointment,date:local.date,timeSlot,startsAt:at.toISOString(),timezone:appointmentTimezone()};
}
export function roomAccess(appointment,now=Date.now()){
  const raw=appointment.startsAt||appointment.starts_at_utc;
  const parsed=raw?new Date(raw):appointmentMoment(appointment.date||appointment.appointment_date,appointment.timeSlot||appointment.time_slot);
  const at=parsed&&Number.isFinite(parsed.getTime())?parsed:null;
  const opensAt=at?new Date(at.getTime()-15*60000).toISOString():null,closesAt=at?new Date(at.getTime()+120*60000).toISOString():null;
  const reason=!['Pending','Confirmed'].includes(appointment.status)?'This appointment is '+String(appointment.status).toLowerCase()+'.':!at?'The appointment time needs correction by the clinic.':now<Date.parse(opensAt)?'This room opens 15 minutes before the scheduled appointment.':now>Date.parse(closesAt)?'This appointment’s consultation window has ended.':'';
  return {startsAt:at?.toISOString()||null,opensAt,closesAt,canJoin:!reason,joinReason:reason,timezone:appointmentTimezone()};
}
