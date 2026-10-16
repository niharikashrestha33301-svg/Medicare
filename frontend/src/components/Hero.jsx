import React from 'react';
import { useApp } from '../context/AppContext';
import { 
  CheckCircle, 
  ShieldCheck, 
  ChevronRight, 
  ChevronDown, 
  Stethoscope, 
  Video, 
  Building2, 
  Smartphone,
  Calendar,
  CreditCard,
  FileText
} from 'lucide-react';

export default function Hero() {
  const { setActiveTab, setSelectedSpecialty, showToast } = useApp();

  return (
    <div>
      {/* 1. ROYAL BLUE HERO BANNER */}
      <section className="bg-gradient-to-r from-[#0C1E68] via-[#10277C] to-[#0A1856] text-white pt-12 pb-24 relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
          
          <div className="max-w-xl">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-300 mb-2">Medical Orthotics & Primary Care</p>
            <h1 className="text-3xl sm:text-5xl font-black tracking-tight leading-tight mb-4">
              Medicare 2.0
            </h1>
            <p className="text-slate-200 text-sm sm:text-base font-medium mb-6 leading-relaxed">
              Instant video consultation with certified doctors, prescription delivery, and priority clinic bookings across top medical centers.
            </p>

            <div className="flex flex-wrap items-center gap-3 mb-6">
              <span className="flex items-center gap-1.5 bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-full text-xs font-semibold border border-white/20">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                <span>Doctor Recommended</span>
              </span>
              <span className="flex items-center gap-1.5 bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-full text-xs font-semibold border border-white/20">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>100% Certified Practitioners</span>
              </span>
            </div>

            <button
              onClick={() => { setActiveTab('doctors'); }}
              className="px-6 py-3 rounded-xl bg-brandRed-600 hover:bg-brandRed-700 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-brandRed-600/30 flex items-center gap-2 transition-transform active:scale-95"
            >
              <span>Discover Doctors Now</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Hero Graphic Card */}
          <div className="relative">
            <div className="w-72 h-72 sm:w-88 sm:h-88 rounded-3xl overflow-hidden border-4 border-white/20 shadow-2xl">
              <img
                src="https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=700&auto=format&fit=crop&q=80"
                alt="Doctor Care"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </div>

        {/* 2. FLOATING 4-CARD QUICK SERVICE BAR */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 relative -bottom-16 z-20">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 p-2">
            
            {/* Service 1: Find Doctor */}
            <div
              onClick={() => { setSelectedSpecialty('All'); setActiveTab('doctors'); }}
              className="p-4 flex items-center gap-3.5 hover:bg-slate-50 rounded-xl cursor-pointer transition-colors"
            >
              <div className="w-11 h-11 rounded-xl bg-brandRed-50 text-brandRed-600 flex items-center justify-center flex-shrink-0">
                <Stethoscope className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-black text-slate-900 uppercase tracking-wider">Find Doctor</p>
                <p className="text-xs text-slate-500 font-semibold mt-0.5">300+ Verified</p>
              </div>
            </div>

            {/* Service 2: Dr. Video Consultation */}
            <div
              onClick={() => { setActiveTab('doctors'); }}
              className="p-4 flex items-center justify-between hover:bg-slate-50 rounded-xl cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-brandRed-50 text-brandRed-600 flex items-center justify-center flex-shrink-0">
                  <Video className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs font-black text-slate-900 uppercase tracking-wider">Dr. Video Consultation</p>
                  <p className="text-xs text-slate-500 font-semibold mt-0.5">25+ Specialties</p>
                </div>
              </div>
              <ChevronDown className="w-4 h-4 text-slate-400" />
            </div>

            {/* Service 3: Hospital Appointments */}
            <div
              onClick={() => { setActiveTab('hospitals'); }}
              className="p-4 flex items-center justify-between hover:bg-slate-50 rounded-xl cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-brandRed-50 text-brandRed-600 flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs font-black text-slate-900 uppercase tracking-wider">Hospital Appointments</p>
                  <p className="text-xs text-slate-500 font-semibold mt-0.5">All Hospitals</p>
                </div>
              </div>
              <ChevronDown className="w-4 h-4 text-slate-400" />
            </div>

            {/* Service 4: Instant Consultation */}
            <div
              onClick={() => { setActiveTab('doctors'); showToast('Opening instant consultation queue...', 'info'); }}
              className="p-4 flex items-center justify-between hover:bg-slate-50 rounded-xl cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-brandRed-50 text-brandRed-600 flex items-center justify-center flex-shrink-0">
                  <Smartphone className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs font-black text-slate-900 uppercase tracking-wider">Instant Consultation</p>
                  <p className="text-xs text-brandRed-600 font-bold mt-0.5">Free Consultation</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </div>

          </div>
        </div>
      </section>

      {/* 3. VIBRANT RED BANNER: "ACCESS HEALTHCARE SERVICE ANYTIME FROM ANYWHERE" */}
      <section className="bg-[#E61E4D] text-white pt-24 pb-12 mt-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-left mb-10">
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Access healthcare service anytime from anywhere with Medicare
            </h2>
            <p className="text-white/80 text-xs sm:text-sm font-medium mt-1">
              Follow The Simple Steps Below And Get Video / In-Person Consultation
            </p>
          </div>

          {/* 5-Step Process with Connected Flow */}
          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-6">
            
            {/* Step 1 */}
            <div className="bg-white/10 rounded-2xl p-5 border border-white/20 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="w-8 h-8 rounded-full bg-white text-brandRed-600 font-black text-sm flex items-center justify-center">
                    1
                  </div>
                  <Stethoscope className="w-6 h-6 text-white/90" />
                </div>
                <h4 className="text-sm font-bold text-white mb-1.5">Find Doctor</h4>
                <p className="text-xs text-white/80 leading-relaxed font-normal">
                  Find a doctor of the specialty you need in your area.
                </p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="bg-white/10 rounded-2xl p-5 border border-white/20 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="w-8 h-8 rounded-full bg-white text-brandRed-600 font-black text-sm flex items-center justify-center">
                    2
                  </div>
                  <Calendar className="w-6 h-6 text-white/90" />
                </div>
                <h4 className="text-sm font-bold text-white mb-1.5">Book an appointment</h4>
                <p className="text-xs text-white/80 leading-relaxed font-normal">
                  See doctor's available hours, fill your contact info and pick a slot.
                </p>
              </div>
            </div>

            {/* Step 3 */}
            <div className="bg-white/10 rounded-2xl p-5 border border-white/20 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="w-8 h-8 rounded-full bg-white text-brandRed-600 font-black text-sm flex items-center justify-center">
                    3
                  </div>
                  <CreditCard className="w-6 h-6 text-white/90" />
                </div>
                <h4 className="text-sm font-bold text-white mb-1.5">Pay For Consultation</h4>
                <p className="text-xs text-white/80 leading-relaxed font-normal">
                  Easy digital payments via card, digital wallet or pay at hospital.
                </p>
              </div>
            </div>

            {/* Step 4 */}
            <div className="bg-white/10 rounded-2xl p-5 border border-white/20 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="w-8 h-8 rounded-full bg-white text-brandRed-600 font-black text-sm flex items-center justify-center">
                    4
                  </div>
                  <Video className="w-6 h-6 text-white/90" />
                </div>
                <h4 className="text-sm font-bold text-white mb-1.5">Start Consultation</h4>
                <p className="text-xs text-white/80 leading-relaxed font-normal">
                  Start HD Video Consultation or visit doctor at scheduled time.
                </p>
              </div>
            </div>

            {/* Step 5 */}
            <div className="bg-white/10 rounded-2xl p-5 border border-white/20 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="w-8 h-8 rounded-full bg-white text-brandRed-600 font-black text-sm flex items-center justify-center">
                    5
                  </div>
                  <FileText className="w-6 h-6 text-white/90" />
                </div>
                <h4 className="text-sm font-bold text-white mb-1.5">Get Report & Rx</h4>
                <p className="text-xs text-white/80 leading-relaxed font-normal">
                  Get your digital prescription and medical report online immediately.
                </p>
              </div>
            </div>

          </div>
        </div>
      </section>
    </div>
  );
}
