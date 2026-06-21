/**
 * SKM EGG RUNNER — Mobile Number Entry Screen
 * Red / White / Yellow brand theme.
 */

import React, { useState } from 'react';
import type { ConfirmationResult } from 'firebase/auth';
import { sendOtp } from './mobileAuthService';
import OtpScreen from './OtpScreen';

interface LoginScreenProps {
  onBack: () => void;
  onAuthSuccess: () => void;
}

const COUNTRY_CODES = [
  { flag: '🇮🇳', code: '+91',  name: 'India' },
  { flag: '🇺🇸', code: '+1',   name: 'USA' },
  { flag: '🇬🇧', code: '+44',  name: 'UK' },
  { flag: '🇦🇺', code: '+61',  name: 'Australia' },
  { flag: '🇨🇦', code: '+1',   name: 'Canada' },
  { flag: '🇸🇬', code: '+65',  name: 'Singapore' },
  { flag: '🇦🇪', code: '+971', name: 'UAE' },
  { flag: '🇲🇾', code: '+60',  name: 'Malaysia' },
];

export default function LoginScreen({ onBack, onAuthSuccess }: LoginScreenProps) {
  const [selectedCountry,   setSelectedCountry]   = useState(COUNTRY_CODES[0]);
  const [phoneNumber,       setPhoneNumber]        = useState('');
  const [isLoading,         setIsLoading]          = useState(false);
  const [error,             setError]              = useState('');
  const [showCountryPicker, setShowCountryPicker]  = useState(false);
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const digits = phoneNumber.trim();
    if (digits.length < 6) {
      setError('Please enter a valid mobile number.');
      return;
    }

    const fullNumber = selectedCountry.code + digits;
    setIsLoading(true);

    try {
      const result = await sendOtp(fullNumber);
      if (result.success && result.confirmationResult) {
        setConfirmationResult(result.confirmationResult);
      } else {
        setError(result.error ?? 'Failed to send OTP. Please try again.');
      }
    } catch {
      setError('Network error. Please check your connection.');
    } finally {
      setIsLoading(false);
    }
  };

  if (confirmationResult) {
    return (
      <OtpScreen
        phoneNumber={selectedCountry.code + phoneNumber.trim()}
        confirmationResult={confirmationResult}
        onBack={() => {
          setConfirmationResult(null);
          setPhoneNumber('');
          setError('');
        }}
        onAuthSuccess={onAuthSuccess}
      />
    );
  }

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center p-6 overflow-hidden select-none"
      style={{ background: 'linear-gradient(160deg,#7f0000 0%,#b91c1c 30%,#991b1b 60%,#7f1d1d 100%)' }}
    >
      {/* Decorative circles */}
      <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle,rgba(255,255,255,0.07) 0%,transparent 70%)' }}/>

      {/* Card */}
      <div className="w-full max-w-sm z-10"
        style={{
          background: 'rgba(255,255,255,0.10)',
          border: '1.5px solid rgba(255,255,255,0.2)',
          borderRadius: '24px',
          padding: '28px 24px',
          boxShadow: '0 8px 40px rgba(0,0,0,0.35)',
          backdropFilter: 'blur(12px)',
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={onBack}
            className="w-9 h-9 flex items-center justify-center rounded-xl transition active:scale-90 cursor-pointer"
            style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)' }}
          >
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
            </svg>
          </button>
          <div>
            <h2 className="text-base font-black text-white uppercase tracking-tight">Enter Mobile Number</h2>
            <p className="text-white/50 text-[11px] font-mono">We'll send a verification code via SMS</p>
          </div>
        </div>

        {/* Egg icon */}
        <div className="flex justify-center mb-5">
          <div className="w-14 h-16 rounded-[50%_50%_50%_50%_/_60%_60%_40%_40%] flex items-center justify-center"
            style={{ background: 'white', boxShadow: '0 0 20px rgba(252,211,77,0.25)' }}
          >
            <svg className="w-6 h-6" fill="none" stroke="#DC2626" strokeWidth={2} viewBox="0 0 24 24">
              <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
              <circle cx="12" cy="17" r="1" fill="#DC2626"/>
            </svg>
          </div>
        </div>

        <form onSubmit={handleSendOtp} className="space-y-4">
          <div>
            <label className="text-white/50 text-[10px] font-mono uppercase tracking-widest block mb-1.5">
              Mobile Number
            </label>
            <div className="flex gap-2">
              {/* Country picker */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowCountryPicker(v => !v)}
                  className="h-12 px-3 rounded-xl flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap font-mono text-sm"
                  style={{ background: 'rgba(255,255,255,0.15)', border: '1.5px solid rgba(255,255,255,0.25)', color: 'white' }}
                >
                  <span>{selectedCountry.flag}</span>
                  <span className="text-yellow-300 font-bold">{selectedCountry.code}</span>
                  <svg className="w-3 h-3 text-white/50" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
                  </svg>
                </button>
                {showCountryPicker && (
                  <div className="absolute top-full left-0 mt-1 w-52 rounded-xl shadow-2xl z-50 overflow-hidden"
                    style={{ background: '#7f0000', border: '1.5px solid rgba(255,255,255,0.2)' }}
                  >
                    {COUNTRY_CODES.map(c => (
                      <button key={c.name} type="button"
                        onClick={() => { setSelectedCountry(c); setShowCountryPicker(false); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-sm transition cursor-pointer"
                        style={{ color: 'white' }}
                        onMouseEnter={e => (e.currentTarget.style.background='rgba(255,255,255,0.12)')}
                        onMouseLeave={e => (e.currentTarget.style.background='transparent')}
                      >
                        <span>{c.flag}</span>
                        <span className="text-yellow-300 font-bold font-mono">{c.code}</span>
                        <span className="text-white/60 text-xs">{c.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Number input */}
              <input
                type="tel" inputMode="numeric"
                placeholder="9876543210"
                value={phoneNumber}
                onChange={e => { setPhoneNumber(e.target.value.replace(/\D/g, '')); setError(''); }}
                maxLength={12} required
                className="flex-1 h-12 font-mono text-sm px-4 rounded-xl focus:outline-none transition placeholder-white/25"
                style={{
                  background: 'rgba(255,255,255,0.12)',
                  border: '1.5px solid rgba(255,255,255,0.2)',
                  color: 'white',
                }}
                onFocus={e => (e.target.style.borderColor='rgba(252,211,77,0.7)')}
                onBlur={e => (e.target.style.borderColor='rgba(255,255,255,0.2)')}
              />
            </div>
          </div>

          {error && (
            <div className="rounded-xl px-3 py-2.5 text-center"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}>
              <p className="text-yellow-300 text-xs font-mono leading-relaxed">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || phoneNumber.trim().length < 6}
            className="w-full flex items-center justify-center gap-2 font-black py-3.5 rounded-2xl text-sm uppercase tracking-wide transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: 'linear-gradient(135deg,#FCD34D,#F59E0B)',
              color: '#7f1d1d',
              boxShadow: '0 4px 20px rgba(252,211,77,0.35)',
            }}
          >
            {isLoading ? (
              <span className="w-4 h-4 border-2 border-red-900/40 border-t-red-900 rounded-full animate-spin"/>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7"/>
              </svg>
            )}
            {isLoading ? 'Sending OTP…' : 'Send OTP'}
          </button>
        </form>

        <p className="text-center text-white/25 text-[10px] font-mono mt-4">
          Standard SMS rates may apply
        </p>
      </div>
    </div>
  );
}
