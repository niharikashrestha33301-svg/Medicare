import express from 'express';
import {limiter} from '../services/careSecurity.js';
import {supabaseAuthConfiguration,verifySupabaseSession} from '../services/supabaseAuth.js';
const router=express.Router();router.use((req,res,next)=>{res.set('Cache-Control','no-store');next();});
router.get('/status',(req,res)=>{let configurationPresent=false;try{supabaseAuthConfiguration();configurationPresent=true;}catch{}res.json({success:true,configurationPresent,activeLogin:'medicare',nativeCutoverComplete:false,message:'Native Supabase Auth is prepared separately. Existing accounts have not been migrated or automatically linked by email.'});});
router.get('/session',limiter(30),async(req,res)=>{try{const match=req.headers.authorization?.match(/^Bearer (\S+)$/);if(!match)return res.status(401).json({success:false,message:'Supabase access token required.'});const user=await verifySupabaseSession(match[1]);res.json({success:true,user});}catch(error){res.status(error.status||503).json({success:false,message:error.message});}});
export default router;
