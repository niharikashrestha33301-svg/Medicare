import express from 'express';
import pool from '../config/db.js';
import { getAmbulanceTrackingStatus } from '../services/ambulanceTracking.js';
import {protect,authorizeRoles} from '../middleware/authMiddleware.js';
import {limiter,uuid} from '../services/careSecurity.js';
import {listPatientDispatches,patientDispatchTracking} from '../services/ambulanceDispatches.js';
const router = express.Router();
router.get('/tracking', (req, res) => {
  res.set('Cache-Control', 'no-store').json({ success: true, tracking: getAmbulanceTrackingStatus() });
});
router.get('/tracking/dispatches',protect,authorizeRoles('patient'),limiter(60),async(req,res)=>{
 res.set('Cache-Control','no-store');try{res.json({success:true,dispatches:await listPatientDispatches(req.user.id),tracking:getAmbulanceTrackingStatus()});}catch{res.status(503).json({success:false,tracking:getAmbulanceTrackingStatus()});}
});
router.get('/tracking/dispatches/:dispatchId',protect,authorizeRoles('patient'),limiter(60),async(req,res)=>{
 res.set('Cache-Control','no-store');try{const result=await patientDispatchTracking(req.user.id,uuid(req.params.dispatchId));res.status(result.status).json({success:result.status===200,tracking:result.tracking});}catch(error){res.status(error.status||503).json({success:false,tracking:getAmbulanceTrackingStatus()});}
});
router.get('/', async (req, res) => {
  try {
    const [hospitals] = await pool.query('SELECT id, name, city, address, phone, emergency FROM hospitals ORDER BY name');
    res.set('Cache-Control', 'no-store').json({ success: true, hospitals, tracking: getAmbulanceTrackingStatus() });
  } catch { res.status(503).json({ success: false, message: 'Emergency directory unavailable. Contact your local emergency service directly.' }); }
});
export default router;
