import pool from '../config/db.js';
import {ensureCareSchema} from '../services/careSchema.js';
try{await ensureCareSchema();console.log('Video consultation and pharmacy tables are ready. Existing patient data was preserved. No inventory or external credentials were added.');}
finally{await pool.end();}
