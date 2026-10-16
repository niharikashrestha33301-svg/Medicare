import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { seedAdditionalDoctors } from './seedAdditionalDoctors.js';
import { seedDemoDoctors } from './seedDemoDoctors.js';
import { seedAdditionalHospitals } from './seedAdditionalHospitals.js';

dotenv.config();

async function seedDatabase() {
  console.log('🚀 Starting Medicare+ MySQL Database Seeding...');
  
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    port: Number(process.env.DB_PORT) || 3306
  });

  const dbName = process.env.DB_NAME || 'medicare_db';

  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\`;`);
  await connection.query(`USE \`${dbName}\`;`);
  console.log(`✅ Using database: ${dbName}`);

  // Tables
  await connection.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      email VARCHAR(191) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      phone VARCHAR(30),
      role ENUM('patient', 'doctor', 'admin') DEFAULT 'patient',
      status ENUM('Active', 'Suspended') DEFAULT 'Active',
      dob DATE NULL,
      gender ENUM('Male', 'Female', 'Other') DEFAULT 'Other',
      blood_group VARCHAR(10) DEFAULT 'O+',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS hospitals (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      city VARCHAR(100) NOT NULL,
      address VARCHAR(255) NOT NULL,
      phone VARCHAR(50) NOT NULL,
      emergency VARCHAR(100) DEFAULT '24/7 Emergency Care',
      beds VARCHAR(50) DEFAULT '200 Beds',
      image VARCHAR(500),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS hospital_departments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      hospital_id INT NOT NULL,
      department_name VARCHAR(100) NOT NULL,
      FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS doctors (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      specialization VARCHAR(100) NOT NULL,
      license_no VARCHAR(100) NOT NULL UNIQUE,
      qualifications VARCHAR(255) NOT NULL,
      experience VARCHAR(50) DEFAULT '5 Years Exp',
      consultation_fee DECIMAL(10, 2) NOT NULL DEFAULT 499,
      currency CHAR(3) NOT NULL DEFAULT 'INR',
      hospital_id INT NOT NULL,
      about TEXT,
      verified BOOLEAN DEFAULT TRUE,
      image VARCHAR(500),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE RESTRICT
    ) ENGINE=InnoDB;
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS doctor_slots (
      id INT AUTO_INCREMENT PRIMARY KEY,
      doctor_id INT NOT NULL,
      slot_time VARCHAR(20) NOT NULL,
      FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS appointments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      appointment_code VARCHAR(50) NOT NULL UNIQUE,
      patient_id INT NULL,
      doctor_id INT NOT NULL,
      hospital_id INT NOT NULL,
      patient_name VARCHAR(150) NOT NULL,
      patient_email VARCHAR(191) NOT NULL,
      patient_phone VARCHAR(30) NOT NULL,
      patient_age INT DEFAULT 30,
      patient_gender ENUM('Male', 'Female', 'Other') DEFAULT 'Male',
      appointment_date DATE NOT NULL,
      time_slot VARCHAR(20) NOT NULL,
      symptoms TEXT,
      status ENUM('Pending', 'Confirmed', 'Completed', 'Cancelled') DEFAULT 'Confirmed',
      fee DECIMAL(10, 2) NOT NULL,
      currency CHAR(3) NOT NULL DEFAULT 'INR',
      cancel_reason VARCHAR(255) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE,
      FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE RESTRICT
    ) ENGINE=InnoDB;
  `);
  console.log('✅ Tables created successfully.');

  // Users
  const hashedAdminPass   = await bcrypt.hash('admin123', 10);
  const hashedDoctorPass  = await bcrypt.hash('doctor123', 10);
  const hashedPatientPass = await bcrypt.hash('patient123', 10);

  await connection.query(`
    INSERT IGNORE INTO users (name, email, password, phone, role, status) VALUES
    ('System Administrator',    'admin@medicare.com',            ?, '+1 (800) 555-0199', 'admin',   'Active'),
    ('Aayush Sharma',           'aayush.sharma@example.com',     ?, '+91 98765 43210',   'patient', 'Active'),
    ('Dr. Sanjeev Acharya',     'dr.sanjeev@medicare.com',       ?, '+91 98001 11234',   'doctor',  'Active'),
    ('Dr. Sameer Khadka',       'dr.sameer@medicare.com',        ?, '+91 98001 22345',   'doctor',  'Active'),
    ('Dr. Reet Poudel',         'dr.reet@medicare.com',          ?, '+91 98001 33456',   'doctor',  'Active'),
    ('Dr. Samir Poudel',        'dr.samir@medicare.com',         ?, '+91 98001 44567',   'doctor',  'Active'),
    ('Dr. Priya Sharma',        'dr.priya@medicare.com',         ?, '+91 98001 55678',   'doctor',  'Active'),
    ('Dr. Arjun Mehta',         'dr.arjun@medicare.com',         ?, '+91 98001 66789',   'doctor',  'Active'),
    ('Dr. Kavitha Nair',        'dr.kavitha@medicare.com',       ?, '+91 98001 77890',   'doctor',  'Active'),
    ('Dr. Rohit Gupta',         'dr.rohit@medicare.com',         ?, '+91 98001 88901',   'doctor',  'Active'),
    ('Dr. Sowji Reddy',         'dr.ananya@medicare.com',        ?, '+91 98001 99012',   'doctor',  'Active'),
    ('Dr. Vikram Singh',        'dr.vikram@medicare.com',        ?, '+91 98002 10123',   'doctor',  'Active');
  `, [
    hashedAdminPass, hashedPatientPass,
    hashedDoctorPass, hashedDoctorPass, hashedDoctorPass, hashedDoctorPass,
    hashedDoctorPass, hashedDoctorPass, hashedDoctorPass, hashedDoctorPass,
    hashedDoctorPass, hashedDoctorPass
  ]);

  // Hospitals
  await connection.query(`
    INSERT IGNORE INTO hospitals (id, name, city, address, phone, emergency, beds, image) VALUES
    (1, 'City Care Central Hospital',        'New Delhi',  '450 Health Avenue, Connaught Place',        '+91 11 4567 8901', '24/7 Trauma Care',       '350 Beds', 'https://images.unsplash.com/photo-1587351021759-3e566b6af7cc?w=600&auto=format&fit=crop&q=80'),
    (2, 'Apollo Heart & Specialty Center',   'Mumbai',     '720 Apollo Road, Bandra West',              '+91 22 6699 8899', 'Level 1 Cardiac Unit',   '220 Beds', 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=600&auto=format&fit=crop&q=80'),
    (3, 'Greenfield Family & Child Hospital','Bangalore',  '112 Greenfield Boulevard, Koramangala',     '+91 80 7777 1234', 'Pediatric Emergency 24/7','180 Beds', 'https://images.unsplash.com/photo-1516549655169-df83a0774514?w=600&auto=format&fit=crop&q=80');
  `);

  // Departments
  await connection.query(`
    INSERT IGNORE INTO hospital_departments (hospital_id, department_name) VALUES
    (1, 'Cardiology'), (1, 'Nephrology'), (1, 'Dermatology'), (1, 'Orthopedics'), (1, 'General Medicine'), (1, 'Neurology'),
    (2, 'Cardiology'), (2, 'Internal Medicine'), (2, 'Radiology'), (2, 'Oncology'),
    (3, 'Pediatrics'), (3, 'Dermatology'), (3, 'Psychiatry'), (3, 'ENT'), (3, 'Gynecology');
  `);

  // Doctors (4 original + 6 new Indian)
  await connection.query(`
    INSERT IGNORE INTO doctors (id, user_id, specialization, license_no, qualifications, experience, consultation_fee, hospital_id, about, verified, image) VALUES
    (1,  3,  'Nephrology',       'MED-8492', 'MBBS, MD (Nephrology), Senior Consultant',        '14 Years Exp', 499.00,  1, 'Senior Nephrologist specializing in renal health, hypertension, and dialysis.', TRUE, 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=400&auto=format&fit=crop&q=80'),
    (2,  4,  'Dermatology',      'MED-9201', 'MBBS, MD (Dermatology)',                          '11 Years Exp', 499.00,  3, 'Consultant Dermatologist treating skin disorders, acne therapy, and allergy care.', TRUE, 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=400&auto=format&fit=crop&q=80'),
    (3,  5,  'Psychiatry',       'MED-6734', 'MBBS, MD (Psychiatry), Fellowship Oxford',        '16 Years Exp', 499.00,  1, 'Senior Psychiatrist providing clinical assessments, therapy, and cognitive counseling.', TRUE, 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=400&auto=format&fit=crop&q=80'),
    (4,  6,  'Cardiology',       'MED-5512', 'MBBS, MD, DM (Cardiology), FACC',                '15 Years Exp', 499.00,  2, 'Cardiologist specializing in cardiovascular care, ECG diagnostics, and preventive cardiology.', TRUE, 'https://images.unsplash.com/photo-1582750433449-648ed127bb54?w=400&auto=format&fit=crop&q=80'),
    (5,  7,  'Gynecology',       'MED-IND1', 'MBBS, MS (Obstetrics & Gynecology), AIIMS Delhi', '12 Years Exp', 499.00,  3, 'Specialist in women''s health, prenatal care, high-risk pregnancies, and laparoscopic surgery.', TRUE, 'https://images.unsplash.com/photo-1651008376811-b90baee60c1f?w=400&auto=format&fit=crop&q=80'),
    (6,  8,  'Orthopedics',      'MED-IND2', 'MBBS, MS (Orthopedics), FRCS',                   '18 Years Exp', 499.00,  1, 'Orthopedic surgeon specializing in joint replacement, spine surgery, and sports injury care.', TRUE, 'https://images.unsplash.com/photo-1537368910025-700350fe46c7?w=400&auto=format&fit=crop&q=80'),
    (7,  9,  'General Medicine',  'MED-IND3', 'MBBS, MD (Internal Medicine), PGIMER',           '9 Years Exp',  499.00,  2, 'General physician managing chronic diseases, lifestyle disorders, and preventive healthcare.', TRUE, 'https://images.unsplash.com/photo-1594824813575-430b35583f73?w=400&auto=format&fit=crop&q=80'),
    (8,  10, 'Neurology',        'MED-IND4', 'MBBS, MD, DM (Neurology), Manipal Hospital',     '13 Years Exp', 499.00, 1, 'Neurologist treating epilepsy, migraines, Parkinson''s disease, and stroke rehabilitation.', TRUE, 'https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=400&auto=format&fit=crop&q=80'),
    (9,  11, 'Pediatrics',       'MED-IND5', 'MBBS, MD (Pediatrics), DCH, CMC Vellore',        '10 Years Exp', 499.00,  3, 'Pediatrician focused on child development, vaccination programs, and infant wellness.', TRUE, 'https://images.unsplash.com/photo-1559757175-5700dde675bc?w=400&auto=format&fit=crop&q=80'),
    (10, 12, 'Cardiology',       'MED-IND6', 'MBBS, MD, DM (Cardiology), Interventional',      '20 Years Exp', 499.00, 2, 'Interventional Cardiologist with expertise in angioplasty, stenting, and cardiac catheterization.', TRUE, '/images/dr-sowji-reddy.jpeg');
  `);

  // Slots
  await connection.query(`
    INSERT IGNORE INTO doctor_slots (doctor_id, slot_time) VALUES
    (1,'09:00 AM'),(1,'09:45 AM'),(1,'10:30 AM'),(1,'02:00 PM'),(1,'03:00 PM'),
    (2,'10:00 AM'),(2,'11:00 AM'),(2,'01:30 PM'),(2,'04:00 PM'),
    (3,'09:30 AM'),(3,'11:00 AM'),(3,'02:00 PM'),(3,'03:30 PM'),
    (4,'08:30 AM'),(4,'09:30 AM'),(4,'11:00 AM'),(4,'04:30 PM'),
    (5,'09:00 AM'),(5,'10:30 AM'),(5,'12:00 PM'),(5,'02:00 PM'),(5,'04:00 PM'),
    (6,'08:00 AM'),(6,'09:00 AM'),(6,'10:30 AM'),(6,'01:00 PM'),(6,'03:00 PM'),
    (7,'09:00 AM'),(7,'10:00 AM'),(7,'11:30 AM'),(7,'02:30 PM'),(7,'04:30 PM'),
    (8,'10:00 AM'),(8,'11:30 AM'),(8,'02:00 PM'),(8,'04:00 PM'),
    (9,'08:30 AM'),(9,'09:30 AM'),(9,'11:00 AM'),(9,'01:30 PM'),(9,'03:00 PM'),
    (10,'09:00 AM'),(10,'10:30 AM'),(10,'12:00 PM'),(10,'02:00 PM'),(10,'05:00 PM');
  `);

  // Appointment
  await connection.query(`
    INSERT IGNORE INTO appointments (appointment_code, patient_id, doctor_id, hospital_id, patient_name, patient_email, patient_phone, patient_age, patient_gender, appointment_date, time_slot, symptoms, status, fee) VALUES
    ('APT-1082', 2, 1, 1, 'Aayush Sharma', 'aayush.sharma@example.com', '+91 98765 43210', 32, 'Male', '2026-08-25', '09:45 AM', 'Kidney checkup & blood pressure evaluation', 'Confirmed', 499.00);
  `);

  console.log('🎉 Medicare+ MySQL Database Successfully Initialized and Seeded!');
  await seedAdditionalDoctors(connection);
  await seedAdditionalHospitals(connection);
  await seedDemoDoctors(connection);
  await connection.end();
}

seedDatabase().catch(err => {
  console.error('❌ Seeding Error:', err.message);
  process.exit(1);
});
