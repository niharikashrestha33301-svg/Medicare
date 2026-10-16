import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../config/db.js';
import { DEFAULT_CONSULTATION_FEE } from '../config/currency.js';
import { jwtSecret } from '../config/security.js';
import { string, date, id, badRequest, fail } from '../utils/validation.js';
import { randomUUID } from 'node:crypto';

// Generate JWT Token
const generateToken = (id, role) => {
    return jwt.sign({ id, role }, jwtSecret(), {
    expiresIn: '12h', algorithm: 'HS256'
  });
};

// @desc   Register User (Patient or Doctor)
// @route  POST /api/auth/register
export const register = async (req, res) => {
  let connection;
  try {
    const { name, email, password, phone = '', role = 'patient', dob, gender, bloodGroup, specialization, licenseNo, qualifications, experience, consultationFee, hospitalId, about } = req.body;

    if (typeof name !== 'string' || !name.trim() || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ success: false, message: 'Provide a name, valid email, and password of at least 8 characters' });
    }
    if (!(req.adminRegistration ? ['patient', 'doctor', 'admin'] : ['patient', 'doctor']).includes(role)) return res.status(400).json({ success: false, message: 'Choose patient or doctor registration' });
    if (role === 'admin' && password.length < 12) throw badRequest('Administrator passwords must have at least 12 characters.');
    string(name, 'name', 150); string(email, 'email', 191); string(phone, 'phone', 30, false);
    if (Buffer.byteLength(password, 'utf8') > 72) throw badRequest('Password must be at most 72 bytes.');
    if (dob) date(dob);
    const age = req.body.age === undefined || req.body.age === '' ? null : Number(req.body.age);
    if (age !== null && (!Number.isInteger(age) || age < 0 || age > 130)) throw badRequest('Enter a valid age.');
    if (gender && !['Male', 'Female', 'Other'].includes(gender)) throw badRequest('Invalid gender.');
    if (bloodGroup && !['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'].includes(bloodGroup)) throw badRequest('Invalid blood group.');
    if (role === 'doctor') {
      string(specialization || 'General Physician', 'specialization', 100);
      string(licenseNo || 'generated', 'license number', 100);
      string(qualifications || 'MBBS', 'qualifications', 255);
      string(experience || '0 Years', 'experience', 50);
      string(about || '', 'about', 5000, false);
      if (consultationFee !== undefined && (!Number.isFinite(Number(consultationFee)) || Number(consultationFee) < 0 || Number(consultationFee) > 999999)) throw badRequest('Invalid consultation fee.');
      const [hospitals] = await pool.query('SELECT id FROM hospitals WHERE id = ?', [id(hospitalId || 1, 'hospital')]);
      if (!hospitals.length) throw badRequest('Choose an existing hospital.');
    }
    jwtSecret();

    // Check if user exists
    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email.trim().toLowerCase()]);
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'User with this email already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    connection = await pool.getConnection();
    await connection.beginTransaction();
    // User and doctor profile are committed together.
    const [userResult] = await connection.query(
      'INSERT INTO users (name, email, password, phone, role, dob, age, gender, blood_group) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [name.trim(), email.trim().toLowerCase(), hashedPassword, phone, role, dob || null, age, gender || 'Other', bloodGroup || 'Unknown']
    );

    const userId = userResult.insertId;

    // If role is doctor, insert into doctors table
    if (role === 'doctor') {
      const [docResult] = await connection.query(
        `INSERT INTO doctors (user_id, specialization, license_no, qualifications, experience, consultation_fee, hospital_id, about, verified)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, FALSE)`,
        [userId, specialization || 'General Physician', licenseNo || `MED-${randomUUID()}`, qualifications || 'MBBS', experience || '0 Years', consultationFee ?? DEFAULT_CONSULTATION_FEE, hospitalId || 1, about || '']
      );

      // Add default slots
      const doctorId = docResult.insertId;
      const defaultSlots = ['09:00 AM', '10:00 AM', '11:30 AM', '02:00 PM', '03:30 PM'];
      for (const slot of defaultSlots) {
        await connection.query('INSERT INTO doctor_slots (doctor_id, slot_time) VALUES (?, ?)', [doctorId, slot]);
      }
    }

    const token = generateToken(userId, role);
    await connection.commit();

    res.status(201).json({
      success: true,
      token,
      user: {
        id: userId,
        name,
        email: email.trim().toLowerCase(),
        role
      }
    });
  } catch (error) {
    if (connection) await connection.rollback();
    fail(res, error);
  } finally {
    connection?.release();
  }
};

// @desc   Login User
// @route  POST /api/auth/login
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (typeof email !== 'string' || !email.trim() || typeof password !== 'string' || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email.trim().toLowerCase()]);
    if (users.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const user = users[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    if (user.status === 'Suspended') {
      return res.status(403).json({ success: false, message: 'Account is suspended. Contact admin.' });
    }

    const token = generateToken(user.id, user.role);

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        age: user.age,
        role: user.role,
        gender: user.gender,
        bloodGroup: user.blood_group
      }
    });
  } catch (error) {
    fail(res, error);
  }
};

// @desc   Get Current Profile
// @route  GET /api/auth/me
export const getMe = async (req, res) => {
  try {
    const [users] = await pool.query('SELECT id, name, email, phone, role, status, dob, age, gender, blood_group FROM users WHERE id = ?', [req.user.id]);
    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, user: { ...users[0], bloodGroup: users[0].blood_group } });
  } catch (error) {
    fail(res, error);
  }
};

export const updateMe = async (req, res) => {
  try {
    const name = string(req.body.name, 'name', 150), phone = string(req.body.phone || '', 'phone', 30, false);
    const dob = req.body.dob ? date(req.body.dob) : null, gender = req.body.gender || 'Other', group = req.body.bloodGroup || 'Unknown';
    const age = req.body.age === undefined || req.body.age === '' ? null : Number(req.body.age);
    if (age !== null && (!Number.isInteger(age) || age < 0 || age > 130)) throw badRequest('Enter a valid age.');
    if (!['Male', 'Female', 'Other'].includes(gender) || !['A+','A-','B+','B-','AB+','AB-','O+','O-','Unknown'].includes(group)) throw badRequest('Invalid profile fields.');
    await pool.query('UPDATE users SET name = ?, phone = ?, dob = ?, age = COALESCE(?, age), gender = ?, blood_group = ? WHERE id = ?', [name, phone, dob, age, gender, group, req.user.id]);
    return getMe(req, res);
  } catch (error) { fail(res, error); }
};
