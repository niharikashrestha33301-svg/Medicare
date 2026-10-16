export const INITIAL_HOSPITALS = [
  {
    id: 'hosp-1',
    name: 'Metro City General Hospital',
    city: 'Central District',
    address: '450 Healthcare Avenue, Ward 4',
    phone: '+977-1-4567890',
    emergency: '24/7 Trauma Care',
    departments: ['Nephrology', 'Cardiology', 'Dermatology', 'Orthopedics', 'General Medicine'],
    doctorsCount: 48,
    beds: '350 Beds',
    image: 'https://images.unsplash.com/photo-1587351021759-3e566b6af7cc?w=600&auto=format&fit=crop&q=80'
  },
  {
    id: 'hosp-2',
    name: 'St. Jude Heart & Specialty Center',
    city: 'Westside',
    address: '720 Saint Jude Way',
    phone: '+977-1-4433221',
    emergency: 'Level 1 Cardiac Unit',
    departments: ['Cardiology', 'Internal Medicine', 'Radiology'],
    doctorsCount: 32,
    beds: '220 Beds',
    image: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=600&auto=format&fit=crop&q=80'
  },
  {
    id: 'hosp-3',
    name: 'Greenfield Family Hospital',
    city: 'North Suburb',
    address: '112 Greenfield Boulevard',
    phone: '+977-1-4777123',
    emergency: 'Pediatric Emergency Care',
    departments: ['Pediatrics', 'Dermatology', 'Psychiatry', 'ENT'],
    doctorsCount: 26,
    beds: '180 Beds',
    image: 'https://images.unsplash.com/photo-1516549655169-df83a0774514?w=600&auto=format&fit=crop&q=80'
  }
];

export const INITIAL_DOCTORS = [
  {
    id: 'doc-1',
    name: 'Dr. Sanjeev Acharya',
    email: 'dr.sanjeev@medicare.com',
    specialization: 'Nephrologist',
    licenseNo: 'NMC-8492',
    qualifications: 'MBBS, MD (Nephrology), Consultant',
    experience: '14 Years Exp',
    consultationFee: 499,
    hospital: 'Metro City General Hospital',
    hospitalId: 'hosp-1',
    image: 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=400&auto=format&fit=crop&q=80',
    about: 'Senior Nephrologist specializing in chronic kidney disease, renal diagnostics, hypertension, and dialysis therapy.',
    verified: true,
    nextAvailable: 'Tomorrow, 09:30 AM',
    slots: ['09:00 AM', '09:30 AM', '10:15 AM', '11:00 AM', '01:30 PM', '02:30 PM']
  },
  {
    id: 'doc-2',
    name: 'Dr. Sameer Khadka',
    email: 'dr.sameer@medicare.com',
    specialization: 'Dermatologist',
    licenseNo: 'NMC-9201',
    qualifications: 'MBBS, MD (Dermatology), IADVL',
    experience: '11 Years Exp',
    consultationFee: 499,
    hospital: 'Greenfield Family Hospital',
    hospitalId: 'hosp-3',
    image: 'https://images.unsplash.com/photo-1537368910025-700350fe46c7?w=400&auto=format&fit=crop&q=80',
    about: 'Consultant Dermatologist treating eczema, acne scar management, psoriasis, and skin allergies.',
    verified: true,
    nextAvailable: 'Today, 03:00 PM',
    slots: ['10:00 AM', '11:00 AM', '01:30 PM', '03:00 PM', '04:00 PM']
  },
  {
    id: 'doc-3',
    name: 'Dr. Reet Poudel',
    email: 'dr.reet@medicare.com',
    specialization: 'Psychiatrist',
    licenseNo: 'NMC-6734',
    qualifications: 'MBBS, MD (Psychiatry), Fellowship Oxford',
    experience: '16 Years Exp',
    consultationFee: 499,
    hospital: 'Metro City General Hospital',
    hospitalId: 'hosp-1',
    image: 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=400&auto=format&fit=crop&q=80',
    about: 'Senior Consultant Psychiatrist providing clinical diagnosis, stress counseling, anxiety management, and therapy.',
    verified: true,
    nextAvailable: 'Tomorrow, 11:00 AM',
    slots: ['09:30 AM', '11:00 AM', '02:00 PM', '03:30 PM']
  },
  {
    id: 'doc-4',
    name: 'Dr. Samir Poudel',
    email: 'dr.samir@medicare.com',
    specialization: 'Cardiologist',
    licenseNo: 'NMC-5512',
    qualifications: 'MBBS, MD, DM (Cardiology), FESC',
    experience: '15 Years Exp',
    consultationFee: 499,
    hospital: 'St. Jude Heart & Specialty Center',
    hospitalId: 'hosp-2',
    image: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=400&auto=format&fit=crop&q=80',
    about: 'Cardiologist specializing in cardiovascular assessments, ECG evaluations, echocardiograms, and preventive heart health.',
    verified: true,
    nextAvailable: 'Today, 04:30 PM',
    slots: ['08:30 AM', '09:30 AM', '11:00 AM', '02:00 PM', '04:30 PM']
  }
];

export const INITIAL_APPOINTMENTS = [
  {
    id: 'APT-1091',
    patientName: 'Aayush Sharma',
    patientEmail: 'aayush.sharma@example.com',
    patientPhone: '+977-9841234567',
    patientAge: 32,
    patientGender: 'Male',
    doctorName: 'Dr. Sanjeev Acharya',
    doctorEmail: 'dr.sanjeev@medicare.com',
    specialization: 'Nephrologist',
    hospitalName: 'Metro City General Hospital',
    date: '2026-08-23',
    timeSlot: '09:30 AM',
    symptoms: 'Routine kidney function follow-up and blood pressure check.',
    status: 'Confirmed',
    fee: 499,
    createdAt: '2026-08-20T10:00:00Z'
  }
];

export const SPECIALTY_OPTIONS = [
  'All',
  'Nephrology',
  'Dermatology',
  'Psychiatry',
  'Cardiology',
  'Pediatrics',
  'Orthopedics',
  'General Medicine',
  "General Surgery",
  "Neurology",
  "Endocrinology",
  "Allergy & Immunology",
  "Anesthesiology",
  "Gastroenterology",
  "Geriatrics",
  "Gynecology"
];
