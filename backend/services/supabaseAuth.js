import '../config/db.js';
const failure=(message,status=503)=>Object.assign(new Error(message),{status});
export function supabaseAuthConfiguration(){
 const ref=process.env.SUPABASE_PROJECT_REF,url=process.env.SUPABASE_URL,key=process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY;
 if(!ref||!url||!key)throw failure('The separate MediCare Supabase Auth project is not configured. Existing MediCare login remains active.');
 let parsed;try{parsed=new URL(url);}catch{throw failure('Invalid Supabase Auth URL.');}
 if(parsed.protocol!=='https:'||parsed.hostname!==`${ref}.supabase.co`||parsed.username||parsed.password||parsed.port||parsed.search||parsed.hash||!['','/'].includes(parsed.pathname))throw failure('Supabase Auth URL must match the configured MediCare project ref.');
 if(!key.startsWith('sb_publishable_')){
  try{const payload=JSON.parse(Buffer.from(key.split('.')[1],'base64url'));if(payload.role!=='anon')throw new Error();}catch{throw failure('Use a Supabase publishable or legacy anon key for Auth, never a secret/service-role key.');}
 }
 return {url:parsed.origin,key};
}
async function authRequest(path,{token,method='GET',body}={}){
 const config=supabaseAuthConfiguration();let response;
 try{response=await fetch(config.url+path,{method,headers:{apikey:config.key,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10000)});}catch{throw failure('Supabase Auth is unavailable. Check project configuration and network access.');}
 if(!response.ok)throw failure(response.status===401||response.status===403?'Invalid or expired Supabase session.':'Supabase Auth request failed.',response.status===401||response.status===403?401:503);
 try{return await response.json();}catch{throw failure('Invalid response from Supabase Auth.');}
}
export async function verifySupabaseSession(token){
 if(typeof token!=='string'||!token||token.length>16000)throw failure('A Supabase access token is required.',401);
 // getUser is a remote Auth validation, not an unverified JWT decode or client session claim.
 const user=await authRequest('/auth/v1/user',{token});
 if(!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(user.id||'')||!user.email_confirmed_at)throw failure('Verify your Supabase account email before booking.',403);
 const profiles=await authRequest('/rest/v1/medicare_profiles?select=id,name,phone,role,status&id=eq.'+encodeURIComponent(user.id),{token});
 const profile=Array.isArray(profiles)&&profiles.length===1?profiles[0]:null;
 if(profile?.id!==user.id||profile.status!=='Active'||!['patient','doctor','admin'].includes(profile.role))throw failure('The Supabase account profile is unavailable or suspended.',403);
 // Profile role is protected by RLS/column grants; user_metadata is never trusted.
 return {id:user.id,name:profile.name,phone:profile.phone,email:user.email,role:profile.role,status:profile.status,authProvider:'supabase'};
}
export async function signInSupabase(email,password){
 const session=await authRequest('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}});
 const user=await verifySupabaseSession(session.access_token);return {user,access_token:session.access_token,refresh_token:session.refresh_token,expires_in:session.expires_in};
}
