import express from 'express';
import {
  getHospitals,
  createHospital,
} from '../controllers/hospitalController.js';
import { protect, authorizeRoles } from '../middleware/authMiddleware.js';

const router = express.Router();

router.route('/')
  .get(getHospitals)
  .post(protect, authorizeRoles('admin'), createHospital);

export default router;
