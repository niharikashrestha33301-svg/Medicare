import { createHmac, timingSafeEqual } from 'node:crypto';
import { badRequest } from '../utils/validation.js';
export const uuid=value=>{if(typeof value!=='string'||!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value))throw badRequest('Invalid request identifier.');return value;};
export const problem=(message,status=409)=>Object.assign(new Error(message),{status});
export function limiter(limit=120) {
  const entries=new Map();
  return (req,res,next)=>{
    const now=Date.now();for(const [key,value]of entries)if(value.until<=now)entries.delete(key);
    const key=req.user?.id||req.ip,entry=entries.get(key)||{until:now+60000,count:0};entries.set(key,entry);
    if(++entry.count>limit)return res.status(429).json({success:false,message:'Too many requests. Wait a minute and retry.'});next();
  };
}
export function validSignature(body,signature,secret) {
  if(!secret||typeof signature!=='string'||!/^[0-9a-f]{64}$/i.test(signature))return false;
  return timingSafeEqual(createHmac('sha256',secret).update(body).digest(),Buffer.from(signature,'hex'));
}
export function iceConfiguration(userId) {
  const urls=(process.env.WEBRTC_TURN_URLS||'').split(',').map(v=>v.trim()).filter(Boolean);
  if(urls.some(url=>!/^turns?:[^\s]+$/.test(url)))throw problem('The video relay is incorrectly configured. Contact the administrator.',503);
  const configured=urls.length>0&&!!process.env.WEBRTC_TURN_SECRET;
  const iceServers=[];
  if(configured){
    const username=`${Math.floor(Date.now()/1000)+7200}:${userId}`;
    iceServers.push({urls,username,credential:createHmac('sha1',process.env.WEBRTC_TURN_SECRET).update(username).digest('base64')});
  }else{
    const stun=(process.env.WEBRTC_STUN_URLS??'stun:stun.l.google.com:19302').split(',').map(v=>v.trim()).filter(Boolean);
    if(stun.some(url=>!/^stuns?:[^\s]+$/.test(url)))throw problem('The video discovery server is incorrectly configured. Contact the administrator.',503);
    if(stun.length)iceServers.push({urls:stun});
  }
  return {iceServers,iceTransportPolicy:configured?'relay':'all',relayConfigured:configured,appointmentTimezone:process.env.APPOINTMENT_TIMEZONE||process.env.APP_TIMEZONE||'Asia/Kathmandu',
    message:configured?'Private relay configured. Real audio/video delivery still needs device testing.':iceServers.length?'Direct WebRTC calling is enabled using STUN discovery. Restrictive mobile or office networks may require a TURN relay; cross-network delivery has not been verified.':'No STUN or TURN server is configured. Only local-network connections may be possible.'};
}
