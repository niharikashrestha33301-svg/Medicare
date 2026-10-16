import express from 'express';
import {
  bookAppointment,
  getMyAppointments,
  updateAppointmentStatus,
  cancelAppointment,
} from '../controllers/appointmentController.js';
import { protect, authorizeRoles } from '../middleware/authMiddleware.js';

const router = express.Router();

router.route('/')
  .post(protect, authorizeRoles('patient'), bookAppointment);

router.route('/my')
  .get(protect, getMyAppointments);

router.route('/:id/status')
  .put(protect, authorizeRoles('doctor', 'admin'), updateAppointmentStatus);

router.route('/:id/cancel')
  .put(protect, cancelAppointment);

export default router;
