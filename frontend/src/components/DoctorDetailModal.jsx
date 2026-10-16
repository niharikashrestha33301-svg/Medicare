import { formatINR } from '../utils/currency';
import React from 'react';
import { useApp } from '../context/AppContext';
import { X, Star, CalendarPlus } from 'lucide-react';

export default function DoctorDetailModal() {
  const {
    selectedDoctorForDetails,
    setSelectedDoctorForDetails,
    setBookingDoctor
  } = useApp();

  if (!selectedDoctorForDetails) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto custom-scrollbar shadow-2xl border border-slate-200">
        <div className="relative p-6 sm:p-8">
          <button
            onClick={() => setSelectedDoctorForDetails(null)}
            className="absolute top-6 right-6 p-2 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex flex-col sm:flex-row items-start gap-6">
            <img
              src={selectedDoctorForDetails.image}
              alt={selectedDoctorForDetails.name}
              className="w-28 h-28 rounded-3xl object-cover border-2 border-brand-500 shadow-lg"
            />
            <div className="flex-1">
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-brand-50 text-brand-700 border border-brand-200">
                {selectedDoctorForDetails.specialization}
              </span>
              <h2 className="text-2xl font-extrabold text-slate-900 mt-2">{selectedDoctorForDetails.name}</h2>
              <p className="text-xs text-slate-500 font-semibold mt-0.5">{selectedDoctorForDetails.qualifications}</p>
              
              <div className="flex items-center gap-4 mt-3 text-xs">
                <div className="flex items-center text-amber-500 font-bold">
                  <Star className="w-4 h-4 fill-amber-400 mr-1" />
                  <span>{selectedDoctorForDetails.rating}</span>
                  <span className="text-slate-400 font-medium ml-1">({selectedDoctorForDetails.reviewsCount} reviews)</span>
                </div>
                <span className="text-slate-400">&bull;</span>
                <span className="text-slate-700 font-bold">{selectedDoctorForDetails.experience}</span>
              </div>
            </div>
          </div>

          <div className="mt-6 space-y-4 text-sm text-slate-600">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">About Doctor</h4>
              <p className="leading-relaxed bg-slate-50 p-4 rounded-2xl border border-slate-100">{selectedDoctorForDetails.about}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                <span className="text-xs font-bold text-slate-400 block">Working Hospital</span>
                <span className="text-sm font-bold text-slate-900">{selectedDoctorForDetails.hospital}</span>
              </div>
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                <span className="text-xs font-bold text-slate-400 block">Consultation Fee</span>
                <span className="text-lg font-black text-brand-700">{formatINR(selectedDoctorForDetails.consultationFee)}</span>
              </div>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              onClick={() => setSelectedDoctorForDetails(null)}
              className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-sm hover:bg-slate-50"
            >
              Close
            </button>
            <button
              onClick={() => {
                const doc = selectedDoctorForDetails;
                setSelectedDoctorForDetails(null);
                setBookingDoctor(doc);
              }}
              className="px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold text-sm shadow-md shadow-brand-600/30 flex items-center gap-2"
            >
              <CalendarPlus className="w-4 h-4" />
              <span>Proceed to Booking</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
