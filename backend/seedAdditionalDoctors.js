import bcrypt from 'bcryptjs';

// Demo directory entries requested for the local Medicare application.
export async function seedAdditionalDoctors(connection) {
  const image = '/images/doctor-portrait.jpg';
  const password = await bcrypt.hash('doctor123', 10);
  const [hospitals] = await connection.query('SELECT id FROM hospitals ORDER BY id LIMIT 1');
  if (!hospitals.length) throw new Error('Create a hospital before adding demo doctors');
  await connection.beginTransaction();
  try {
    await connection.query(
      'UPDATE doctors d JOIN users u ON u.id = d.user_id SET d.image = ? WHERE u.email = ?',
      [image, 'dr.arjun@medicare.com']
    );
    for (const name of ['Omkar', 'Bijoy', 'Radhe', 'Akaash', 'Vidya', 'Ivy', 'Niharika', 'Yushika']) {
      const email = `dr.${name.toLowerCase()}@medicare.com`;
      await connection.query(
        'INSERT INTO users (name, email, password, role) SELECT ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = ?)',
        [`Dr. ${name}`, email, password, 'doctor', email]
      );
      const [[user]] = await connection.query('SELECT id, role FROM users WHERE email = ?', [email]);
      if (user.role !== 'doctor') throw new Error(`Email already belongs to another role: ${email}`);
      await connection.query(
        `INSERT INTO doctors (user_id, specialization, license_no, qualifications, experience, consultation_fee, hospital_id, about, verified, image)
         SELECT ?, 'General Physician', ?, 'MBBS', '', 499, ?, 'Demo doctor profile.', FALSE, ?
         WHERE NOT EXISTS (SELECT 1 FROM doctors WHERE user_id = ?)`,
        [user.id, `DEMO-${name.toUpperCase()}`, hospitals[0].id, image, user.id]
      );
      const [[doctor]] = await connection.query('SELECT id FROM doctors WHERE user_id = ?', [user.id]);
      for (const slot of ['09:00 AM', '10:00 AM', '02:00 PM']) {
        await connection.query(
          'INSERT INTO doctor_slots (doctor_id, slot_time) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM doctor_slots WHERE doctor_id = ? AND slot_time = ?)',
          [doctor.id, slot, doctor.id, slot]
        );
      }
    }
    await connection.query('UPDATE users SET name = ? WHERE email = ?', ['Dr. Bijoy Chakma', 'dr.bijoy@medicare.com']);
    await connection.query(
      `UPDATE doctors d JOIN users u ON u.id = d.user_id
       SET d.image = ?, d.qualifications = ?, d.experience = ?
       WHERE u.email = ?`,
      ['/images/dr-bijoy.jpeg', 'MBBS, Nicobar Medical College', '6 Years Experience', 'dr.bijoy@medicare.com']
    );
    await connection.query(
      `UPDATE doctors d JOIN users u ON u.id = d.user_id
       SET d.image = ?, d.qualifications = ?, d.experience = ?
       WHERE u.email = ?`,
      ['/images/dr-radhe.jpeg', 'MBBS, Akash College of Medical Science; PhD, Nagaland Medical College', '8 Years Experience', 'dr.radhe@medicare.com']
    );
    await connection.query('UPDATE users SET name = ? WHERE email = ?', ['Dr. Radhe Tangu', 'dr.radhe@medicare.com']);
    await connection.query(
      'UPDATE doctors d JOIN users u ON u.id = d.user_id SET d.image = ? WHERE u.email = ?',
      ['/images/dr-akaash.jpeg', 'dr.akaash@medicare.com']
    );
    await connection.query('UPDATE users SET name = ? WHERE email = ?', ['Dr. Akaash Gowda', 'dr.akaash@medicare.com']);
    await connection.query(
      `UPDATE doctors d JOIN users u ON u.id = d.user_id
       SET d.qualifications = ?, d.experience = ? WHERE u.email = ?`,
      ['MBBS, Nagarunna Medical College', '5 Years Experience', 'dr.akaash@medicare.com']
    );
    await connection.query(
      `UPDATE doctors d JOIN users u ON u.id = d.user_id
       SET d.image = ?, d.qualifications = ?, d.experience = ? WHERE u.email = ?`,
      ['/images/dr-omkar.jpeg', 'MBBS, AIIMS New Delhi; PhD, AIIMS New Delhi', '7 Years Experience', 'dr.omkar@medicare.com']
    );
    await connection.query(
      `UPDATE doctors d JOIN users u ON u.id = d.user_id
       SET d.image = ?, d.qualifications = ? WHERE u.email = ?`,
      ['/images/dr-vidya.jpeg', 'MBBS, Bangalore Medical College; PhD, Christian Medical College', 'dr.vidya@medicare.com']
    );
    await connection.query('UPDATE users SET name = ? WHERE email = ?', ['Dr. Gayatri', 'dr.niharika@medicare.com']);
    await connection.query(
      'UPDATE doctors d JOIN users u ON u.id = d.user_id SET d.specialization = ? WHERE u.email = ?',
      ['Psychiatry', 'dr.radhe@medicare.com']
    );
    await connection.query('UPDATE users SET name = ? WHERE email = ?', ['Dr. Yushika Tumsawa Limbu', 'dr.yushika@medicare.com']);
    await connection.query(
      `UPDATE doctors d JOIN users u ON u.id = d.user_id
       SET d.image = ?, d.qualifications = ?, d.specialization = ? WHERE u.email = ?`,
      ['/images/dr-yushika.jpeg', 'MBBS, Akash Medical College', 'Gynecology', 'dr.yushika@medicare.com']
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}
