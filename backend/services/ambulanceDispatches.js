import pool from '../config/db.js';
import {getAmbulanceTrackingStatus} from './ambulanceTracking.js';
let ready;
export function ensureAmbulanceSchema(){
 return ready ||= pool.query(`CREATE TABLE IF NOT EXISTS ambulance_dispatches (
 id CHAR(36) PRIMARY KEY,patient_id INT NOT NULL,provider_name VARCHAR(80) NOT NULL,
 provider_dispatch_id VARCHAR(191) NOT NULL,active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(patient_id) REFERENCES users(id) ON DELETE CASCADE,
 UNIQUE KEY provider_dispatch(provider_name,provider_dispatch_id),INDEX patient_active(patient_id,active)
 ) ENGINE=InnoDB`).catch(error=>{ready=null;throw error;});
}
// Implement this boundary only with an authorized server-side provider SDK/API.
// Never construct a provider URL or accept vehicle coordinates from browser input.
export const authorizedAmbulanceProvider = null;
async function fetchProviderPosition(provider,dispatchId){
 const controller=new AbortController();let timer;
 try{return await Promise.race([
  provider.getDispatchLocation(dispatchId,{signal:controller.signal}),
  new Promise((resolve,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('Provider timeout'));},8000);})
 ]);}finally{clearTimeout(timer);}
}
export function validateAmbulancePosition(raw,now=Date.now()){
 if(!raw||typeof raw.latitude!=='number'||typeof raw.longitude!=='number'||!Number.isFinite(raw.latitude)||!Number.isFinite(raw.longitude)||Math.abs(raw.latitude)>90||Math.abs(raw.longitude)>180)throw new Error('Invalid provider coordinates');
 if(typeof raw.updatedAt!=='string'||!/(Z|[+-]\d{2}:\d{2})$/.test(raw.updatedAt))throw new Error('Provider timestamp must include a timezone');
 const time=Date.parse(raw.updatedAt);if(!Number.isFinite(time)||now-time>120000||time-now>30000)throw new Error('Provider location is stale or invalid');
 return {latitude:raw.latitude,longitude:raw.longitude,updatedAt:new Date(time).toISOString()};
}
export async function listPatientDispatches(patientId){
 await ensureAmbulanceSchema();const [rows]=await pool.query('SELECT id,provider_name AS provider,created_at AS createdAt FROM ambulance_dispatches WHERE patient_id=? AND active=TRUE ORDER BY created_at DESC',[patientId]);return rows;
}
export async function patientDispatchTracking(patientId,dispatchId,{provider=authorizedAmbulanceProvider}={}){
 await ensureAmbulanceSchema();const [[dispatch]]=await pool.query('SELECT provider_name,provider_dispatch_id FROM ambulance_dispatches WHERE id=? AND patient_id=? AND active=TRUE',[dispatchId,patientId]);
 if(!dispatch)return {status:404,tracking:{...getAmbulanceTrackingStatus(),message:'Dispatch not found.'}};
 if(!provider||provider.name!==dispatch.provider_name)return {status:503,tracking:getAmbulanceTrackingStatus()};
 try{
  // The provider adapter must honor AbortSignal, authenticate server-side and return
  // the exact requested dispatch ID with a fresh provider-sourced position.
  const raw=await fetchProviderPosition(provider,dispatch.provider_dispatch_id);
  if(raw?.dispatchId!==dispatch.provider_dispatch_id)throw new Error('Provider returned a different dispatch');
  const position=validateAmbulancePosition(raw);
  return {status:200,tracking:{available:true,provider:provider.name,dispatchId,position,updatedAt:position.updatedAt,message:'Authorized dispatch location'}};
 }catch{return {status:503,tracking:getAmbulanceTrackingStatus()};}
}
