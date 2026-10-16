import { formatINR } from '../utils/currency';
import React from 'react';
import { useApp } from '../context/AppContext';
import { Stethoscope, Users, Clock, IndianRupee, Star, Plus } from 'lucide-react';

export default function DoctorDashboard() {
  const {
    doctors,
    appointments,
    updateAppointmentStatus,
    addDoctorSlot
  } = useApp();

  return (
    <div>
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold mb-2">
            <Stethoscope className="w-3.5 h-3.5" />
            <span>Doctor Practice Portal</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">Dr. Sarah Jenkins - Practice Hub</h1>
          <p className="text-slate-500 text-sm mt-1">Manage consultation schedule, review patient bookings, and update appointment progress.</p>
        </div>
      </div>

      {/* Doctor KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase">Today's Patients</span>
            <div className="w-8 h-8 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">6</p>
          <span className="text-[11px] text-emerald-600 font-semibold">2 Consultations completed</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase">Pending Requests</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-amber-600 mt-2">
            {appointments.filter(a => a.status === 'Pending').length}
          </p>
          <span className="text-[11px] text-slate-400 font-medium">Awaiting doctor confirmation</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase">Total Revenue</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <IndianRupee className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">{formatINR(appointments.filter(a => a.status === 'Completed').reduce((sum, a) => sum + Number(a.fee || 0), 0))}</p>
          <span className="text-[11px] text-emerald-600 font-semibold">+18% this month</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase">Patient Rating</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">4.9 / 5.0</p>
          <span className="text-[11px] text-slate-400 font-medium">312 Verified Reviews</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left 2 Cols: Booked Appointments Queue */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900">Patient Appointments Queue</h2>
              <span className="text-xs text-slate-500 font-medium">Showing all patient bookings</span>
            </div>

            <div className="space-y-3">
              {appointments.map(apt => (
                <div key={apt.id} className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-white transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-500">{apt.id}</span>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                        apt.status === 'Confirmed' ? 'bg-emerald-100 text-emerald-800' :
                        apt.status === 'Pending' ? 'bg-amber-100 text-amber-800' :
                        apt.status === 'Completed' ? 'bg-blue-100 text-blue-800' : 'bg-rose-100 text-rose-800'
                      }`}>
                        {apt.status}
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-slate-900 mt-1">{apt.patientName} ({apt.patientAge}y, {apt.patientGender})</h4>
                    <p className="text-xs text-slate-500">{apt.patientPhone} &bull; {apt.patientEmail}</p>
                    <p className="text-xs text-slate-600 mt-1 font-medium bg-white p-2 rounded-lg border border-slate-200">
                      <strong>Reason:</strong> {apt.symptoms || 'Routine checkup'}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-slate-600 mt-2 font-semibold">
                      <span>📅 {apt.date}</span>
                      <span>⏰ {apt.timeSlot}</span>
                      <span>🏷️ {formatINR(apt.fee)}</span>
                    </div>
                  </div>

                  {/* Status Change Buttons */}
                  <div className="flex flex-row sm:flex-col gap-1.5 w-full sm:w-auto">
                    {apt.status === 'Pending' && (
                      <button
                        onClick={() => updateAppointmentStatus(apt.id, 'Confirmed')}
                        className="flex-1 sm:flex-none px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm"
                      >
                        Accept & Confirm
                      </button>
                    )}
                    {apt.status === 'Confirmed' && (
                      <button
                        onClick={() => updateAppointmentStatus(apt.id, 'Completed')}
                        className="flex-1 sm:flex-none px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm"
                      >
                        Mark Completed
                      </button>
                    )}
                    {apt.status !== 'Cancelled' && apt.status !== 'Completed' && (
                      <button
                        onClick={() => updateAppointmentStatus(apt.id, 'Cancelled')}
                        className="flex-1 sm:flex-none px-3 py-1.5 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-xl text-xs font-bold border border-rose-200"
                      >
                        Decline
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Col: Slot Manager */}
        <div className="space-y-4">
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900 mb-1">Available Slot Manager</h2>
            <p className="text-xs text-slate-500 mb-4">Add new consultation time slots for patients</p>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Morning Shifts (09:00 AM - 12:00 PM)</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {doctors[0].slots.morning.map((s, i) => (
                    <span key={i} className="text-xs bg-brand-50 text-brand-700 font-bold px-2 py-1 rounded-lg border border-brand-200">
                      {s}
                    </span>
                  ))}
                </div>
                <button
                  onClick={() => addDoctorSlot('morning', '11:45 AM')}
                  className="text-xs text-brand-600 font-bold hover:text-brand-700 flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Add 11:45 AM
                </button>
              </div>

              <div className="pt-3 border-t border-slate-100">
                <label className="text-xs font-bold text-slate-700 block mb-1">Afternoon Shifts (01:00 PM - 04:30 PM)</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {doctors[0].slots.afternoon.map((s, i) => (
                    <span key={i} className="text-xs bg-brand-50 text-brand-700 font-bold px-2 py-1 rounded-lg border border-brand-200">
                      {s}
                    </span>
                  ))}
                </div>
                <button
                  onClick={() => addDoctorSlot('afternoon', '04:00 PM')}
                  className="text-xs text-brand-600 font-bold hover:text-brand-700 flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Add 04:00 PM
                </button>
              </div>

              <div className="pt-3 border-t border-slate-100">
                <label className="text-xs font-bold text-slate-700 block mb-1">Consultation Mode & Fee</label>
                <div className="bg-slate-50 p-3 rounded-xl text-xs space-y-1">
                  <p><strong>Affiliated Hospital:</strong> Metro City Apex Hospital</p>
                  <p><strong>Current Base Fee:</strong> {formatINR(499)} / consultation</p>
                  <p><strong>Working Days:</strong> Mon, Tue, Wed, Thu, Fri</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
