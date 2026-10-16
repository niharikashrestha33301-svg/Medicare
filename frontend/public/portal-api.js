(() => {
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const staticPreview = location.protocol === 'file:' || (loopback && ['5500', '5501'].includes(location.port));
  // Vite dev/preview proxy /api; backend-served pages use the same origin.
  const base = staticPreview ? 'http://localhost:5000/api' : new URL('/api', location.href).href;
  const session = () => {
    try {
      const token = JSON.parse(localStorage.getItem('mc_token'));
      const user = JSON.parse(localStorage.getItem('mc_user'));
      return token && user ? { token, user } : null;
    } catch { return null; }
  };
  const request = async (path, options = {}) => {
    let response;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      response = await fetch(base + path, { ...options, signal: options.signal || controller.signal, headers: { 'Content-Type': 'application/json', ...(session() ? { Authorization: `Bearer ${session().token}` } : {}), ...options.headers } });
      const data = await response.json().catch(() => { throw Object.assign(new Error('The API returned an invalid response. Open http://localhost:5000 or check the frontend API proxy.'), { status: response.status }); });
      if (!response.ok || !data.success) throw Object.assign(new Error(data.message || 'Request failed'), { status: response.status });
      return data;
    } catch (error) {
      if (error.status !== undefined) throw error;
      throw Object.assign(new Error(error.name === 'AbortError' ? 'The API request timed out. Please retry.' : 'The Medicare API is offline. Run npm start in the project folder, then retry.'), { status: 0 });
    } finally { clearTimeout(timer); }
  };
  const authenticate = async (form, mode, role) => {
    const fields = Object.fromEntries(new FormData(form));
    const passwordInput = form.querySelector('input[type="password"]');
    fields.password = passwordInput?.value;
    fields.email = fields.email || form.querySelector('input[type="email"]')?.value;
    if (mode === 'register') {
      const confirmation = form.querySelectorAll('input[type="password"]')[1];
      if (confirmation && confirmation.value !== fields.password) throw new Error('Passwords do not match');
      fields.name = fields.name || `${fields.firstName || ''} ${fields.lastName || ''}`.trim();
      fields.role = role;
      if (role === 'doctor') {
        const data = await request('/hospitals');
        const hospital = data.hospitals.find(item => item.name === fields.hospital);
        if (!hospital) throw new Error('Select an available hospital');
        fields.hospitalId = hospital.id;
        fields.specialization = fields.specialization || fields.specialty;
        fields.qualifications = fields.qualifications || fields.quals || 'MBBS';
        fields.consultationFee = Number(fields.consultationFee || fields.fee || 499);
        fields.experience = fields.experience || (fields.exp ? `${fields.exp} Years` : '0 Years');
      }
    }
    const data = await request('/auth/' + mode, { method: 'POST', body: JSON.stringify(fields) });
    if (role && data.user.role !== role) throw new Error(`Please use the ${data.user.role} portal for this account`);
    localStorage.setItem('mc_token', JSON.stringify(data.token));
    localStorage.setItem('mc_user', JSON.stringify(data.user));
    localStorage.setItem('medicare_token', data.token);
    return data;
  };
  const appointments = async () => {
    const data = await request('/appointments/my');
    return data.appointments.map(item => ({ ...item, dbId: item.id, id: item.appointmentCode }));
  };
  const bookAppointment = async booking => request('/appointments', { method: 'POST', body: JSON.stringify({
    doctorId: booking.doctor.id, appointmentDate: booking.date, timeSlot: booking.timeSlot,
    patientName: booking.patientName, patientPhone: booking.patientPhone,
    patientAge: booking.patientAge === undefined || booking.patientAge === null || booking.patientAge === '' ? null : Number(booking.patientAge), patientGender: booking.patientGender, symptoms: booking.symptoms || ''
  }) });
  const updateAppointment = async (identifier, status, reason = '') => {
    const list = await appointments();
    const appointment = list.find(item => item.id === identifier || item.dbId === identifier);
    if (!appointment) throw new Error('Appointment not found. Refresh your appointments.');
    return request(`/appointments/${appointment.dbId}/${status === 'Cancelled' ? 'cancel' : 'status'}`, { method: 'PUT', body: JSON.stringify({ status, reason }) });
  };
  globalThis.MedicareAPI = { base, request, authenticate, session, appointments, bookAppointment, updateAppointment };
})();
