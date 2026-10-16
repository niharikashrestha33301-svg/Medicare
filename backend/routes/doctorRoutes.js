import express from 'express';
import {
  getDoctors,
  getDoctorById,
  addSlot, removeSlot, updateDoctor
} from '../controllers/doctorController.js';
import { protect, authorizeRoles } from '../middleware/authMiddleware.js';
import {doctorAvailability} from '../services/doctorAvailability.js';
import {id,date,fail} from '../utils/validation.js';
import {limiter} from '../services/careSecurity.js';

const router = express.Router();
router.get('/:id/availability',limiter(120),async(req,res)=>{res.set('Cache-Control','no-store');try{res.json(await doctorAvailability(id(req.params.id),date(req.query.date)));}catch(error){fail(res,error);}});

router.route('/')
  .get(getDoctors);

router.route('/:id')
  .get(getDoctorById)
  .put(protect, authorizeRoles('doctor'), updateDoctor);

router.route('/:id/slots')
  .post(protect, authorizeRoles('doctor'), addSlot)
  .delete(protect, authorizeRoles('doctor'), removeSlot);

export default router;
