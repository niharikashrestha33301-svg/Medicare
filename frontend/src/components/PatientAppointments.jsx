import { formatINR } from '../utils/currency';
import React from 'react';
import { useApp } from '../context/AppContext';
import { Calendar, Plus, CalendarX, Clock, X, Download } from 'lucide-react';

export default function PatientAppointments() {
  const {
    appointments,
    setActiveTab,
    setCancelAppointmentModal,
    showToast
  } = useApp();

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-50 text-brand-700 text-xs font-bold mb-2">
            <Calendar className="w-3.5 h-3.5" />
            <span>Patient Medical Records</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">My Appointments</h1>
          <p className="text-slate-500 text-sm mt-1">Track upcoming consultations, past medical history, and status updates.</p>
        </div>

        <button
          onClick={() => setActiveTab('find-doctors')}
          className="bg-brand-600 hover:bg-brand-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-md shadow-brand-600/25 flex items-center gap-2 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Book New Appointment</span>
        </button>
      </div>

      {appointments.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-slate-200">
          <div className="w-16 h-16 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-4">
            <CalendarX className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-slate-800">No Appointments Scheduled</h3>
          <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
            You do not have any active appointments. Find a doctor and book your consultation in a few quick clicks.
          </p>
          <button
            onClick={() => setActiveTab('find-doctors')}
            className="mt-5 px-6 py-2.5 bg-brand-600 text-white font-bold text-xs rounded-xl hover:bg-brand-700 shadow-md shadow-brand-600/20"
          >
            Browse Doctors
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {appointments.map(apt => {
            const isUpcoming = apt.status === 'Confirmed' || apt.status === 'Pending';
            return (
              <div
                key={apt.id}
                className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-sm hover:shadow-md transition-all flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6"
              >
                {/* Doctor & Patient Information */}
                <div className="flex items-start gap-4 flex-1">
                  <img
                    src={apt.doctor.image}
                    alt={apt.doctor.name}
                    className="w-16 h-16 rounded-2xl object-cover border border-slate-200 shadow-sm"
                  />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-slate-500">{apt.id}</span>
                      <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                        apt.status === 'Confirmed' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                        apt.status === 'Pending' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                        apt.status === 'Completed' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                        'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}>
                        {apt.status}
                      </span>
                      <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-medium">
                        {apt.consultationType}
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-slate-900 mt-1">{apt.doctor.name}</h3>
                    <p className="text-xs font-semibold text-brand-600">{apt.doctor.specialization} &bull; {apt.hospital.name || apt.doctor.hospital}</p>
                    
                    <p className="text-xs text-slate-500 mt-2 italic bg-slate-50 p-2 rounded-lg border border-slate-100 max-w-xl">
                      <span className="font-semibold text-slate-700 not-italic">Notes / Symptoms:</span> {apt.symptoms || 'General Checkup'}
                    </p>
                  </div>
                </div>

                {/* Time & Date Badge */}
                <div className="flex flex-row lg:flex-col items-center lg:items-end justify-between w-full lg:w-auto gap-4 pt-4 lg:pt-0 border-t lg:border-t-0 border-slate-100">
                  <div className="text-left lg:text-right">
                    <div className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
                      <Calendar className="w-4 h-4 text-brand-600" />
                      <span>{apt.date}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 mt-1">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>{apt.timeSlot}</span>
                    </div>
                    <span className="text-xs font-extrabold text-slate-900 mt-1 block">Fee Paid: {formatINR(apt.fee)}</span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {isUpcoming && (
                      <button
                        onClick={() => setCancelAppointmentModal(apt)}
                        className="px-3 py-1.5 bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 rounded-xl text-xs font-bold transition-all flex items-center gap-1"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Cancel</span>
                      </button>
                    )}

                    <button
                      onClick={() => showToast(`Receipt & summary slip downloaded for ${apt.id}`, 'info')}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Summary</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
