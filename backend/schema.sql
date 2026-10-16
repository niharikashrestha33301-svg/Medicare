-- ====================================================================
-- MEDICARE+ HEALTHCARE SYSTEM: MYSQL RELATIONAL DATABASE SCHEMA
-- ====================================================================

CREATE DATABASE IF NOT EXISTS medicare_db;
USE medicare_db;

-- 1. USERS TABLE (Patients, Doctors, Admins)
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    email VARCHAR(191) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    phone VARCHAR(30),
    role ENUM('patient', 'doctor', 'admin') DEFAULT 'patient',
    status ENUM('Active', 'Suspended') DEFAULT 'Active',
    dob DATE NULL,
    age INT NULL,
    gender ENUM('Male', 'Female', 'Other') DEFAULT 'Other',
    blood_group VARCHAR(10) DEFAULT 'O+',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. HOSPITALS TABLE
CREATE TABLE IF NOT EXISTS hospitals (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    city VARCHAR(100) NOT NULL,
    address VARCHAR(255) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    emergency VARCHAR(100) DEFAULT '24/7 Emergency Care',
    beds VARCHAR(50) DEFAULT '200 Beds',
    image VARCHAR(500) DEFAULT 'https://images.unsplash.com/photo-1587351021759-3e566b6af7cc?w=600&auto=format&fit=crop&q=80',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. HOSPITAL DEPARTMENTS TABLE
CREATE TABLE IF NOT EXISTS hospital_departments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    hospital_id INT NOT NULL,
    department_name VARCHAR(100) NOT NULL,
    FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. DOCTORS TABLE
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
    image VARCHAR(500) DEFAULT 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=400&auto=format&fit=crop&q=80',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. DOCTOR AVAILABLE TIME SLOTS TABLE
CREATE TABLE IF NOT EXISTS doctor_slots (
    id INT AUTO_INCREMENT PRIMARY KEY,
    doctor_id INT NOT NULL,
    slot_time VARCHAR(20) NOT NULL,
    FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. APPOINTMENTS TABLE
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
