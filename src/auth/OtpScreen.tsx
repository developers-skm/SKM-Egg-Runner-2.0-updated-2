/**
 * SKM EGG RUNNER — OTP Verification Screen
 * Red / White / Yellow brand theme.
 */

import React, { useRef, useState, useEffect } from 'react';
import type { ConfirmationResult } from 'firebase/auth';
import { confirmOtp, sendOtp } from './mobileAuthService';

interface OtpScreenProps {
  phoneNumber: string;
  confirmationResult: ConfirmationResult;
  onBack: () => void;
  onAuthSuccess: () => void;
}

const RESEND_SECONDS = 30;

export default function OtpScreen({
  phoneNumber,
  confirmationResult: initialConfirmation,
  onBack,
  onAuthSuccess,
}: OtpScreenProps) {
  const [digits,         setDigits]         = useState(['', '', '', '', '', '']);
  const [isVerifying,    setIsVerifying]     = useState(false);
  const [error,          setError]           = useState('');
  const [resendCooldown, setResendCooldown]  = useState(RESEND_SECONDS);
  const [isResending,    setIsResending]     = useState(false);
  const [currentResult,  setCurrentResult]   = useState<ConfirmationResult>(initialConfirmation);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Countdown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setInterval(() => {
      setResendCooldown(p => {
        if (p <= 1) { clearInterval(id); return 0; }
        return p - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [resendCooldown]);

  // Auto-focus first box on mount
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleDigitChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[index] = digit;
    setDigits(next);
    setError('');
    if (digit && index < 5) inputRefs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const next = ['', '', '', '', '', ''];
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    setDigits(next);
    inputRefs.current[Math.min(pasted.length, 5)]?.focus();
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = digits.join('');
    if (code.length !== 6) {
      setError('Please enter the complete 6-digit code.');
      return;
    }
    setIsVerifying(true);
    setError('');
    try {
      const result = await confirmOtp(currentResult, code);
      if (result.success) {
        onAuthSuccess();
      } else {
        setError(result.error ?? 'Invalid code. Please try again.');
        setDigits(['', '', '', '', '', '']);
        inputRefs.current[0]?.focus();
      }
    } catch {
      setError('Verification failed. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || isResending) return;
    setIsResending(true);
    setError('');
    try {
      const result = await sendOtp(phoneNumber);
      if (result.success && result.confirmationResult) {
        setCurrentResult(result.confirmationResult);
        setDigits(['', '', '', '', '', '']);
        setResendCooldown(RESEND_SECONDS);
        inputRefs.current[0]?.focus();
      } else {
        setError(result.error ?? 'Failed to resend. Please try again.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setIsResending(false);
    }
  };

  const masked = phoneNumber.replace(/(\+\d{1,3})(\d{3})(\d+)(\d{2})$/, '$1 $2•••$4');

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center p-6 overflow-hidden select-none"
      style={{ background: 'linear-gradient(160deg,#7f0000 0%,#b91c1c 30%,#991b1b 60%,#7f1d1d 100%)' }}
    >
      <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle,rgba(255,255,255,0.07) 0%,transparent 70%)' }}/>

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
          <button onClick={onBack}
            className="w-9 h-9 flex items-center justify-center rounded-xl transition active:scale-90 cursor-pointer"
            style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)' }}
          >
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
            </svg>
          </button>
          <div>
            <h2 className="text-base font-black text-white uppercase tracking-tight">Verify OTP</h2>
            <p className="text-white/50 text-[11px] font-mono">SMS sent to {masked}</p>
          </div>
        </div>

        {/* Shield / verified icon */}
        <div className="flex justify-center mb-5">
          <div className="w-14 h-16 rounded-[50%_50%_50%_50%_/_60%_60%_40%_40%] flex items-center justify-center"
            style={{ background: 'white', boxShadow: '0 0 20px rgba(252,211,77,0.25)' }}
          >
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          </div>
        </div>

        <p className="text-white/60 text-xs font-mono text-center mb-5">
          Enter the 6-digit verification code
        </p>

        <form onSubmit={handleVerify} className="space-y-5">
          {/* OTP digit boxes */}
          <div className="flex gap-2 justify-center" onPaste={handlePaste}>
            {digits.map((digit, i) => (
              <input
                key={i}
                ref={el => { inputRefs.current[i] = el; }}
                type="text" inputMode="numeric" maxLength={1}
                value={digit}
                onChange={e => handleDigitChange(i, e.target.value)}
                onKeyDown={e => handleKeyDown(i, e)}
                className="w-11 text-center text-xl font-black rounded-xl focus:outline-none transition-all"
                style={{
                  height: '52px',
                  background: digit ? 'rgba(252,211,77,0.2)' : 'rgba(255,255,255,0.12)',
                  border: digit ? '2px solid rgba(252,211,77,0.8)' : '2px solid rgba(255,255,255,0.2)',
                  color: 'white',
                }}
                onFocus={e => (e.target.style.borderColor = 'rgba(252,211,77,0.7)')}
                onBlur={e => (e.target.style.borderColor = digit ? 'rgba(252,211,77,0.8)' : 'rgba(255,255,255,0.2)')}
              />
            ))}
          </div>

          {error && (
            <div className="rounded-xl px-3 py-2.5 text-center"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}>
              <p className="text-yellow-300 text-xs font-mono leading-relaxed">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isVerifying || digits.join('').length !== 6}
            className="w-full flex items-center justify-center gap-2 font-black py-3.5 rounded-2xl text-sm uppercase tracking-wide transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: 'linear-gradient(135deg,#FCD34D,#F59E0B)',
              color: '#7f1d1d',
              boxShadow: '0 4px 20px rgba(252,211,77,0.35)',
            }}
          >
            {isVerifying ? (
              <span className="w-4 h-4 border-2 border-red-900/40 border-t-red-900 rounded-full animate-spin"/>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
              </svg>
            )}
            {isVerifying ? 'Verifying…' : 'Verify OTP'}
          </button>
        </form>

        {/* Resend */}
        <div className="text-center mt-5">
          {resendCooldown > 0 ? (
            <p className="text-white/40 text-xs font-mono">
              Resend OTP in{' '}
              <span className="text-yellow-300 font-bold tabular-nums">{resendCooldown}s</span>
            </p>
          ) : (
            <button
              onClick={handleResend}
              disabled={isResending}
              className="text-yellow-300 hover:text-yellow-200 text-xs font-bold transition cursor-pointer disabled:opacity-50"
            >
              {isResending ? 'Resending…' : 'Resend OTP'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
