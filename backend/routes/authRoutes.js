import express from 'express';
import { register, login, getMe, updateMe } from '../controllers/authController.js';
import { loginLimiter } from '../middleware/loginLimiter.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/register', loginLimiter, register);
router.post('/login', loginLimiter, login);
router.get('/me', protect, getMe);
router.put('/me', protect, updateMe);

export default router;
