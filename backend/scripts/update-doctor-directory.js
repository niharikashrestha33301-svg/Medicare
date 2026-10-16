import pool from '../config/db.js';
import { seedAdditionalDoctors } from '../seedAdditionalDoctors.js';

const connection = await pool.getConnection();
try {
  await seedAdditionalDoctors(connection);
  console.log('Updated demo doctor profiles and photos.');
} finally {
  connection.release();
  await pool.end();
}
