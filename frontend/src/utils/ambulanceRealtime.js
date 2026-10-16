// Native Supabase adapter for the future verified account/database cutover.
// The current MySQL emergency page explicitly uses authenticated polling.
export async function subscribeAmbulanceRequest({client,requestId,onStatus,onPosition,onUnavailable}){
 if(!client||!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(requestId))throw new Error('Configure an authenticated MediCare Supabase client and valid request.');
 const verified=await client.auth.getUser();if(verified.error||!verified.data.user)throw new Error('Sign in to track this emergency request.');
 const {data:{session}}=await client.auth.getSession();if(!session)throw new Error('Supabase session expired.');
 await client.realtime.setAuth(session.access_token);
 let stopped=false,lastPosition=null,currentStatus=null;
 const active=()=>['Accepted','En route','Arrived'].includes(currentStatus);
 const unavailable=message=>{lastPosition=null;onPosition(null);onUnavailable(message);};
 const position=row=>{if(stopped||!active())return;if(row?.request_id!==requestId||typeof row.latitude!=='number'||typeof row.longitude!=='number'||Math.abs(row.latitude)>90||Math.abs(row.longitude)>180||!Number.isFinite(row.latitude)||!Number.isFinite(row.longitude)){unavailable('Live ambulance tracking unavailable');return;}const at=Date.parse(row.measured_at);if(!Number.isFinite(at)||Date.now()-at>120000||at-Date.now()>30000){unavailable('Live ambulance tracking unavailable: GPS is stale.');return;}lastPosition={latitude:row.latitude,longitude:row.longitude,updatedAt:row.measured_at};onPosition(lastPosition);};
 const initial=await client.from('medicare_emergency_requests').select('id,status').eq('id',requestId).single();if(initial.error||!initial.data)throw new Error('Emergency request unavailable to this account.');currentStatus=initial.data.status;onStatus(currentStatus);
 const channel=client.channel('medicare-emergency:'+requestId).on('postgres_changes',{event:'UPDATE',schema:'public',table:'medicare_emergency_requests',filter:'id=eq.'+requestId},payload=>{if(stopped)return;currentStatus=payload.new.status;onStatus(currentStatus);if(!active())unavailable('Location access is unavailable or the request is closed.');}).on('postgres_changes',{event:'*',schema:'public',table:'medicare_ambulance_positions',filter:'request_id=eq.'+requestId},payload=>position(payload.new)).subscribe(async status=>{if(stopped)return;if(status==='SUBSCRIBED'){const result=await client.from('medicare_ambulance_positions').select('request_id,latitude,longitude,measured_at').eq('request_id',requestId).maybeSingle();if(!stopped){if(result.error||!result.data)unavailable('Live ambulance tracking unavailable');else position(result.data);}}else if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status))unavailable('Live ambulance tracking unavailable: connection lost.');});
 const timer=setInterval(()=>{if(lastPosition&&Date.now()-Date.parse(lastPosition.updatedAt)>120000)unavailable('Live ambulance tracking unavailable: GPS is stale.');},1000);
 let authListener=null;
 const stop=()=>{if(stopped)return;stopped=true;clearInterval(timer);Promise.resolve(client.removeChannel(channel)).catch(()=>{});onPosition(null);authListener?.data?.subscription?.unsubscribe();};
 authListener=client.auth.onAuthStateChange((event,next)=>{if(!next)stop();else client.realtime.setAuth(next.access_token).catch(()=>{unavailable('Session could not be refreshed.');stop();});});
 if(stopped)authListener?.data?.subscription?.unsubscribe();
 return stop;
}
