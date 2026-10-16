import '../../public/portal-api.js';
import React, { createContext, useContext, useState, useMemo, useEffect } from 'react';
import { INITIAL_DOCTORS, INITIAL_HOSPITALS, INITIAL_APPOINTMENTS } from '../data/mockData';

const AppContext = createContext();

export function AppProvider({ children }) {
  const [activePage, setActivePage] = useState('home'); // 'home' | 'doctors' | 'hospitals' | 'patient-portal' | 'doctor-portal' | 'admin-portal'

  // Patient State
  const [patientUser, setPatientUser] = useState({
    name: 'Aayush Sharma',
    email: 'aayush.sharma@example.com',
    phone: '+977-9841234567',
    age: 32,
    gender: 'Male',
    bloodGroup: 'O+'
  });
  const [isPatientLoggedIn, setIsPatientLoggedIn] = useState(false);
  const [patientAuthMode, setPatientAuthMode] = useState('login');

  // Doctor State
  const [doctorUser, setDoctorUser] = useState(INITIAL_DOCTORS[0]);
  const [isDoctorLoggedIn, setIsDoctorLoggedIn] = useState(false);
  const [doctorAuthMode, setDoctorAuthMode] = useState('login');

  // Admin State
  const [adminUser, setAdminUser] = useState({ name: 'Hospital Admin', email: 'admin@medicare.com' });
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);

  // Data Stores
  const [doctors, setDoctors] = useState(() => {
    try { const cached = JSON.parse(localStorage.getItem('medicare_doctors')); return Array.isArray(cached) ? cached.map(d => ({ ...d, slots: d.availableSlots || d.slots || [] })) : INITIAL_DOCTORS; }
    catch { return INITIAL_DOCTORS; }
  });
  const [hospitals, setHospitals] = useState([]);
  const [appointments, setAppointments] = useState([]);


      useEffect(() => {
        let active = true;
        const refreshVerification = () => {
          if (document.visibilityState === 'hidden') return;
          MedicareAPI.request('/doctors').then(data => { if (active) setDoctors(data.doctors.map(doctor => ({...doctor, slots:doctor.availableSlots || [], nextAvailable:doctor.availableSlots?.[0] || 'Contact hospital'}))); }).catch(() => {if(active) showToast('Cannot refresh doctor verification. Please reload when the API is available.', 'error');});
        };
        window.addEventListener('focus', refreshVerification);
        return () => { active = false; window.removeEventListener('focus', refreshVerification); };
      }, []);
  useEffect(() => {
    MedicareAPI.request('/doctors').then(data => {
      setDoctors(data.doctors.map(doctor => ({ ...doctor, slots: doctor.availableSlots || [], nextAvailable: doctor.availableSlots?.[0] || 'Contact hospital' })));
      try { localStorage.setItem('medicare_doctors', JSON.stringify(data.doctors)); } catch {}
    }).catch(error => showToast(error.message, 'error'));
    MedicareAPI.request('/hospitals').then(data => setHospitals(data.hospitals)).catch(error => showToast(error.message, 'error'));
    const session = MedicareAPI.session();
    if (session) MedicareAPI.request('/auth/me').then(async data => {
      if (data.user.role === 'patient') { setPatientUser(data.user); setIsPatientLoggedIn(true); }
      if (data.user.role === 'admin') setIsAdminLoggedIn(true);
      if (data.user.role === 'doctor') {
        const directory = await MedicareAPI.request('/doctors');
        const doctor = directory.doctors.find(d => d.email === data.user.email);
        if (doctor) { setDoctorUser({ ...doctor, slots: doctor.availableSlots || [] }); setIsDoctorLoggedIn(true); }
      }
    }).catch(() => logout(false));
  }, []);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSpecialty, setSelectedSpecialty] = useState('All');
  const [selectedHospital, setSelectedHospital] = useState('All');

  // Modals & Messages
  const [bookingDoctor, setBookingDoctor] = useState(null);
  const [bookingBusy, setBookingBusy] = useState(false);
  const [bookingError, setBookingError] = useState('');
  useEffect(() => { setBookingError(''); }, [bookingDoctor]);
  const [doctorDetailsModal, setDoctorDetailsModal] = useState(null);
  const [cancelModal, setCancelModal] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const logout = (returnToDashboard = true) => {
    localStorage.removeItem('medicare_token');
    localStorage.removeItem('mc_token');
    localStorage.removeItem('mc_user');
    setIsPatientLoggedIn(false);
    setIsDoctorLoggedIn(false);
    setIsAdminLoggedIn(false);
    setAppointments([]);
    if (returnToDashboard) setActivePage('home');
  };

  useEffect(() => {
    const refreshBookings = async () => {
      try {
        setAppointments(await MedicareAPI.appointments());
      } catch (error) { showToast(error.message, 'error'); }
    };
    const refreshSession = async () => {
      try {
        const data = await MedicareAPI.request('/auth/me');
        setPatientUser(data.user); setIsPatientLoggedIn(data.user.role === 'patient');
        setIsDoctorLoggedIn(false); setIsAdminLoggedIn(false);
        await refreshBookings();
      } catch (error) { showToast(error.message, 'error'); }
    };
    window.addEventListener('medicare:auth-changed', refreshSession);
    window.addEventListener('medicare:appointment-booked', refreshBookings);
    return () => {
      window.removeEventListener('medicare:auth-changed', refreshSession);
      window.removeEventListener('medicare:appointment-booked', refreshBookings);
    };
  }, []);

  const authenticate = async (form, mode, role) => {
    const fields = Object.fromEntries(new FormData(form));
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      if (mode === 'register' && role === 'doctor') {
        const response = await fetch((['localhost', '127.0.0.1'].includes(location.hostname) ? 'http://localhost:5000' : '') + '/api/hospitals');
        const data = await response.json();
        const hospital = data.hospitals?.find(h => h.name === fields.hospital);
        if (!hospital) throw new Error('Select a hospital available in the database.');
        fields.hospitalId = hospital.id;
      }
      const data = await MedicareAPI.request('/auth/' + mode, { method: 'POST', body: JSON.stringify({ ...fields, role }) });
      if (data.user.role !== role) throw new Error('Please sign in through your ' + data.user.role + ' portal.');
      let profile = data.user;
      if (role === 'doctor') {
        const response = await fetch((['localhost', '127.0.0.1'].includes(location.hostname) ? 'http://localhost:5000' : '') + '/api/doctors');
        const doctorsData = await response.json();
        const doctor = doctorsData.doctors?.find(d => d.email === data.user.email);
        if (!doctor) throw new Error('Doctor profile is unavailable. Please try again.');
        profile = { ...doctor, slots: doctor.availableSlots || [] };
      }
      logout(false);
      localStorage.setItem('medicare_token', data.token);
      localStorage.setItem('mc_token', JSON.stringify(data.token));
      localStorage.setItem('mc_user', JSON.stringify(data.user));
      if (role === 'patient') { setPatientUser({ ...profile, age: Number(fields.age) || undefined }); setIsPatientLoggedIn(true); }
      if (role === 'doctor') { setDoctorUser(profile); setIsDoctorLoggedIn(true); }
      if (role === 'admin') setIsAdminLoggedIn(true);
      showToast(mode === 'login' ? 'Signed in successfully' : 'Account created successfully');
    } catch (error) {
      showToast(error instanceof TypeError || error instanceof SyntaxError ? 'Cannot reach the API. Start the backend and MySQL, then try again.' : error.message, 'error');
    } finally { button.disabled = false; }
  };

  const filteredDoctors = useMemo(() => {
    return doctors.filter(doc => {
      const matchQuery = searchQuery.trim() === '' ||
        doc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doc.specialization.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doc.hospital.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchSpec = selectedSpecialty === 'All' || doc.specialization.toLowerCase() === selectedSpecialty.toLowerCase();
      const matchHosp = selectedHospital === 'All' || doc.hospital === selectedHospital;

      return matchQuery && matchSpec && matchHosp;
    });
  }, [doctors, searchQuery, selectedSpecialty, selectedHospital]);

  const refreshAppointments = async () => setAppointments(await MedicareAPI.appointments());
  useEffect(() => {
    if (isPatientLoggedIn || isDoctorLoggedIn || isAdminLoggedIn) refreshAppointments().catch(error => showToast(error.message, 'error'));
    else setAppointments([]);
  }, [isPatientLoggedIn, isDoctorLoggedIn, isAdminLoggedIn]);

  const confirmBooking = async bookingData => {
    if (bookingBusy) return;
    setBookingBusy(true); setBookingError('');
    try {
      const booked = await MedicareAPI.bookAppointment(bookingData);
      await refreshAppointments();
      setBookingDoctor(null); setDoctorDetailsModal(null); setActivePage('patient-portal');
      showToast(`Confirmed: ${booked.appointmentCode} | ${bookingData.date} | ${bookingData.timeSlot}`);
    } catch (error) { setBookingError(error.message); showToast(error.message, 'error'); }
    finally { setBookingBusy(false); }
  };
  const cancelBooking = async (id, reason) => {
    try { await MedicareAPI.updateAppointment(id, 'Cancelled', reason); await refreshAppointments(); setCancelModal(null); showToast('Appointment cancelled'); }
    catch (error) { showToast(error.message, 'error'); }
  };
  const updateStatus = async (id, status) => {
    try { await MedicareAPI.updateAppointment(id, status); await refreshAppointments(); showToast('Appointment updated'); }
    catch (error) { showToast(error.message, 'error'); }
  };
  const addDoctorSlot = async newSlot => {
    try {
      await MedicareAPI.request('/doctors/' + doctorUser.id + '/slots', { method: 'POST', body: JSON.stringify({ slotTime: newSlot }) });
      const data = await MedicareAPI.request('/doctors/' + doctorUser.id);
      const profile = { ...data.doctor, slots: data.doctor.availableSlots || [] };
      setDoctorUser(profile); setDoctors(prev => prev.map(d => d.id === profile.id ? profile : d));
      showToast('Availability saved');
    } catch (error) { showToast(error.message, 'error'); }
  };

  return (
    <AppContext.Provider value={{
      authenticate,
      logout,
      activePage,
      setActivePage,
      patientUser,
      setPatientUser,
      isPatientLoggedIn,
      setIsPatientLoggedIn,
      patientAuthMode,
      setPatientAuthMode,
      doctorUser,
      setDoctorUser,
      isDoctorLoggedIn,
      setIsDoctorLoggedIn,
      doctorAuthMode,
      setDoctorAuthMode,
      adminUser,
      isAdminLoggedIn,
      setIsAdminLoggedIn,
      doctors,
      setDoctors,
      hospitals,
      setHospitals,
      appointments,
      setAppointments,
      searchQuery,
      setSearchQuery,
      selectedSpecialty,
      setSelectedSpecialty,
      selectedHospital,
      setSelectedHospital,
      filteredDoctors,
      bookingDoctor,
      setBookingDoctor,
      doctorDetailsModal,
      setDoctorDetailsModal,
      cancelModal,
      setCancelModal,
      toast,
      showToast,
      confirmBooking,
      bookingBusy,
      bookingError,
      cancelBooking,
      updateStatus,
      addDoctorSlot
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
