const hospitals = [
  ['Lotus Multispeciality Hospital', 'Chennai', ['General Medicine', 'Cardiology', 'Neurology', 'General Surgery']],
  ['Sunrise Women & Child Hospital', 'Hyderabad', ['Gynecology', 'Pediatrics', 'General Medicine']],
  ['Harmony Heart & Vascular Hospital', 'Pune', ['Cardiology', 'General Surgery', 'Anesthesiology']],
  ['Cedar Neuro & Spine Hospital', 'Kolkata', ['Neurology', 'Orthopedics', 'Anesthesiology']],
  ['Maple Family Medical Center', 'Ahmedabad', ['General Medicine', 'Pediatrics', 'Geriatrics']],
  ['Riverbend Kidney Care Hospital', 'Lucknow', ['Nephrology', 'Endocrinology', 'General Medicine']],
  ['Orchid Skin & Allergy Hospital', 'Jaipur', ['Dermatology', 'Allergy & Immunology', 'General Medicine']],
  ['Bluebell Digestive Health Hospital', 'Kochi', ['Gastroenterology', 'General Surgery', 'Anesthesiology']],
  ['Silver Oak Senior Care Hospital', 'Chandigarh', ['Geriatrics', 'Cardiology', 'General Medicine']],
  ['Horizon Mind & Wellness Hospital', 'Guwahati', ['Psychiatry', 'Neurology', 'General Medicine']],
  ['Evergreen Orthopedic Hospital', 'Bhopal', ['Orthopedics', 'General Surgery', 'Anesthesiology']],
  ['Coral Endocrine & Diabetes Hospital', 'Bhubaneswar', ['Endocrinology', 'Nephrology', 'General Medicine']],
  ['Clearview Eye Care Hospital', 'Mysuru', ['Ophthalmology', 'Retina Care', 'Pediatric Ophthalmology']],
  ['Hope Oncology Centre', 'Indore', ['Medical Oncology', 'Surgical Oncology', 'Radiation Oncology']],
  ['Sapphire ENT & Hearing Hospital', 'Coimbatore', ['ENT', 'Audiology', 'Speech Therapy']],
  ['Pearl Dental & Maxillofacial Centre', 'Mangaluru', ['Dentistry', 'Orthodontics', 'Oral & Maxillofacial Surgery']],
  ['Unity Trauma & Emergency Hospital', 'Nagpur', ['Emergency Medicine', 'Trauma Surgery', 'Critical Care']],
  ['Breathewell Lung Care Hospital', 'Visakhapatnam', ['Pulmonology', 'Sleep Medicine', 'Respiratory Therapy']],
  ['New Steps Rehabilitation Hospital', 'Dehradun', ['Physical Medicine & Rehabilitation', 'Physiotherapy', 'Occupational Therapy']],
  ['Meadow Infectious Disease Centre', 'Ranchi', ['Infectious Diseases', 'General Medicine', 'Clinical Microbiology']],
  ['Aster Urology & Stone Care Hospital', 'Surat', ['Urology', 'Nephrology', 'General Surgery']],
  ['Bloom Maternity & Neonatal Hospital', 'Nashik', ['Obstetrics', 'Gynecology', 'Neonatology']],
  ['Summit Sports Medicine Hospital', 'Shimla', ['Sports Medicine', 'Orthopedics', 'Physiotherapy']],
  ['Lifebridge Transplant Centre', 'Thiruvananthapuram', ['Transplant Surgery', 'Hepatology', 'Nephrology']],
  ['Amber Burns & Reconstructive Hospital', 'Vadodara', ['Burns Care', 'Plastic Surgery', 'Reconstructive Surgery']],
  ['Northstar Rheumatology Hospital', 'Jammu', ['Rheumatology', 'Clinical Immunology', 'Pain Medicine']],
  ['Seabreeze Fertility & Reproductive Centre', 'Puducherry', ['Reproductive Medicine', 'Gynecology', 'Andrology']],
  ['Prism Diagnostic & Day Care Hospital', 'Raipur', ['Radiology', 'Pathology', 'Day Care Surgery']],
  ['Oakleaf Hematology Hospital', 'Patna', ['Hematology', 'Medical Oncology', 'Transfusion Medicine']],
  ['Valley Community Health Hospital', 'Gangtok', ['Family Medicine', 'Pediatrics', 'Preventive Medicine']]
];

export async function seedAdditionalHospitals(connection) {
  await connection.beginTransaction();
  try {
    for (let i = 0; i < hospitals.length; i++) {
      const [name, city, departments] = hospitals[i];
      const displayName = `${name} (Demo)`;
      await connection.query(
        `INSERT INTO hospitals (name, city, address, phone, emergency, beds, image)
         SELECT ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM hospitals WHERE name = ? AND city = ?)`,
        [displayName, city, `Demo medical campus, ${city}`, 'Demo listing - no contact number', 'Demo listing - contact details unavailable', `${150 + i * 25} Beds (Demo)`, `/images/demo-hospital-${i % 3 + 1}.jpg`, displayName, city]
      );
      const [[hospital]] = await connection.query('SELECT id FROM hospitals WHERE name = ? AND city = ? ORDER BY id LIMIT 1', [displayName, city]);
      for (const department of departments) {
        await connection.query(
          'INSERT INTO hospital_departments (hospital_id, department_name) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM hospital_departments WHERE hospital_id = ? AND department_name = ?)',
          [hospital.id, department, hospital.id, department]
        );
      }
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}
