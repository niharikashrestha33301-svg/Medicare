import pool from '../config/db.js';
import {iceConfiguration} from '../services/careSecurity.js';
try{
 const [[counts]]=await pool.query("SELECT COUNT(*) AS verifiedDoctorsWithSlots FROM doctors d JOIN users u ON u.id=d.user_id WHERE d.verified=TRUE AND u.status='Active' AND EXISTS(SELECT 1 FROM doctor_slots s WHERE s.doctor_id=d.id)");
 const configuration=iceConfiguration(0);
 console.log(JSON.stringify({databaseConnected:true,...counts,appointmentTimezone:configuration.appointmentTimezone,relayConfigured:configuration.relayConfigured,discoveryConfigured:configuration.iceServers.length>0,relaySettingsIncomplete:Boolean(process.env.WEBRTC_TURN_URLS)!==Boolean(process.env.WEBRTC_TURN_SECRET),message:configuration.message,realCallVerified:false},null,2));
 console.log('Restart only the Node API after editing backend/.env. Check the consultation setup panel, then verify a patient/doctor call on two devices. This check does not test relay reachability or real audio/video.');
}catch(error){console.error('Video readiness check failed:',error.code||error.message);process.exitCode=1;}finally{await pool.end();}
