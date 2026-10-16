import { formatINR } from '../utils/currency';
import React from 'react';
import { useApp } from '../context/AppContext';
import { Shield, UserPlus, Plus } from 'lucide-react';

export default function AdminDashboard() {
  const {
    doctors,
    hospitals,
    appointments,
    showToast
  } = useApp();

  return (
    <div>
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-50 text-purple-700 text-xs font-bold mb-2">
          <Shield className="w-3.5 h-3.5" />
          <span>Super Administrator Control</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">Medicare System Overview</h1>
        <p className="text-slate-500 text-sm mt-1">Manage users, approve doctors, oversee hospitals, and monitor appointments system-wide.</p>
      </div>

      {/* KPI Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-xs font-bold text-slate-400 uppercase">Registered Users</span>
          <p className="text-2xl font-black text-slate-900 mt-2">1,842</p>
          <span className="text-[11px] text-brand-600 font-semibold">+124 this week</span>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-xs font-bold text-slate-400 uppercase">Total Doctors</span>
          <p className="text-2xl font-black text-slate-900 mt-2">{doctors.length}</p>
          <span className="text-[11px] text-emerald-600 font-semibold">100% Verified</span>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-xs font-bold text-slate-400 uppercase">Partner Hospitals</span>
          <p className="text-2xl font-black text-slate-900 mt-2">{hospitals.length}</p>
          <span className="text-[11px] text-slate-400 font-medium">4 Active Centers</span>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-xs font-bold text-slate-400 uppercase">System Appointments</span>
          <p className="text-2xl font-black text-slate-900 mt-2">{appointments.length}</p>
          <span className="text-[11px] text-blue-600 font-semibold">Live Real-time</span>
        </div>
      </div>

      {/* Admin Management Tables */}
      <div className="space-y-8">
        {/* Doctors Table */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Manage Doctors</h3>
              <p className="text-xs text-slate-500">Approve credentials and assign hospital departments</p>
            </div>
            <button 
              onClick={() => showToast('Doctor registration modal opened', 'info')}
              className="bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold px-4 py-2 rounded-xl flex items-center gap-1.5"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Add New Doctor</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold uppercase">
                <tr>
                  <th className="px-6 py-3">Doctor Name</th>
                  <th className="px-6 py-3">Specialization</th>
                  <th className="px-6 py-3">Affiliated Hospital</th>
                  <th className="px-6 py-3">Fee</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {doctors.map(doc => (
                  <tr key={doc.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4 flex items-center gap-3">
                      <img src={doc.image} alt={doc.name} className="w-9 h-9 rounded-xl object-cover" />
                      <div>
                        <p className="font-bold text-slate-900">{doc.name}</p>
                        <p className="text-[11px] text-slate-400">{doc.qualifications}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-semibold text-slate-700">{doc.specialization}</td>
                    <td className="px-6 py-4 text-slate-600">{doc.hospital}</td>
                    <td className="px-6 py-4 font-bold text-slate-900">{formatINR(doc.consultationFee)}</td>
                    <td className="px-6 py-4">
                      <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold px-2.5 py-0.5 rounded-full">
                        Verified
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => showToast(`Doctor profile for ${doc.name} modified`, 'info')}
                        className="text-brand-600 font-bold hover:text-brand-800"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Hospitals Management */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Manage Hospitals</h3>
              <p className="text-xs text-slate-500">Accreditation, branches, and emergency contacts</p>
            </div>
            <button 
              onClick={() => showToast('Hospital registration modal opened', 'info')}
              className="bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold px-4 py-2 rounded-xl flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Hospital</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold uppercase">
                <tr>
                  <th className="px-6 py-3">Hospital Name</th>
                  <th className="px-6 py-3">Address</th>
                  <th className="px-6 py-3">Emergency Care</th>
                  <th className="px-6 py-3">Bed Capacity</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {hospitals.map(hosp => (
                  <tr key={hosp.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-900">{hosp.name}</td>
                    <td className="px-6 py-4 text-slate-600">{hosp.address}</td>
                    <td className="px-6 py-4 font-semibold text-emerald-700">{hosp.emergency}</td>
                    <td className="px-6 py-4 text-slate-700">{hosp.beds}</td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => showToast(`Editing hospital details for ${hosp.name}`, 'info')}
                        className="text-brand-600 font-bold hover:text-brand-800"
                      >
                        Manage
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
