import express from 'express';
import {
  getAllUsers,
  toggleUserStatus,
  toggleDoctorVerification,
  getAllAppointments,reviewDoctor
} from '../controllers/adminController.js';
import { protect, authorizeRoles } from '../middleware/authMiddleware.js';
import { register } from '../controllers/authController.js';
import {getDoctors} from '../controllers/doctorController.js';

const router = express.Router();

router.use(protect, authorizeRoles('admin'));

router.get('/users', getAllUsers);
router.post('/users', (req, res, next) => { req.adminRegistration = true; next(); }, register);
router.put('/users/:id/status', toggleUserStatus);
router.put('/doctors/:id/verify', toggleDoctorVerification);
router.get('/doctors',(req,res,next)=>{req.adminDirectory=true;next();},getDoctors);
router.put('/doctors/:id/review',(req,res)=>reviewDoctor(req,res));
router.get('/appointments', getAllAppointments);

export default router;
