import React from 'react';
import { useApp } from '../context/AppContext';

export default function Navbar() {
  const {
    activePage,
    setActivePage,
    isPatientLoggedIn,
    patientUser,
    isDoctorLoggedIn,
    doctorUser
  } = useApp();

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 min-h-16 py-2 flex flex-wrap items-center justify-between gap-3">
        
        {/* Clean Minimal Logo */}
        <div 
          className="flex items-center gap-2 cursor-pointer select-none"
          onClick={() => setActivePage('home')}
        >
          <div className="w-8 h-8 rounded-lg bg-medRed-600 flex items-center justify-center text-white font-bold text-base">
            +
          </div>
          <span className="text-xl font-bold tracking-tight text-slate-900">
            MEDI<span className="text-medRed-600">CARE</span>
          </span>
        </div>

        {/* Main Minimal Nav Links */}
        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-semibold text-slate-600">
          <button
            onClick={() => setActivePage('home')}
            className={`hover:text-slate-900 transition-colors ${activePage === 'home' ? 'text-medRed-600 font-bold' : ''}`}
          >
            Home
          </button>
          <button
            onClick={() => setActivePage('doctors')}
            className={`hover:text-slate-900 transition-colors ${activePage === 'doctors' ? 'text-medRed-600 font-bold' : ''}`}
          >
            Find Doctors
          </button>
          <button
            onClick={() => setActivePage('hospitals')}
            className={`hover:text-slate-900 transition-colors ${activePage === 'hospitals' ? 'text-medRed-600 font-bold' : ''}`}
          >
            Hospitals
          </button>
        </nav>

        {/* Distinct Dedicated Portal Switches */}
        <div className="flex flex-wrap items-center gap-2">
          <a href="/consultations.html" className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700">Video Consultation</a>
          <a href="/pharmacy.html" className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-teal-50 text-teal-700">Online Pharmacy</a>
          <a href="/emergency.html" className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-50 text-rose-700">Emergency SOS</a>
          <a href="/medicines.html" className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700">Medicine Reminder</a>
          <a href="/test-bookings.html" className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700">My Test Bookings</a><a href="/health.html" className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-teal-50 text-teal-700">Health Dashboard</a>
          {/* Patient Portal Button */}
          <button
            onClick={() => setActivePage('patient-portal')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              activePage === 'patient-portal'
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {isPatientLoggedIn ? `Patient: ${patientUser.name.split(' ')[0]}` : 'Patient Portal'}
          </button>

          {/* Doctor Portal Button */}
          <button
            onClick={() => setActivePage('doctor-portal')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              activePage === 'doctor-portal'
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {isDoctorLoggedIn ? `Doctor: ${doctorUser.name.split(' ')[1] || doctorUser.name}` : 'Doctor Portal'}
          </button>

          {/* Admin Portal Button */}
          <button
            onClick={() => setActivePage('admin-portal')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              activePage === 'admin-portal'
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            Admin
          </button>
        </div>
      </div>
    </header>
  );
}
