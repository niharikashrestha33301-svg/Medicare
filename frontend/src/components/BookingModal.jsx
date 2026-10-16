import { formatINR } from '../utils/currency';
import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { X, Building, Video, CheckCircle } from 'lucide-react';

export default function BookingModal() {
  const { bookingDoctor, setBookingDoctor, confirmBooking } = useApp();

  // Generate next 7 days
  const dates = useMemo(() => {
    const list = [];
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i + 1);
      list.push({
        fullDate: d.toISOString().split('T')[0],
        dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
        dayNum: d.getDate(),
        monthName: d.toLocaleDateString('en-US', { month: 'short' })
      });
    }
    return list;
  }, []);

  const [selectedDate, setSelectedDate] = useState(dates[0]?.fullDate || '');
  const [selectedSlot, setSelectedSlot] = useState(
    bookingDoctor?.slots?.morning?.[0] || bookingDoctor?.slots?.afternoon?.[0] || '10:00 AM'
  );
  const [consultationType, setConsultationType] = useState('In-Person Consultation');
  
  const [patientName, setPatientName] = useState('Emma Richardson');
  const [patientEmail, setPatientEmail] = useState('emma.richardson@example.com');
  const [patientPhone, setPatientPhone] = useState('+1 (555) 234-5678');
  const [patientGender, setPatientGender] = useState('Female');
  const [patientAge, setPatientAge] = useState(29);
  const [symptoms, setSymptoms] = useState('');

  if (!bookingDoctor) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    confirmBooking({
      doctor: bookingDoctor,
      date: selectedDate,
      timeSlot: selectedSlot,
      consultationType,
      patientName,
      patientEmail,
      patientPhone,
      patientGender,
      patientAge,
      symptoms
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[92vh] overflow-y-auto custom-scrollbar shadow-2xl border border-slate-200">
        <div className="relative p-6 sm:p-8">
          <button
            onClick={() => setBookingDoctor(null)}
            className="absolute top-6 right-6 p-2 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-4 mb-6 pb-4 border-b border-slate-100">
            <img src={bookingDoctor.image} alt={bookingDoctor.name} className="w-14 h-14 rounded-2xl object-cover border border-slate-200" />
            <div>
              <h3 className="text-xl font-extrabold text-slate-900">Book Appointment</h3>
              <p className="text-xs text-brand-600 font-bold">{bookingDoctor.name} &bull; {bookingDoctor.specialization}</p>
              <p className="text-xs text-slate-400">{bookingDoctor.hospital}</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* 1. SELECT DATE */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-2">1. Select Appointment Date</label>
              <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                {dates.map(d => {
                  const isSelected = selectedDate === d.fullDate;
                  return (
                    <button
                      key={d.fullDate}
                      type="button"
                      onClick={() => setSelectedDate(d.fullDate)}
                      className={`p-2.5 rounded-2xl border text-center transition-all ${
                        isSelected
                          ? 'bg-brand-600 border-brand-600 text-white shadow-md shadow-brand-600/30'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-brand-300'
                      }`}
                    >
                      <span className={`text-[10px] font-bold block uppercase ${isSelected ? 'text-brand-100' : 'text-slate-400'}`}>{d.dayName}</span>
                      <span className="text-base font-extrabold block my-0.5">{d.dayNum}</span>
                      <span className={`text-[9px] block ${isSelected ? 'text-brand-100' : 'text-slate-400'}`}>{d.monthName}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. SELECT TIME SLOT */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-2">2. Choose Available Time Slot</label>
              
              {/* Morning Slots */}
              <div className="mb-3">
                <span className="text-[11px] font-bold text-slate-400 block mb-1.5">Morning Slots</span>
                <div className="flex flex-wrap gap-2">
                  {bookingDoctor.slots.morning.map(slot => (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => setSelectedSlot(slot)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                        selectedSlot === slot
                          ? 'bg-brand-600 border-brand-600 text-white shadow-sm'
                          : 'bg-white border-slate-200 text-slate-700 hover:border-brand-300'
                      }`}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              </div>

              {/* Afternoon Slots */}
              <div className="mb-3">
                <span className="text-[11px] font-bold text-slate-400 block mb-1.5">Afternoon Slots</span>
                <div className="flex flex-wrap gap-2">
                  {bookingDoctor.slots.afternoon.map(slot => (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => setSelectedSlot(slot)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                        selectedSlot === slot
                          ? 'bg-brand-600 border-brand-600 text-white shadow-sm'
                          : 'bg-white border-slate-200 text-slate-700 hover:border-brand-300'
                      }`}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              </div>

              {/* Evening Slots */}
              <div>
                <span className="text-[11px] font-bold text-slate-400 block mb-1.5">Evening Slots</span>
                <div className="flex flex-wrap gap-2">
                  {bookingDoctor.slots.evening.map(slot => (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => setSelectedSlot(slot)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                        selectedSlot === slot
                          ? 'bg-brand-600 border-brand-600 text-white shadow-sm'
                          : 'bg-white border-slate-200 text-slate-700 hover:border-brand-300'
                      }`}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 3. CONSULTATION TYPE */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-2">3. Consultation Method</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setConsultationType('In-Person Consultation')}
                  className={`p-3 rounded-2xl border text-left flex items-center gap-3 ${
                    consultationType === 'In-Person Consultation' ? 'bg-brand-50 border-brand-600 text-brand-900' : 'bg-slate-50 border-slate-200 text-slate-700'
                  }`}
                >
                  <Building className="w-5 h-5 text-brand-600" />
                  <div>
                    <p className="text-xs font-bold">Hospital Visit</p>
                    <p className="text-[10px] text-slate-500">Meet at clinic room</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setConsultationType('Video Consultation')}
                  className={`p-3 rounded-2xl border text-left flex items-center gap-3 ${
                    consultationType === 'Video Consultation' ? 'bg-brand-50 border-brand-600 text-brand-900' : 'bg-slate-50 border-slate-200 text-slate-700'
                  }`}
                >
                  <Video className="w-5 h-5 text-brand-600" />
                  <div>
                    <p className="text-xs font-bold">HD Video Call</p>
                    <p className="text-[10px] text-slate-500">Join secure digital room</p>
                  </div>
                </button>
              </div>
            </div>

            {/* 4. PATIENT DETAILS & SYMPTOMS */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-2">4. Patient Details & Reason</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <div>
                  <span className="text-[11px] font-bold text-slate-600 block mb-1">Patient Full Name</span>
                  <input
                    type="text"
                    value={patientName}
                    onChange={(e) => setPatientName(e.target.value)}
                    required
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-brand-500"
                  />
                </div>
                <div>
                  <span className="text-[11px] font-bold text-slate-600 block mb-1">Phone Contact</span>
                  <input
                    type="tel"
                    value={patientPhone}
                    onChange={(e) => setPatientPhone(e.target.value)}
                    required
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <div>
                <span className="text-[11px] font-bold text-slate-600 block mb-1">Symptoms or Medical Concern</span>
                <textarea
                  rows="2"
                  value={symptoms}
                  onChange={(e) => setSymptoms(e.target.value)}
                  placeholder="Briefly describe what you're feeling (e.g. chest tightness, fever, follow-up)..."
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-brand-500"
                ></textarea>
              </div>
            </div>

            {/* SUMMARY & SUBMIT */}
            <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400">Total Consultation Fee</span>
                <p className="text-xl font-black text-slate-900">{formatINR(bookingDoctor.consultationFee)}</p>
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setBookingDoctor(null)}
                  className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 sm:flex-none px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold text-xs shadow-md shadow-brand-600/30 flex items-center justify-center gap-2"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>Confirm & Book</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
