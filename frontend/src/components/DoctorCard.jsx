import React from 'react';
import { useApp } from '../context/AppContext';
import { ChevronRight, Clock, Star } from 'lucide-react';

export default function DoctorCard({ doctor }) {
  const { setSelectedDoctorForDetails, setBookingDoctor } = useApp();

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
      <div>
        {/* Doctor Photo with Red Corner Arrow */}
        <div className="relative h-60 bg-slate-100">
          <img
            src={doctor.image}
            alt={doctor.name}
            className="w-full h-full object-cover object-top"
          />
          <div 
            onClick={() => setSelectedDoctorForDetails(doctor)}
            className="absolute bottom-0 right-0 w-8 h-8 bg-brandRed-600 text-white flex items-center justify-center cursor-pointer hover:bg-brandRed-700 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </div>
        </div>

        {/* Details */}
        <div className="p-4">
          <h3 className="text-sm font-bold text-slate-900 leading-snug">{doctor.name}</h3>
          <p className="text-xs text-slate-500 font-medium mt-0.5">{doctor.specialization}</p>

          {/* Next Available Pill */}
          <div className="mt-3 flex items-center gap-1 text-[11px] text-brandRed-600 font-bold">
            <Clock className="w-3.5 h-3.5 text-brandRed-500" />
            <span>Next available time: <span className="font-semibold text-slate-600">{doctor.nextAvailable}</span></span>
          </div>
        </div>
      </div>

      {/* Booking Action */}
      <div className="p-4 pt-0">
        <button
          onClick={() => setBookingDoctor(doctor)}
          className="w-full py-2 px-3 rounded-lg border border-slate-300 hover:border-brandRed-600 hover:text-brandRed-600 text-slate-700 text-xs font-bold transition-all flex items-center justify-center gap-1"
        >
          <span>Book Appointment</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
