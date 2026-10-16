import { formatINR } from './utils/currency';
import React, { useState, useEffect } from 'react';
import AppointmentSlots from './components/AppointmentSlots';
import DirectoryPagination from './components/DirectoryPagination';
import { useApp } from './context/AppContext';
import Navbar from './components/Navbar';
import { SPECIALTY_OPTIONS } from './data/mockData';
import { 
  Search, 
  X, 
  Check, 
  Info,
  Calendar,
  Building,
  Phone,
  Clock,
  User,
  ShieldCheck
} from 'lucide-react';

export default function App() {
  const [availabilityReady,setAvailabilityReady]=useState(false);
  const [directoryPage, setDirectoryPage] = useState(1);
  const {
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
    isAdminLoggedIn,
    setIsAdminLoggedIn,
    doctors,
    setDoctors,
    hospitals,
    appointments,
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
    confirmBooking,
    bookingBusy,
    bookingError,
    cancelBooking,
    updateStatus,
    addDoctorSlot,
    toast,
    showToast
  } = useApp();

  useEffect(() => { setDirectoryPage(1); }, [searchQuery, selectedSpecialty, selectedHospital]);

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      
      {/* Toast Alert */}
      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 rounded-lg shadow-xl text-white text-xs font-semibold ${
          toast.type === 'success' ? 'bg-slate-900' : 'bg-medRed-700'
        }`}>
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{toast.message}</span>
        </div>
      )}

      {/* Top Navbar */}
      <Navbar />

      {/* MAIN VIEW */}
      <main className="flex-1">

        {/* ================= PAGE 1: HOME ================= */}
        {activePage === 'home' && (
          <div>
            {/* Hero Section */}
            <section className="bg-white border-b border-slate-200 py-12 sm:py-16">
              <div className="max-w-5xl mx-auto px-4 text-center">
                <span className="inline-block px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold mb-4">
                  Hospital OPD & Specialist Consultations
                </span>
                <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight leading-tight mb-3">
                  Book Doctor Appointments at Top Partner Hospitals
                </h1>
                <p className="text-slate-500 text-sm max-w-2xl mx-auto mb-8">
                  Find verified doctors, check available in-clinic OPD slots, and confirm appointments without waiting in hospital queues.
                </p>

                {/* Search Bar */}
                <div className="bg-slate-50 p-2 rounded-xl border border-slate-200 max-w-3xl mx-auto flex flex-col sm:flex-row gap-2">
                  <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-slate-200">
                    <Search className="w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search doctor name or specialty..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-transparent text-xs font-medium text-slate-800 focus:outline-none"
                    />
                  </div>

                  <select
                    value={selectedSpecialty}
                    onChange={(e) => setSelectedSpecialty(e.target.value)}
                    className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-none"
                  >
                    {SPECIALTY_OPTIONS.map(s => <option key={s} value={s}>{s === 'All' ? 'All Specialties' : s}</option>)}
                  </select>

                  <button
                    onClick={() => setActivePage('doctors')}
                    className="px-5 py-2 bg-medRed-600 hover:bg-medRed-700 text-white rounded-lg text-xs font-bold transition-all"
                  >
                    Search OPD
                  </button>
                </div>

                {/* Direct Portal Shortcuts */}
                <div className="mt-8 pt-6 border-t border-slate-100 flex flex-wrap items-center justify-center gap-4 text-xs">
                  <span className="text-slate-400">Direct Portals:</span>
                  <button onClick={() => setActivePage('patient-portal')} className="text-medRed-600 font-semibold hover:underline">
                    Patient Booking & History &rarr;
                  </button>
                  <button onClick={() => setActivePage('doctor-portal')} className="text-medRed-600 font-semibold hover:underline">
                    Doctor Schedule & Queue &rarr;
                  </button>
                  <button onClick={() => setActivePage('admin-portal')} className="text-medRed-600 font-semibold hover:underline">
                    Hospital Admin Control &rarr;
                  </button>
                </div>
              </div>
            </section>

            {/* Featured Specialists */}
            <section className="py-12 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Available Specialists</h2>
                  <p className="text-xs text-slate-500">Board-certified doctors available for in-clinic consultation</p>
                </div>
                <button
                  onClick={() => setActivePage('doctors')}
                  className="text-xs font-bold text-medRed-600 hover:underline"
                >
                  View All Doctors &rarr;
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {doctors.slice(0, 7).map(doc => (
                  <div key={doc.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col justify-between hover:border-slate-300 transition-colors">
                    <div>
                      <img loading="lazy" src={doc.image} alt={doc.name} className="w-full h-72 bg-slate-100 object-contain object-center" />
                      <div className="p-4">
                        <span className="text-[11px] font-bold text-medRed-600 bg-medRed-50 px-2 py-0.5 rounded">
                          {doc.specialization}
                        </span>
                        <h3 className="text-sm font-bold text-slate-900 mt-2">{doc.name}</h3>
                        <p className="text-xs text-slate-500 mt-0.5">{doc.qualifications}</p>
                        <p className="text-xs text-slate-600 font-medium mt-1">🏥 {doc.hospital}</p>
                        <p className="text-xs text-slate-700 font-bold mt-2">{formatINR(doc.consultationFee)}</p>
                      </div>
                    </div>

                    <div className="p-4 pt-0 flex gap-2">
                      <button
                        onClick={() => setDoctorDetailsModal(doc)}
                        className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        Details
                      </button>
                      <button
                        disabled={!doc.verified || !doc.availableSlots?.length}
                        onClick={() => setBookingDoctor(doc)}
                        className="flex-1 py-1.5 bg-medRed-600 hover:bg-medRed-700 text-white rounded-lg text-xs font-bold transition-all"
                      >
                        {doc.verified ? "Book Slot" : "Booking unavailable"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* ================= PAGE 2: FIND DOCTORS ================= */}
        {activePage === 'doctors' && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-slate-900">Doctor Directory</h1>
              <p className="text-xs text-slate-500 mt-0.5">Filter by medical department, hospital, or physician name</p>
            </div>

            {/* Filter Bar */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 mb-6 flex flex-col md:flex-row gap-3">
              <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg border border-slate-200">
                <Search className="w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search doctor name or department..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-transparent text-xs font-medium focus:outline-none"
                />
              </div>

              <select
                value={selectedSpecialty}
                onChange={(e) => setSelectedSpecialty(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700"
              >
                {SPECIALTY_OPTIONS.map(s => <option key={s} value={s}>{s === 'All' ? 'All Specialties' : s}</option>)}
              </select>

              <select
                value={selectedHospital}
                onChange={(e) => setSelectedHospital(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700"
              >
                <option value="All">All Hospitals</option>
                {hospitals.map(h => <option key={h.id} value={h.name}>{h.name}</option>)}
              </select>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredDoctors.slice((directoryPage - 1) * 24, directoryPage * 24).map(doc => (
                <div key={doc.id} className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col justify-between hover:border-slate-300">
                  <div>
                    <div className="flex items-start gap-3">
                      <img loading="lazy" src={doc.image} alt={doc.name} className="w-16 h-16 rounded-lg object-cover" />
                      <div>
                        <span className="text-[11px] font-bold text-medRed-600 bg-medRed-50 px-2 py-0.5 rounded">
                          {doc.specialization}
                        </span>
                        <h3 className="text-sm font-bold text-slate-900 mt-1">{doc.name}</h3>
                        <p className="text-[11px] text-slate-500">{doc.qualifications}</p>
                        <p className="text-[11px] text-slate-400 font-mono mt-0.5">License: {doc.licenseNo}</p>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-600 space-y-1">
                      <p><strong>Hospital:</strong> {doc.hospital}</p>
                      <p><strong>Experience:</strong> {doc.experience}</p>
                      <p><strong>OPD Fee:</strong> {formatINR(doc.consultationFee)}</p>
                      <p className="text-medRed-600 font-semibold">Available: {doc.nextAvailable}</p>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex gap-2">
                    <button
                      onClick={() => setDoctorDetailsModal(doc)}
                      className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      View Bio
                    </button>
                    <button
                      disabled={!doc.verified || !doc.availableSlots?.length}
                        onClick={() => setBookingDoctor(doc)}
                      className="flex-1 py-1.5 bg-medRed-600 hover:bg-medRed-700 text-white rounded-lg text-xs font-bold transition-all"
                    >
                      {!doc.verified ? (doc.verificationStatus === "Rejected" ? "Registration rejected" : "Booking unavailable") : !doc.availableSlots?.length ? "No available slots" : "Book Appointment"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <DirectoryPagination page={directoryPage} count={filteredDoctors.length} onChange={setDirectoryPage} />
          </div>
        )}

        {/* ================= PAGE 3: HOSPITALS ================= */}
        {activePage === 'hospitals' && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-slate-900">Partner Hospitals</h1>
              <p className="text-xs text-slate-500 mt-0.5">Accredited hospital facilities with Medicare OPD booking</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {hospitals.map(h => (
                <div key={h.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <img src={h.image} alt={h.name} className="w-full h-44 object-cover" />
                  <div className="p-5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                      {h.emergency}
                    </span>
                    <h3 className="text-base font-bold text-slate-900 mt-2">{h.name}</h3>
                    <p className="text-xs text-slate-500 mt-1">{h.address}</p>
                    <p className="text-xs text-slate-700 font-semibold mt-1">📞 {h.phone}</p>

                    <div className="mt-4 pt-3 border-t border-slate-100">
                      <p className="text-[11px] font-bold text-slate-500 uppercase mb-1">Departments:</p>
                      <div className="flex flex-wrap gap-1">
                        {h.departments.map((d, i) => (
                          <span key={i} className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                            {d}
                          </span>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={() => { setSelectedHospital(h.name); setActivePage('doctors'); }}
                      className="mt-4 w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold transition-all"
                    >
                      View Hospital Doctors &rarr;
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ================= PAGE 4: PATIENT PORTAL ================= */}
        {activePage === 'patient-portal' && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {!isPatientLoggedIn ? (
              <div className="max-w-md mx-auto bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
                <div className="text-center mb-6">
                  <div className="w-10 h-10 rounded-xl bg-medRed-50 text-medRed-600 font-black text-lg flex items-center justify-center mx-auto mb-2">
                    P
                  </div>
                  <h2 className="text-xl font-bold text-slate-900">
                    {patientAuthMode === 'login' ? 'Patient Sign In' : 'Register New Patient'}
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    {patientAuthMode === 'login' ? 'Access your booked appointments and OPD records' : 'Fill details below to create a patient profile'}
                  </p>
                </div>

                {patientAuthMode === 'login' ? (
                  <form onSubmit={(e) => { e.preventDefault(); authenticate(e.currentTarget, 'login', 'patient'); }} className="space-y-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">Email Address</label>
                      <input type="email" name="email" defaultValue={patientUser.email} required className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">Password</label>
                      <input type="password" name="password" required className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg" />
                    </div>
                    <button type="submit" className="w-full py-2.5 bg-medRed-600 hover:bg-medRed-700 text-white font-bold text-xs rounded-lg transition-all mt-2">
                      Sign In as Patient
                    </button>
                  </form>
                ) : (
                  <form onSubmit={(e) => { e.preventDefault(); authenticate(e.currentTarget, 'register', 'patient'); }} className="space-y-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">Full Name</label>
                      <input type="text" name="name" placeholder="e.g. Ramesh Karki" required className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs font-semibold text-slate-700 block mb-1">Email</label>
                        <input type="email" name="email" placeholder="ramesh@example.com" required className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg" />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-700 block mb-1">Phone</label>
                        <input type="tel" name="phone" placeholder="+977-9800000000" required className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-xs font-semibold text-slate-700 block mb-1">Age</label>
                        <input type="number" name="age" defaultValue="28" required className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg" />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-700 block mb-1">Gender</label>
                        <select name="gender" className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                          <option>Male</option>
                          <option>Female</option>
                          <option>Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-700 block mb-1">Blood Group</label>
                        <select name="bloodGroup" className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                          <option>A+</option>
                          <option>O+</option>
                          <option>B+</option>
                          <option>AB+</option>
                          <option>A-</option>
                          <option>O-</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">Password</label>
                      <input type="password" name="password" required className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg" />
                    </div>
                    <button type="submit" className="w-full py-2.5 bg-medRed-600 hover:bg-medRed-700 text-white font-bold text-xs rounded-lg transition-all mt-2">
                      Create Patient Account
                    </button>
                  </form>
                )}

                <div className="mt-4 pt-4 border-t border-slate-100 text-center text-xs text-slate-500">
                  {patientAuthMode === 'login' ? (
                    <p>Need a patient account? <button onClick={() => setPatientAuthMode('register')} className="text-medRed-600 font-bold hover:underline">Register here</button></p>
                  ) : (
                    <p>Already have an account? <button onClick={() => setPatientAuthMode('login')} className="text-medRed-600 font-bold hover:underline">Log in</button></p>
                  )}
                </div>
              </div>
            ) : (
              <div>
                <div className="bg-white p-6 rounded-xl border border-slate-200 mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-medRed-600 bg-medRed-50 px-2 py-0.5 rounded">Patient Account</span>
                      <span className="text-xs text-slate-400">Blood Group: {patientUser.bloodGroup}</span>
                    </div>
                    <h1 className="text-2xl font-bold text-slate-900 mt-1">{patientUser.name}</h1>
                    <p className="text-xs text-slate-500">{patientUser.email} &bull; {patientUser.phone} &bull; Age: {patientUser.age} ({patientUser.gender})</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setActivePage('doctors')}
                      className="px-4 py-2 bg-medRed-600 hover:bg-medRed-700 text-white rounded-lg text-xs font-bold transition-all"
                    >
                      + Book OPD Slot
                    </button>
                    <button
                      onClick={() => { logout(); showToast('Logged out from Patient Portal', 'info'); }}
                      className="px-3 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-xs font-semibold"
                    >
                      Logout
                    </button>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-6">
                  <h2 className="text-base font-bold text-slate-900 mb-4">My Booked Appointments ({appointments.length})</h2>

                  {appointments.length === 0 ? (
                    <p className="text-xs text-slate-500 py-8 text-center">No appointments booked yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {appointments.map(apt => (
                        <div key={apt.id} className="p-4 rounded-xl border border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono font-bold text-slate-400">{apt.id}</span>
                              <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                                apt.status === 'Confirmed' ? 'bg-emerald-50 text-emerald-700' :
                                apt.status === 'Pending' ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'
                              }`}>
                                {apt.status}
                              </span>
                            </div>
                            <h3 className="text-sm font-bold text-slate-900 mt-1">{apt.doctorName} ({apt.specialization})</h3>
                            <p className="text-xs text-slate-500">🏥 {apt.hospitalName}</p>
                            <p className="text-xs text-slate-600 mt-1 italic bg-slate-50 p-2 rounded">
                              <strong>Symptoms / Notes:</strong> {apt.symptoms || 'General OPD consultation'}
                            </p>
                          </div>

                          <div className="flex flex-row md:flex-col items-center md:items-end justify-between w-full md:w-auto gap-2 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100">
                            <div className="text-left md:text-right text-xs">
                              <p className="font-bold text-slate-900">📅 {apt.date} at {apt.timeSlot}</p>
                              <p className="font-semibold text-slate-500">OPD Fee: {formatINR(apt.fee)}</p>
                            </div>
                            {apt.status !== 'Cancelled' && (
                              <button
                                onClick={() => setCancelModal(apt)}
                                className="px-3 py-1.5 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded text-xs font-bold"
                              >
                                Cancel
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================= PAGE 5: DOCTOR PORTAL ================= */}
        {activePage === 'doctor-portal' && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {!isDoctorLoggedIn ? (
              <div className="max-w-lg mx-auto bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
                <div className="text-center mb-6">
                  <div className="w-10 h-10 rounded-xl bg-slate-900 text-white font-black text-lg flex items-center justify-center mx-auto mb-2">
                    Dr
                  </div>
                  <h2 className="text-xl font-bold text-slate-900">
                    {doctorAuthMode === 'login' ? 'Doctor Portal Sign In' : 'Doctor Registration & Onboarding'}
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    {doctorAuthMode === 'login' ? 'Access your OPD schedule and manage patient queues' : 'Register your medical practice with Medicare'}
                  </p>
                </div>

                {doctorAuthMode === 'login' ? (
                  <form onSubmit={(e) => { e.preventDefault(); authenticate(e.currentTarget, 'login', 'doctor'); }} className="space-y-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">Doctor Email</label>
                      <input type="email" name="email" defaultValue={doctorUser.email} required className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">Password</label>
                      <input type="password" name="password" required className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg" />
                    </div>
                    <button type="submit" className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg transition-all mt-2">
                      Sign In to Doctor Hub
                    </button>
                  </form>
                ) : (
                  <form onSubmit={(e) => { e.preventDefault(); authenticate(e.currentTarget, 'register', 'doctor'); }} className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs font-semibold text-slate-700 block mb-1">Doctor Name</label>
                        <input type="text" name="name" placeholder="Dr. First Last" required className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg" />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-700 block mb-1">Email</label>
                        <input type="email" name="email" placeholder="dr.email@hospital.com" required className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs font-semibold text-slate-700 block mb-1">Specialization</label>
                        <select name="specialization" className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                          {SPECIALTY_OPTIONS.filter(s => s !== 'All').map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-700 block mb-1">License No (NMC)</label>
                        <input type="text" name="licenseNo" placeholder="e.g. NMC-7821" required className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs font-semibold text-slate-700 block mb-1">Qualifications</label>
                        <input type="text" name="qualifications" placeholder="MBBS, MD" required className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg" />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-700 block mb-1">Years of Experience</label>
                        <input type="number" name="experience" defaultValue="10" required className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs font-semibold text-slate-700 block mb-1">Hospital Affiliation</label>
                        <select name="hospital" className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                          {hospitals.map(h => <option key={h.id} value={h.name}>{h.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-700 block mb-1">OPD Fee (₹)</label>
                        <input type="number" name="consultationFee" defaultValue="499" required className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg" />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">About Doctor</label>
                      <textarea name="about" rows="2" placeholder="Brief clinical background..." className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg"></textarea>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">Set Password</label>
                      <input type="password" name="password" required className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg" />
                    </div>

                    <button type="submit" className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg transition-all mt-2">
                      Register Doctor Practice
                    </button>
                  </form>
                )}

                <div className="mt-4 pt-4 border-t border-slate-100 text-center text-xs text-slate-500">
                  {doctorAuthMode === 'login' ? (
                    <p>New Doctor? <button onClick={() => setDoctorAuthMode('register')} className="text-medRed-600 font-bold hover:underline">Register your practice</button></p>
                  ) : (
                    <p>Already registered? <button onClick={() => setDoctorAuthMode('login')} className="text-medRed-600 font-bold hover:underline">Sign In</button></p>
                  )}
                </div>
              </div>
            ) : (
              <div>
                <div className="bg-white p-6 rounded-xl border border-slate-200 mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <img src={doctorUser.image} alt={doctorUser.name} className="w-16 h-16 rounded-xl object-cover" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-medRed-600 bg-medRed-50 px-2 py-0.5 rounded">{doctorUser.specialization}</span>
                        <span className="text-xs text-slate-400 font-mono">{doctorUser.licenseNo}</span>
                      </div>
                      <h1 className="text-xl font-bold text-slate-900 mt-1">{doctorUser.name}</h1>
                      <p className="text-xs text-slate-500">{doctorUser.qualifications} &bull; 🏥 {doctorUser.hospital}</p>
                    </div>
                  </div>

                  <button
                    onClick={() => { logout(); showToast('Logged out from Doctor Portal', 'info'); }}
                    className="px-3 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-xs font-semibold"
                  >
                    Doctor Logout
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  {/* Left 2 Cols: Patient Appointment Queue */}
                  <div className="lg:col-span-2 space-y-4">
                    <h2 className="text-base font-bold text-slate-900">Incoming OPD Patient Queue</h2>
                    {appointments.map(apt => (
                      <div key={apt.id} className="bg-white p-5 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono font-bold text-slate-400">{apt.id}</span>
                            <span className="text-xs font-bold px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded">{apt.status}</span>
                          </div>
                          <h4 className="text-sm font-bold text-slate-900 mt-1">{apt.patientName} ({apt.patientAge === null ? 'Age not recorded' : apt.patientAge + 'y'}, {apt.patientGender})</h4>
                          <p className="text-xs text-slate-500">{apt.patientPhone} &bull; {apt.patientEmail}</p>
                          <p className="text-xs text-slate-700 mt-1 bg-slate-50 p-2 rounded"><strong>Symptoms:</strong> {apt.symptoms}</p>
                          <p className="text-xs font-bold text-medRed-600 mt-1">📅 {apt.date} at {apt.timeSlot} &bull; {formatINR(apt.fee)}</p>
                        </div>

                        <div className="flex flex-row sm:flex-col gap-2 w-full sm:w-auto">
                          {apt.status === 'Pending' && (
                            <button
                              onClick={() => updateStatus(apt.id, 'Confirmed')}
                              className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold"
                            >
                              Accept & Confirm
                            </button>
                          )}
                          {apt.status === 'Confirmed' && (
                            <button
                              onClick={() => updateStatus(apt.id, 'Completed')}
                              className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-bold"
                            >
                              Mark Completed
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Right Col: Slot Manager */}
                  <div className="bg-white p-6 rounded-xl border border-slate-200 space-y-4">
                    <h3 className="text-sm font-bold text-slate-900">OPD Consultation Slots</h3>
                    <p className="text-xs text-slate-500">Manage time slots visible to patients for booking</p>

                    <div className="flex flex-wrap gap-1.5">
                      {doctorUser.slots.map((s, i) => (
                        <span key={i} className="text-xs bg-slate-100 text-slate-700 font-bold px-2.5 py-1 rounded">
                          {s}
                        </span>
                      ))}
                    </div>

                    <div className="pt-3 border-t border-slate-100">
                      <label className="text-xs font-semibold text-slate-700 block mb-1">Add New OPD Slot</label>
                      <div className="flex gap-2">
                        <input id="reactNewSlotInput" type="text" placeholder="e.g. 04:00 PM" className="text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg flex-1" />
                        <button
                          type="button"
                          onClick={() => {
                            const el = document.getElementById('reactNewSlotInput');
                            if (el.value) {
                              addDoctorSlot(el.value);
                              el.value = '';
                            }
                          }}
                          className="px-3 py-2 bg-slate-900 text-white rounded-lg text-xs font-bold"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================= PAGE 6: ADMIN PORTAL ================= */}
        {activePage === 'admin-portal' && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {!isAdminLoggedIn ? (
              <div className="max-w-md mx-auto bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
                <div className="text-center mb-6">
                  <div className="w-10 h-10 rounded-xl bg-slate-900 text-white font-black text-lg flex items-center justify-center mx-auto mb-2">
                    A
                  </div>
                  <h2 className="text-xl font-bold text-slate-900">Hospital Administration</h2>
                  <p className="text-xs text-slate-500 mt-1">Super admin oversight & hospital management</p>
                </div>

                <form onSubmit={(e) => { e.preventDefault(); authenticate(e.currentTarget, 'login', 'admin'); }} className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">Admin Email</label>
                    <input type="email" name="email" defaultValue="admin@medicare.com" required className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">Password</label>
                    <input type="password" name="password" required className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg" />
                  </div>
                  <button type="submit" className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg transition-all mt-2">
                    Sign In as Administrator
                  </button>
                </form>
              </div>
            ) : (
              <div>
                <div className="bg-white p-6 rounded-xl border border-slate-200 mb-8 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-400 uppercase">System Administration</span>
                    <h1 className="text-xl font-bold text-slate-900">Medicare Control Center</h1>
                  </div>
                  <button
                    onClick={() => { logout(); showToast('Logged out from Admin Portal', 'info'); }}
                    className="px-3 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-xs font-semibold"
                  >
                    Admin Logout
                  </button>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
                  <div className="bg-white p-4 rounded-xl border border-slate-200">
                    <span className="text-xs text-slate-400 font-semibold uppercase">Total Doctors</span>
                    <p className="text-2xl font-black text-slate-900 mt-1">{doctors.length}</p>
                  </div>
                  <div className="bg-white p-4 rounded-xl border border-slate-200">
                    <span className="text-xs text-slate-400 font-semibold uppercase">Hospitals</span>
                    <p className="text-2xl font-black text-slate-900 mt-1">{hospitals.length}</p>
                  </div>
                  <div className="bg-white p-4 rounded-xl border border-slate-200">
                    <span className="text-xs text-slate-400 font-semibold uppercase">Appointments</span>
                    <p className="text-2xl font-black text-slate-900 mt-1">{appointments.length}</p>
                  </div>
                  <div className="bg-white p-4 rounded-xl border border-slate-200">
                    <span className="text-xs text-slate-400 font-semibold uppercase">Status</span>
                    <p className="text-2xl font-black text-emerald-600 mt-1">Active</p>
                  </div>
                </div>

                {/* Registered Doctors Table */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-8">
                  <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900">Registered Doctors & Credentials</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-500 font-bold uppercase">
                        <tr>
                          <th className="p-3">Doctor</th>
                          <th className="p-3">License (NMC)</th>
                          <th className="p-3">Specialization</th>
                          <th className="p-3">Hospital</th>
                          <th className="p-3">Fee</th>
                          <th className="p-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {doctors.map(d => (
                          <tr key={d.id} className="hover:bg-slate-50">
                            <td className="p-3 font-bold text-slate-900">{d.name}</td>
                            <td className="p-3 font-mono text-slate-600">{d.licenseNo}</td>
                            <td className="p-3 text-slate-600">{d.specialization}</td>
                            <td className="p-3 text-slate-600">{d.hospital}</td>
                            <td className="p-3 font-bold">{formatINR(d.consultationFee)}</td>
                            <td className="p-3"><span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-bold">Verified</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

      </main>

      {/* MODAL: BOOKING */}
      {bookingDoctor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 relative">
            <button
              onClick={() => setBookingDoctor(null)}
              className="absolute top-5 right-5 p-1.5 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-4 pb-3 border-b border-slate-100">
              <img src={bookingDoctor.image} alt={bookingDoctor.name} className="w-12 h-12 rounded-lg object-cover" />
              <div>
                <h3 className="text-base font-bold text-slate-900">Book OPD with {bookingDoctor.name}</h3>
                <p className="text-xs text-slate-500">{bookingDoctor.specialization} &bull; 🏥 {bookingDoctor.hospital}</p>
              </div>
            </div>

            <form onSubmit={(e) => {
              e.preventDefault();
              const form = Object.fromEntries(new FormData(e.currentTarget));
              confirmBooking({
                doctor: bookingDoctor,
                date: form.date,
                timeSlot: form.timeSlot,
                patientName: form.patientName,
                patientEmail: form.patientEmail,
                patientPhone: form.patientPhone,
                patientAge: form.patientAge === '' ? null : Number(form.patientAge),
                patientGender: form.patientGender,
                symptoms: form.symptoms
              });
            }} className="space-y-4">
              <AppointmentSlots doctorId={bookingDoctor.id} onReady={setAvailabilityReady} />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Patient Name</label>
                  <input type="text" name="patientName" defaultValue={isPatientLoggedIn ? patientUser.name : ''} required className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Phone Number</label>
                  <input type="tel" name="patientPhone" defaultValue={isPatientLoggedIn ? patientUser.phone : ''} required className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Email</label>
                  <input type="email" name="patientEmail" defaultValue={isPatientLoggedIn ? patientUser.email : ''} required className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Age</label>
                  <input type="number" name="patientAge" defaultValue={isPatientLoggedIn ? (patientUser.age ?? '') : ''} required className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Gender</label>
                  <select name="patientGender" defaultValue={isPatientLoggedIn ? (patientUser.gender || 'Other') : 'Other'} className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                    <option>Male</option>
                    <option>Female</option>
                    <option>Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Reason / Symptoms</label>
                <textarea name="symptoms" rows="2" placeholder="Briefly describe your symptoms..." className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg"></textarea>
              </div>

              {bookingError && <p role="alert" className="text-sm text-rose-700">{bookingError}</p>}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold">OPD Fee</span>
                  <p className="text-base font-bold text-slate-900">{formatINR(bookingDoctor.consultationFee)}</p>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setBookingDoctor(null)}
                    className="px-3 py-2 rounded-lg text-xs font-semibold border border-slate-200 text-slate-600"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={bookingBusy || !availabilityReady || !bookingDoctor.verified || !bookingDoctor.availableSlots?.length} className="px-5 py-2 rounded-lg text-xs font-bold bg-medRed-600 hover:bg-medRed-700 text-white transition-all"
                  >
                    {bookingBusy ? 'Booking…' : 'Confirm Booking'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DOCTOR DETAILS */}
      {doctorDetailsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 relative">
            <button
              onClick={() => setDoctorDetailsModal(null)}
              className="absolute top-5 right-5 p-1.5 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-start gap-4">
              <img src={doctorDetailsModal.image} alt={doctorDetailsModal.name} className="w-20 h-20 rounded-xl object-cover" />
              <div>
                <span className="text-xs font-bold text-medRed-600 bg-medRed-50 px-2 py-0.5 rounded">{doctorDetailsModal.specialization}</span>
                <h3 className="text-lg font-bold text-slate-900 mt-1">{doctorDetailsModal.name}</h3>
                <p className="text-xs text-slate-500">{doctorDetailsModal.qualifications}</p>
                <p className="text-xs font-mono text-slate-400 mt-0.5">{doctorDetailsModal.licenseNo}</p>
              </div>
            </div>

            <div className="mt-4 p-3 bg-slate-50 rounded-xl text-xs space-y-1 text-slate-600">
              <p>{doctorDetailsModal.about}</p>
              <p className="pt-1"><strong>Hospital:</strong> {doctorDetailsModal.hospital}</p>
              <p><strong>Consultation Fee:</strong> {formatINR(doctorDetailsModal.consultationFee)}</p>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setDoctorDetailsModal(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 text-slate-600"
              >
                Close
              </button>
              <button
                disabled={!doctorDetailsModal.verified}
                onClick={() => {
                  const doc = doctorDetailsModal;
                  setDoctorDetailsModal(null);
                  setBookingDoctor(doc);
                }}
                className="px-4 py-1.5 rounded-lg text-xs font-bold bg-medRed-600 text-white"
              >
                Book OPD Slot
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CANCEL */}
      {cancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200">
            <h3 className="text-sm font-bold text-slate-900">Cancel Appointment?</h3>
            <p className="text-xs text-slate-500 mt-1">
              Cancel OPD booking {cancelModal.id} with {cancelModal.doctorName}?
            </p>

            <div className="mt-3">
              <label className="text-xs font-semibold text-slate-700 block mb-1">Reason for cancellation:</label>
              <select id="cancelReasonInput" className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg">
                <option>Change of schedule</option>
                <option>Feeling better / symptoms resolved</option>
                <option>Visiting alternative clinic</option>
                <option>Other</option>
              </select>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setCancelModal(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600"
              >
                Keep
              </button>
              <button
                onClick={() => {
                  const reason = document.getElementById('cancelReasonInput').value;
                  cancelBooking(cancelModal.id, reason);
                }}
                className="px-4 py-1.5 rounded-lg text-xs font-bold bg-rose-600 text-white"
              >
                Confirm Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Minimal Realistic Footer */}
      <footer className="bg-white border-t border-slate-200 text-slate-500 text-xs py-8 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-medRed-600 text-white flex items-center justify-center font-bold text-xs">
              +
            </div>
            <span className="font-bold text-slate-900">MEDICARE</span>
            <span className="text-slate-400">&bull; Hospital OPD Appointment System</span>
          </div>

          <div className="flex items-center gap-4 text-slate-600 font-medium">
            <button onClick={() => setActivePage('patient-portal')} className="hover:text-slate-900">Patient Portal</button>
            <button onClick={() => setActivePage('doctor-portal')} className="hover:text-slate-900">Doctor Portal</button>
            <button onClick={() => setActivePage('admin-portal')} className="hover:text-slate-900">Admin Control</button>
          </div>

          <p className="text-slate-400">&copy; {new Date().getFullYear()} Medicare. All rights reserved.</p>
        </div>
      </footer>

    </div>
  );
}
