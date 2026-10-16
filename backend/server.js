import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { testConnection } from './config/db.js';

// Route Imports
import authRoutes from './routes/authRoutes.js';
import supabaseAuthRoutes from './routes/supabaseAuthRoutes.js';
import labRoutes from './routes/labRoutes.js';
import doctorRoutes from './routes/doctorRoutes.js';
import hospitalRoutes from './routes/hospitalRoutes.js';
import appointmentRoutes from './routes/appointmentRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import assistantRoutes from './routes/assistantRoutes.js';
import pool from './config/db.js';
import healthRoutes from './routes/healthRoutes.js';
import emergencyRoutes from './routes/emergencyRoutes.js';
import ambulanceRoutes from './routes/ambulanceRoutes.js';
import { jwtSecret } from './config/security.js';
import medicineRoutes from './routes/medicineRoutes.js';
import { startMedicineWorker } from './services/medicineWorker.js';
import videoRoutes from './routes/videoRoutes.js';
import pharmacyRoutes from './routes/pharmacyRoutes.js';
import {paymentWebhook} from './services/pharmacyPayments.js';
import {ensureCareSchema} from './services/careSchema.js';
import {startCareMaintenance} from './services/careMaintenance.js';

dotenv.config();

const app = express();
app.disable('x-powered-by');
jwtSecret();

// Middlewares
app.use(cors({
  origin: (origin, callback) => {
    const allowed = (process.env.CORS_ORIGINS || 'http://localhost:5000,http://localhost:5173,http://localhost:4173,http://127.0.0.1:5000,http://127.0.0.1:5173').split(',').map(value => value.trim());
    if (process.env.NODE_ENV !== 'production') {
      for (const host of ['localhost', '127.0.0.1', '[::1]']) for (const port of [5500, 5501]) allowed.push(`http://${host}:${port}`);
    }
    callback(null, !origin || allowed.includes(origin));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use('/api/health-dashboard', healthRoutes);
app.post('/api/pharmacy/payment-webhook',express.raw({type:'application/json',limit:'100kb'}),(req,res,next)=>ensureCareSchema().then(()=>paymentWebhook(req,res)).catch(next));
app.use('/api/pharmacy/inventory',express.json({limit:'1500kb'}));
app.use(express.json());
app.use('/api', (req, res, next) => { res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); next(); });

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/supabase-auth',supabaseAuthRoutes);
app.use('/api/doctors', doctorRoutes);
app.use('/api/hospitals', hospitalRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/lab-bookings',labRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/assistant', assistantRoutes);
app.use('/api/emergency', emergencyRoutes);
app.use('/api/ambulance',ambulanceRoutes);
app.use('/api/medicine-reminders', medicineRoutes);
app.use('/api/consultations',videoRoutes);
app.use('/api/pharmacy',pharmacyRoutes);
if(process.env.CARE_MAINTENANCE_ENABLED!=='false')startCareMaintenance();
if (process.env.MEDICINE_WORKER_ENABLED !== 'false') startMedicineWorker();
// Expired health chats are removed even when no user opens the assistant.
const assistantRetention = setInterval(() => {
  pool.query('DELETE FROM assistant_conversations WHERE expires_at <= NOW()').catch(() => {});
}, 60 * 60 * 1000);
assistantRetention.unref();

// Serve the main application from the same origin as the API.
const projectRoot = fileURLToPath(new URL('../', import.meta.url));
app.use('/pharmacy-products',express.static(path.join(projectRoot,'frontend/public/pharmacy-products')));
app.use('/images', express.static(path.join(projectRoot, 'frontend/public/images')));
app.use('/frontend/public', express.static(path.join(projectRoot, 'frontend/public')));
for (const asset of ['pharmacy-product.html','pharmacy-product.js','pharmacy-catalogue.js','pharmacy.css','pharmacy-orders.html','pharmacy-demo.svg','ambulance-provider.html','ambulance-provider.js','test-bookings.html','test-bookings.js','consultations.html','consultations.js','pharmacy.html','pharmacy.js','care.css','care-page.js','health.html', 'health-dashboard.css', 'health-dashboard.js', 'health-connections.js', 'portal-api.js', 'emergency.html', 'emergency.css', 'emergency.js', 'medicines.html', 'medicines.css', 'medicines.js', 'medicine-sw.js', 'medicine.webmanifest', 'medicine-icon.svg']) {
  app.get('/' + asset, (req, res) => res.sendFile(path.join(projectRoot, 'frontend/public', asset)));
}
app.get('/', (req, res) => res.sendFile(path.join(projectRoot, 'index.html')));
for (const page of ['index.html', 'patient.html', 'doctor.html', 'admin.html']) {
  app.get('/' + page, (req, res) => res.sendFile(path.join(projectRoot, page)));
}

// Root Healthcheck
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
  } catch {
    return res.status(503).json({ status: 'Unavailable', message: 'MySQL is unavailable. Start MySQL in XAMPP, then retry.' });
  }
  res.json({
    message: 'Medicare+ Healthcare API Running with MySQL Database',
    status: 'Healthy',
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.status === 400 ? 'Invalid request body.' : err.status === 413 ? 'Request is too large.' : 'The request could not be completed. Please retry.'
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, async () => {
  console.log(`🏥 Medicare+ MySQL Server listening on http://localhost:${PORT}`);
  await testConnection();
});
