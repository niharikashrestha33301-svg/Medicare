import fs from 'node:fs';
import pool from '../config/db.js';
import {captureExistingAppointmentTimes} from '../services/appointmentScheduleStore.js';
try{
 const prior=process.argv.find(value=>value.startsWith('--legacy-timezone='))?.split('=')[1]||process.env.APPOINTMENT_TIMEZONE||process.env.APP_TIMEZONE||'Asia/Kathmandu';
 new Intl.DateTimeFormat('en',{timeZone:prior}).format(new Date());
 const count=await captureExistingAppointmentTimes(prior);
 const path=new URL('../.env',import.meta.url),existing=fs.readFileSync(path,'utf8');
 const source=/^APPOINTMENT_TIMEZONE=.*$/m.test(existing)?existing.replace(/^APPOINTMENT_TIMEZONE=.*$/m,'APPOINTMENT_TIMEZONE=Asia/Kolkata'):existing+'\nAPPOINTMENT_TIMEZONE=Asia/Kolkata\n';
 fs.writeFileSync(path,source);
 console.log(`Stored UTC schedules for ${count} existing appointments using ${prior}; original booking rows were preserved. New appointments use Asia/Kolkata after restarting the Node API.`);
}finally{await pool.end();}
