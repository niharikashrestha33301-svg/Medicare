import test from 'node:test';
import assert from 'node:assert/strict';
import {appointmentMoment,appointmentDisplay,roomAccess} from '../services/consultationSchedule.js';
test('Indian appointments store UTC and open precisely fifteen minutes before the start',()=>{
 const old=process.env.APPOINTMENT_TIMEZONE;process.env.APPOINTMENT_TIMEZONE='Asia/Kolkata';
 try{const at=appointmentMoment('2026-10-17','09:00 AM');assert.equal(at.toISOString(),'2026-10-17T03:30:00.000Z');const visit={status:'Confirmed',startsAt:at.toISOString()};assert.equal(roomAccess(visit,Date.parse('2026-10-17T03:14:59.999Z')).canJoin,false);assert.equal(roomAccess(visit,Date.parse('2026-10-17T03:15:00Z')).canJoin,true);assert.equal(roomAccess({...visit,status:'Cancelled'},at.getTime()).canJoin,false);assert.equal(roomAccess({...visit,status:'Completed'},at.getTime()).canJoin,false);assert.equal(roomAccess({...visit,startsAt:'invalid'}).canJoin,false);
 const legacy=appointmentMoment('2026-10-17','09:00 AM','Asia/Kathmandu');assert.equal(legacy.toISOString(),'2026-10-17T03:15:00.000Z');assert.equal(appointmentDisplay({startsAt:legacy.toISOString()}).timeSlot,'08:45 AM','Legacy instant is preserved, not moved by changing clinic timezone');}finally{if(old===undefined)delete process.env.APPOINTMENT_TIMEZONE;else process.env.APPOINTMENT_TIMEZONE=old;}
});
