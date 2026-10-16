import pool from '../config/db.js';
import { seedDemoDoctors } from '../seedDemoDoctors.js';

const connection = await pool.getConnection();
try {
  await seedDemoDoctors(connection);
  const [[result]] = await connection.query("SELECT COUNT(*) AS count FROM doctors d JOIN users u ON u.id = d.user_id WHERE u.email LIKE 'directory-demo-%@example.invalid'");
  if (result.count !== 1000) throw new Error(`Expected 1000 demo doctors; found ${result.count}`);
  console.log('Verified: 1000 additional demo doctors saved.');
} finally {
  connection.release();
  await pool.end();
}
