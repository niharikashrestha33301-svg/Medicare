import React from 'react';

export default function Footer() {
  return (
    <footer className="bg-slate-900 text-slate-400 text-xs py-12 border-t border-slate-800 mt-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div>
            <div className="flex items-center gap-2 text-white font-extrabold text-lg mb-3">
              <div className="w-8 h-8 rounded-xl bg-brand-500 flex items-center justify-center text-white">
                <span className="text-xl font-bold leading-none">+</span>
              </div>
              <span>Medi<span className="text-brand-400">care</span></span>
            </div>
            <p className="text-slate-400 leading-relaxed">
              Connecting patients, board-certified doctors, and accredited hospital facilities for transparent, accessible healthcare scheduling.
            </p>
          </div>

          <div>
            <h4 className="text-white font-bold mb-3 uppercase tracking-wider text-[11px]">For Patients</h4>
            <ul className="space-y-2">
              <li><a href="#" className="hover:text-white transition-colors">Search by Specialization</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Partner Hospitals</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Emergency Helplines</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Appointment History</a></li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-bold mb-3 uppercase tracking-wider text-[11px]">For Physicians</h4>
            <ul className="space-y-2">
              <li><a href="#" className="hover:text-white transition-colors">Doctor Portal Login</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Slot Schedule Manager</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Practice Analytics</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Medical Board Verification</a></li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-bold mb-3 uppercase tracking-wider text-[11px]">24/7 Emergency Line</h4>
            <p className="text-emerald-400 font-extrabold text-base mb-1">+1 (800) 911-CARE</p>
            <p className="text-slate-500">Available round-the-clock across all major affiliated medical trauma centers.</p>
          </div>
        </div>

        <div className="pt-8 border-t border-slate-800 text-center text-slate-500 text-[11px]">
          &copy; {new Date().getFullYear()} Medicare Inc. All rights reserved. React + Tailwind CSS + Node.js + Express + MongoDB Architecture.
        </div>
      </div>
    </footer>
  );
}
