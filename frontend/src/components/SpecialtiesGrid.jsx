import React from 'react';
import { useApp } from '../context/AppContext';
import { SPECIALTIES } from '../data/mockData';
import { 
  Stethoscope, 
  HeartPulse, 
  Brain, 
  Baby, 
  Bone, 
  Sparkles, 
  Activity, 
  Eye, 
  RotateCcw 
} from 'lucide-react';

const iconMap = {
  Stethoscope,
  HeartPulse,
  Brain,
  Baby,
  Bone,
  Sparkles,
  Activity,
  Eye
};

export default function SpecialtiesGrid() {
  const { selectedSpecialty, setSelectedSpecialty } = useApp();

  return (
    <div className="mb-10">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Explore by Medical Specialization</h2>
          <p className="text-xs text-slate-500">Select a specialty to quickly filter certified physicians</p>
        </div>
        {selectedSpecialty !== 'All' && (
          <button
            onClick={() => setSelectedSpecialty('All')}
            className="text-xs font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1"
          >
            <span>Reset specialty</span>
            <RotateCcw className="w-3 h-3" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {SPECIALTIES.map((spec) => {
          const isSelected = selectedSpecialty.toLowerCase() === spec.name.toLowerCase();
          const IconComponent = iconMap[spec.icon] || Activity;

          return (
            <button
              key={spec.name}
              onClick={() => setSelectedSpecialty(spec.name)}
              className={`flex flex-col items-center justify-center p-3.5 rounded-2xl border transition-all text-center ${
                isSelected
                  ? 'bg-brand-600 border-brand-600 text-white shadow-lg shadow-brand-600/25 transform -translate-y-0.5'
                  : 'bg-white border-slate-200 text-slate-700 hover:border-brand-300 hover:bg-slate-50'
              }`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-2 ${
                isSelected ? 'bg-white/20 text-white' : 'bg-brand-50 text-brand-600'
              }`}>
                <IconComponent className="w-5 h-5" />
              </div>
              <span className="text-xs font-bold leading-tight">{spec.name}</span>
              <span className={`text-[10px] mt-0.5 ${isSelected ? 'text-brand-100' : 'text-slate-400'}`}>{spec.count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
