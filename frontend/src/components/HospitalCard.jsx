import React from 'react';
import { useApp } from '../context/AppContext';
import { Star, MapPin, Phone, ChevronRight } from 'lucide-react';

export default function HospitalCard({ hospital }) {
  const { setSelectedHospitalFilter, setActiveTab } = useApp();

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col md:flex-row hover:shadow-xl transition-all duration-300">
      <div className="md:w-5/12 relative h-52 md:h-auto">
        <img src={hospital.image} alt={hospital.name} className="w-full h-full object-cover" />
        <div className="absolute top-3 left-3 bg-slate-900/80 backdrop-blur-md text-white text-xs font-bold px-2.5 py-1 rounded-lg">
          {hospital.beds}
        </div>
      </div>

      <div className="md:w-7/12 p-6 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
              {hospital.emergency}
            </span>
            <div className="flex items-center text-amber-500 text-xs font-bold">
              <Star className="w-3.5 h-3.5 fill-amber-400 mr-1" />
              <span>{hospital.rating}</span>
            </div>
          </div>

          <h3 className="text-lg font-bold text-slate-900 mt-2 leading-snug">{hospital.name}</h3>
          <p className="text-xs text-slate-500 font-medium flex items-center gap-1 mt-1">
            <MapPin className="w-3.5 h-3.5 text-slate-400" />
            <span>{hospital.address}</span>
          </p>
          <p className="text-xs text-slate-600 font-semibold flex items-center gap-1 mt-1">
            <Phone className="w-3.5 h-3.5 text-brand-600" />
            <span>{hospital.phone}</span>
          </p>

          <div className="mt-4">
            <p className="text-[10px] uppercase font-bold text-slate-400 mb-1.5">Specialized Departments:</p>
            <div className="flex flex-wrap gap-1">
              {hospital.departments.map((dept, i) => (
                <span key={i} className="text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-medium">
                  {dept}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="pt-5 mt-4 border-t border-slate-100 flex items-center justify-between">
          <span className="text-xs text-slate-500 font-medium">{hospital.doctorsCount} Physicians On Duty</span>
          <button
            onClick={() => {
              setSelectedHospitalFilter(hospital.name);
              setActiveTab('find-doctors');
            }}
            className="text-xs font-bold text-brand-600 hover:text-brand-700 flex items-center gap-1 bg-brand-50 px-3 py-1.5 rounded-xl transition-colors"
          >
            <span>View Doctors</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
