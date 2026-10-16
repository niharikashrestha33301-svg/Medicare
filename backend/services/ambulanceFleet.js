import pool from '../config/db.js';
import {randomUUID} from 'node:crypto';
import {badRequest,string,id} from '../utils/validation.js';
import {problem,uuid} from './careSecurity.js';
import {utcSQL} from './medicineTime.js';
let ready;
export const activeEmergencyStatuses=['Requested','Accepted','En route','Arrived'];
export function ensureFleet(){return ready ||= (async()=>{
 await pool.query(`CREATE TABLE IF NOT EXISTS ambulance_drivers (
 user_id INT PRIMARY KEY,organization VARCHAR(160) NOT NULL,license_reference VARCHAR(160) NOT NULL,phone VARCHAR(30) NOT NULL,
 status ENUM('Pending','Approved','Rejected') NOT NULL DEFAULT 'Pending',review_reason VARCHAR(1000) NOT NULL DEFAULT '',
 reviewed_by INT NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,FOREIGN KEY(reviewed_by) REFERENCES users(id) ON DELETE SET NULL) ENGINE=InnoDB`);
 await pool.query(`CREATE TABLE IF NOT EXISTS ambulance_vehicles (
 id CHAR(36) PRIMARY KEY,driver_id INT NOT NULL,registration VARCHAR(40) NOT NULL UNIQUE,description VARCHAR(250) NOT NULL,
 status ENUM('Pending','Approved','Rejected') NOT NULL DEFAULT 'Pending',available BOOLEAN NOT NULL DEFAULT FALSE,
 latitude DECIMAL(10,7) NULL,longitude DECIMAL(10,7) NULL,accuracy DECIMAL(10,2) NULL,gps_at DATETIME NULL,
 review_reason VARCHAR(1000) NOT NULL DEFAULT '',reviewed_by INT NULL,
 FOREIGN KEY(driver_id) REFERENCES ambulance_drivers(user_id) ON DELETE CASCADE,FOREIGN KEY(reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
 INDEX ready_vehicles(status,available,gps_at)) ENGINE=InnoDB`);
 await pool.query(`CREATE TABLE IF NOT EXISTS ambulance_requests (
 id CHAR(36) PRIMARY KEY,patient_id INT NOT NULL,vehicle_id CHAR(36) NOT NULL,phone VARCHAR(30) NOT NULL,
 pickup_lat DECIMAL(10,7) NULL,pickup_lon DECIMAL(10,7) NULL,
 status ENUM('Requested','Accepted','En route','Arrived','Completed','Cancelled','Declined','Expired') NOT NULL DEFAULT 'Requested',
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 active_patient INT GENERATED ALWAYS AS (CASE WHEN status IN ('Requested','Accepted','En route','Arrived') THEN patient_id ELSE NULL END) STORED,
 UNIQUE KEY one_active_request(active_patient),INDEX vehicle_requests(vehicle_id,status),
 FOREIGN KEY(patient_id) REFERENCES users(id) ON DELETE CASCADE,FOREIGN KEY(vehicle_id) REFERENCES ambulance_vehicles(id) ON DELETE CASCADE) ENGINE=InnoDB`);
 await pool.query(`CREATE TABLE IF NOT EXISTS ambulance_reviews (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,reviewer_id INT NULL,subject VARCHAR(80) NOT NULL,decision VARCHAR(20) NOT NULL,
 reason VARCHAR(1000) NOT NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(reviewer_id) REFERENCES users(id) ON DELETE SET NULL) ENGINE=InnoDB`);
})().catch(e=>{ready=null;throw e;});}
export function contact(value){const p=string(value,'phone',30);if(!/^\+?[\d ()-]+$/.test(p)||p.replace(/\D/g,'').length<7||p.replace(/\D/g,'').length>15)throw badRequest('Enter a valid contact phone.');return p;}
export function gps(body){
 const {latitude,longitude,accuracy,measuredAt}=body;
 if(typeof latitude!=='number'||typeof longitude!=='number'||!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180)throw badRequest('GPS coordinates are invalid.');
 if(typeof accuracy!=='number'||!Number.isFinite(accuracy)||accuracy<=0||accuracy>1000)throw badRequest('GPS accuracy is too low. Retry outside or call emergency services.');
 const at=typeof measuredAt==='string'?Date.parse(measuredAt):NaN;if(!/(Z|[+-]\d{2}:\d{2})$/.test(measuredAt||'')||!Number.isFinite(at)||Date.now()-at>120000||at-Date.now()>30000)throw badRequest('Refresh your GPS location before continuing.');
 return {latitude,longitude,accuracy,at:utcSQL(at)};
}
export function distanceKm(a,b){const rad=v=>v*Math.PI/180,dlat=rad(b.latitude-a.latitude),dlon=rad(b.longitude-a.longitude),x=Math.sin(dlat/2)**2+Math.cos(rad(a.latitude))*Math.cos(rad(b.latitude))*Math.sin(dlon/2)**2;return 6371*2*Math.atan2(Math.sqrt(x),Math.sqrt(Math.max(0,1-x)));}
export async function expireFleet(){await ensureFleet();await pool.query("UPDATE ambulance_requests SET status='Expired',pickup_lat=NULL,pickup_lon=NULL,updated_at=UTC_TIMESTAMP() WHERE status='Requested' AND created_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 5 MINUTE)");await pool.query("UPDATE ambulance_vehicles SET available=FALSE,latitude=NULL,longitude=NULL,accuracy=NULL WHERE gps_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 5 MINUTE)");}
const freshFleet=`v.status='Approved' AND d.status='Approved' AND u.status='Active' AND v.latitude IS NOT NULL AND v.gps_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 2 MINUTE)`;
export async function fleetStatus(){await expireFleet();const [[r]]=await pool.query(`SELECT COUNT(*) AS count FROM ambulance_vehicles v JOIN ambulance_drivers d ON d.user_id=v.driver_id JOIN users u ON u.id=d.user_id WHERE ${freshFleet}`);return {available:r.count>0,provider:r.count?'Verified MediCare fleet':null,vehicles:[],message:r.count?'Authorized fleet connected. Sign in to request and track your assigned ambulance.':'Live ambulance tracking unavailable',transport:'authenticated polling',supabaseRealtime:false,etaAvailable:false};}
export async function requireDriver(userId,connection=pool){const [[driver]]=await connection.query("SELECT d.* FROM ambulance_drivers d JOIN users u ON u.id=d.user_id WHERE d.user_id=? AND d.status='Approved' AND u.status='Active'",[userId]);if(!driver)throw problem('An administrator must approve your driver registration first.',403);return driver;}
export async function vehicleForDriver(userId,vehicleId,connection=pool){if(connection!==pool)await connection.query('SELECT user_id FROM ambulance_drivers WHERE user_id=? FOR UPDATE',[userId]);await requireDriver(userId,connection);const [[v]]=await connection.query("SELECT * FROM ambulance_vehicles WHERE id=? AND driver_id=? AND status='Approved' FOR UPDATE",[uuid(vehicleId),userId]);if(!v)throw problem('Approved vehicle not found.',404);return v;}
export async function requestAmbulance(user,body){
 await expireFleet();if(body.shareLocation!==true)throw badRequest('Consent to share your pickup location with the assigned provider.');const pickup=gps(body),phone=contact(body.phone);const c=await pool.getConnection();let locked=false;
 try{const [[lock]]=await c.query("SELECT GET_LOCK('medicare_ambulance_assignment',5) AS acquired");if(!lock.acquired)throw problem('Ambulance assignment is busy. Retry or call emergency services.',503);locked=true;await c.beginTransaction();const [vehicles]=await c.query(`SELECT v.id,v.latitude,v.longitude FROM ambulance_vehicles v JOIN ambulance_drivers d ON d.user_id=v.driver_id JOIN users u ON u.id=d.user_id WHERE ${freshFleet} AND v.available=TRUE FOR UPDATE`);
  const eligible=vehicles.map(v=>({...v,distance:distanceKm(pickup,{latitude:Number(v.latitude),longitude:Number(v.longitude)})})).filter(v=>v.distance<=50).sort((a,b)=>a.distance-b.distance);
  if(!eligible.length)throw problem('Live ambulance tracking unavailable. No approved, available ambulance with fresh GPS is connected within the service radius. Call 112 or the local ambulance service.',503);
  const selected=eligible[0],requestId=randomUUID();await c.query('INSERT INTO ambulance_requests(id,patient_id,vehicle_id,phone,pickup_lat,pickup_lon) VALUES(?,?,?,?,?,?)',[requestId,user.id,selected.id,phone,pickup.latitude,pickup.longitude]);await c.query('UPDATE ambulance_vehicles SET available=FALSE WHERE id=?',[selected.id]);await c.commit();return {id:requestId,status:'Requested',message:'Sent to an authorized driver. Awaiting acceptance; an ambulance is not confirmed until accepted.'};
 }catch(e){await c.rollback();throw e;}finally{if(locked)await c.query("SELECT RELEASE_LOCK('medicare_ambulance_assignment')").catch(()=>{});c.release();}
}
export async function ownRequests(user){await expireFleet();const doctorSide=user.provider===true;const [rows]=await pool.query(`SELECT r.id,r.status,DATE_FORMAT(r.created_at,'%Y-%m-%dT%H:%i:%sZ') AS createdAt,v.registration,v.description,d.organization FROM ambulance_requests r JOIN ambulance_vehicles v ON v.id=r.vehicle_id JOIN ambulance_drivers d ON d.user_id=v.driver_id WHERE ${doctorSide?'v.driver_id':'r.patient_id'}=? ORDER BY r.created_at DESC LIMIT 50`,[user.id]);return rows;}
export async function trackRequest(user,requestId){
 await expireFleet();const [[r]]=await pool.query(`SELECT r.*,v.driver_id,v.registration,v.description,v.latitude,v.longitude,DATE_FORMAT(v.gps_at,'%Y-%m-%dT%H:%i:%sZ') AS gpsAt,v.status AS vehicle_status,d.status AS driver_status,d.organization,d.phone AS driver_phone,u.status AS account_status FROM ambulance_requests r JOIN ambulance_vehicles v ON v.id=r.vehicle_id JOIN ambulance_drivers d ON d.user_id=v.driver_id JOIN users u ON u.id=v.driver_id WHERE r.id=? AND ${user.provider===true?'v.driver_id':'r.patient_id'}=?`,[uuid(requestId),user.id]);
 if(!r)throw problem('Emergency request not found.',404);
 const active=activeEmergencyStatuses.includes(r.status),accepted=['Accepted','En route','Arrived'].includes(r.status),fresh=r.latitude!==null&&r.gpsAt&&Date.now()-Date.parse(r.gpsAt)<=120000&&r.vehicle_status==='Approved'&&r.driver_status==='Approved'&&r.account_status==='Active';
 const result={id:r.id,status:r.status,vehicle:{registration:r.registration,description:r.description,provider:r.organization},trackingAvailable:!!(accepted&&fresh),position:null,pickup:null,distanceKm:null,etaSeconds:null,message:!active?'This request is closed. Location access has ended.':!accepted?'Awaiting driver acceptance. Ambulance dispatch is not confirmed.':!fresh?'Live ambulance tracking unavailable. Driver GPS is stale or offline.':'Latest authenticated driver GPS update',driverPhone:accepted?r.driver_phone:null};
 if(user.provider===true&&active){result.pickup=accepted?{latitude:Number(r.pickup_lat),longitude:Number(r.pickup_lon)}:{latitude:Math.round(Number(r.pickup_lat)*100)/100,longitude:Math.round(Number(r.pickup_lon)*100)/100};result.pickupApproximate=!accepted;if(accepted)result.patientPhone=r.phone;}
 if(accepted&&fresh){result.position={latitude:Number(r.latitude),longitude:Number(r.longitude),updatedAt:r.gpsAt};if(r.pickup_lat!==null){const pickup={latitude:Number(r.pickup_lat),longitude:Number(r.pickup_lon)};result.distanceKm=Math.round(distanceKm(result.position,pickup)*100)/100;if(!user.provider)result.pickup=pickup;}}
 return result;
}
export async function setRequestStatus(user,requestId,next){await expireFleet();const c=await pool.getConnection();try{await c.beginTransaction();const [[r]]=await c.query('SELECT r.*,v.driver_id,v.status AS vehicle_status FROM ambulance_requests r JOIN ambulance_vehicles v ON v.id=r.vehicle_id WHERE r.id=? FOR UPDATE',[uuid(requestId)]);if(!r||(user.provider?r.driver_id:r.patient_id)!==user.id)throw problem('Emergency request not found.',404);
 if(user.provider){await requireDriver(user.id,c);if(r.vehicle_status!=='Approved')throw problem('Vehicle approval is required.',403);const transitions={Requested:['Accepted','Declined'],Accepted:['En route'],'En route':['Arrived'],Arrived:['Completed']};if(!transitions[r.status]?.includes(next))throw problem('This request changed or that status transition is unavailable.');}
 else if(next!=='Cancelled'||!activeEmergencyStatuses.includes(r.status))throw problem('This emergency request cannot be cancelled.');
 const closed=!activeEmergencyStatuses.includes(next);await c.query('UPDATE ambulance_requests SET status=?,pickup_lat=IF(?,NULL,pickup_lat),pickup_lon=IF(?,NULL,pickup_lon),updated_at=UTC_TIMESTAMP() WHERE id=?',[next,closed,closed,r.id]);await c.commit();return {id:r.id,status:next};
 }catch(e){await c.rollback();throw e;}finally{c.release();}}
