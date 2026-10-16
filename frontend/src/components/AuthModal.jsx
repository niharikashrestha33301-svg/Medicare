import React from 'react';
import { useApp } from '../context/AppContext';
import { X, Lock } from 'lucide-react';

export default function AuthModal() {
  const {
    authModalOpen,
    setAuthModalOpen,
    authMode,
    setAuthMode,
    showToast
  } = useApp();

  if (!authModalOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    setAuthModalOpen(false);
    showToast(authMode === 'login' ? 'Logged in successfully with JWT token!' : 'Account registered successfully!', 'success');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl border border-slate-200 relative">
        <button
          onClick={() => setAuthModalOpen(false)}
          className="absolute top-6 right-6 p-2 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center mx-auto mb-3">
            <Lock className="w-6 h-6" />
          </div>
          <h3 className="text-2xl font-extrabold text-slate-900">
            {authMode === 'login' ? 'Welcome Back to Medicare' : 'Create Medicare Account'}
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            {authMode === 'login' ? 'Access your medical history, appointments & doctors' : 'Join thousands of patients taking control of their healthcare'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {authMode === 'register' && (
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Full Name</label>
              <input
                type="text"
                defaultValue="Emma Richardson"
                required
                className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-brand-500"
              />
            </div>
          )}

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Email Address</label>
            <input
              type="email"
              defaultValue="emma.richardson@example.com"
              required
              className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-brand-500"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Password</label>
            <input
              type="password"
              defaultValue="••••••••"
              required
              className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-brand-500"
            />
          </div>

          <button
            type="submit"
            className="w-full py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold text-xs shadow-md shadow-brand-600/30 transition-all mt-4"
          >
            {authMode === 'login' ? 'Sign In' : 'Create Free Account'}
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-slate-500">
          {authMode === 'login' ? (
            <p>Don't have an account? <button onClick={() => setAuthMode('register')} className="text-brand-600 font-bold hover:underline">Register now</button></p>
          ) : (
            <p>Already have an account? <button onClick={() => setAuthMode('login')} className="text-brand-600 font-bold hover:underline">Sign In</button></p>
          )}
        </div>
      </div>
    </div>
  );
}
