import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

const portraits = JSON.parse(readFileSync(new URL('./data/demoPortraits.json', import.meta.url), 'utf8'));

export async function seedDemoDoctors(connection) {
  const firstNames = ['Aarav', 'Aditi', 'Aditya', 'Ananya', 'Anil', 'Anita', 'Arnav', 'Avni', 'Deepak', 'Devika', 'Dhruv', 'Diya', 'Gaurav', 'Ishaan', 'Ishita', 'Karan', 'Kavya', 'Kiran', 'Krishna', 'Manav', 'Meera', 'Mohan', 'Naina', 'Nakul', 'Neha', 'Nikhil', 'Pallavi', 'Pranav', 'Pooja', 'Rahul', 'Riya', 'Rohan', 'Sahil', 'Sana', 'Shreya', 'Sneha', 'Tanvi', 'Varun', 'Vikram', 'Zoya'];
  const lastNames = ['Agarwal', 'Bhat', 'Bose', 'Chandra', 'Das', 'Desai', 'Gupta', 'Iyer', 'Jain', 'Joshi', 'Kapoor', 'Kumar', 'Malhotra', 'Menon', 'Mishra', 'Nair', 'Patel', 'Rao', 'Reddy', 'Sen', 'Shah', 'Sharma', 'Singh', 'Verma', 'Yadav'];
  const specialties = ['General Physician', 'General Surgery', 'Pediatrics', 'Psychiatry', 'Neurology', 'Dermatology', 'Endocrinology', 'Allergy & Immunology', 'Anesthesiology', 'Cardiology', 'Gastroenterology', 'Geriatrics', 'Nephrology', 'Orthopedics'];
  const [hospitals] = await connection.query('SELECT id FROM hospitals ORDER BY id');
  if (!hospitals.length) throw new Error('Create hospitals before adding demo doctors');
  const password = await bcrypt.hash(randomUUID(), 10);
  const users = [];
  for (let i = 0; i < 1000; i++) {
    users.push([`Dr. ${firstNames[i % firstNames.length]} ${lastNames[Math.floor(i / firstNames.length)]}`, `directory-demo-${i + 1}@example.invalid`, password, 'doctor']);
  }
  await connection.beginTransaction();
  try {
    await connection.query('INSERT INTO users (name, email, password, role) VALUES ? ON DUPLICATE KEY UPDATE name = VALUES(name)', [users]);
    const [rows] = await connection.query('SELECT id, email FROM users WHERE email IN (?)', [users.map(user => user[1])]);
    const ids = new Map(rows.map(user => [user.email, user.id]));
    const doctors = users.map((user, i) => [ids.get(user[1]), specialties[i % specialties.length], `DIRECTORY-DEMO-${i + 1}`, 'MBBS (Demo)', `${3 + i % 23} Years Experience`, 499, hospitals[i % hospitals.length].id, 'Fictional demo profile for browsing and testing.', false, portraits[i % portraits.length]]);
    await connection.query('INSERT IGNORE INTO doctors (user_id, specialization, license_no, qualifications, experience, consultation_fee, hospital_id, about, verified, image) VALUES ?', [doctors]);
    for (let i = 0; i < users.length; i++) {
      await connection.query('UPDATE doctors SET image = ? WHERE user_id = ? AND license_no = ?', [portraits[i % portraits.length], ids.get(users[i][1]), `DIRECTORY-DEMO-${i + 1}`]);
    }
    await connection.query(`INSERT INTO doctor_slots (doctor_id, slot_time)
      SELECT d.id, slots.slot_time FROM doctors d
      JOIN users u ON u.id = d.user_id
      CROSS JOIN (SELECT '09:00 AM' AS slot_time UNION ALL SELECT '11:00 AM' UNION ALL SELECT '02:00 PM') slots
      WHERE u.email LIKE 'directory-demo-%@example.invalid'
      AND NOT EXISTS (SELECT 1 FROM doctor_slots existing WHERE existing.doctor_id = d.id AND existing.slot_time = slots.slot_time)`);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}
