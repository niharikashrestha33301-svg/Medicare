import pool from '../config/db.js';
import { seedAdditionalHospitals } from '../seedAdditionalHospitals.js';

const connection = await pool.getConnection();
try {
  await seedAdditionalHospitals(connection);
  console.log('Saved the expanded demo hospital directory and departments.');
} finally {
  connection.release();
  await pool.end();
}
