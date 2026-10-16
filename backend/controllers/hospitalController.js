import pool from '../config/db.js';
import { string, badRequest, fail } from '../utils/validation.js';

// @desc   Get All Hospitals with Departments
// @route  GET /api/hospitals
export const getHospitals = async (req, res) => {
  try {
    const [hospitals] = await pool.query('SELECT * FROM hospitals ORDER BY id ASC');

    for (const h of hospitals) {
      const [departments] = await pool.query('SELECT department_name FROM hospital_departments WHERE hospital_id = ?', [h.id]);
      h.departments = departments.map(d => d.department_name);
    }

    res.json({ success: true, count: hospitals.length, hospitals });
  } catch (error) {
    fail(res, error);
  }
};

// @desc   Create Hospital
// @route  POST /api/hospitals
export const createHospital = async (req, res) => {
  let connection;
  try {
    const { name, city, address, phone, emergency, beds, image, departments } = req.body;
    string(name, 'hospital name', 200); string(city, 'city', 100); string(address, 'address', 255); string(phone, 'phone', 50);
    string(emergency || '', 'emergency service', 100, false); string(beds || '', 'beds', 50, false);
    if (image && (typeof image !== 'string' || image.length > 500 || !/^(https:\/\/|\/images\/)/.test(image))) throw badRequest('Use a valid hospital image URL.');
    if (departments && (!Array.isArray(departments) || departments.length > 50 || departments.some(d => typeof d !== 'string' || !d.trim() || d.length > 100))) throw badRequest('Invalid hospital departments.');
    connection = await pool.getConnection(); await connection.beginTransaction();

    const [result] = await connection.query(
      'INSERT INTO hospitals (name, city, address, phone, emergency, beds, image) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [name, city, address, phone, emergency || '24/7 Emergency Care', beds || '200 Beds', image || 'https://images.unsplash.com/photo-1587351021759-3e566b6af7cc?w=600&auto=format&fit=crop&q=80']
    );

    const hospitalId = result.insertId;

    if (departments && Array.isArray(departments)) {
      for (const dept of departments) {
        await connection.query('INSERT INTO hospital_departments (hospital_id, department_name) VALUES (?, ?)', [hospitalId, dept.trim()]);
      }
    }

    await connection.commit();
    res.status(201).json({ success: true, message: 'Hospital created successfully', hospitalId });
  } catch (error) {
    if (connection) await connection.rollback(); fail(res, error);
  } finally { connection?.release(); }
};
