import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)) });

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'medicare_db',
  port: Number(process.env.DB_PORT) || 3306,
  connectTimeout: 10000,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

export const testConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('✅ MySQL Database Connected Successfully to ' + (process.env.DB_NAME || 'medicare_db'));
    connection.release();
  } catch (error) {
    console.error('❌ MySQL Connection Failed:', error.message);
    console.log('💡 Tip: Make sure your MySQL Server (e.g., XAMPP, WampServer, or MySQL Workbench) is running and medicare_db exists.');
  }
};

export default pool;
