/**
 * SKM EGG RUNNER — Profile Setup Screen
 * Shown once for every new Google account, before entering the game.
 * Collects player name + phone number and creates a fresh Firestore profile.
 */

import React, { useState } from 'react';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../services/firebase/firebase';
import type { User } from 'firebase/auth';

interface ProfileSetupScreenProps {
  user: User;
  onProfileCreated: (playerName: string) => void;
}

const NAME_MIN = 3;
const NAME_MAX = 20;
const NAME_RE  = /^[a-zA-Z0-9 _-]+$/;
const PHONE_RE = /^[6-9]\d{9}$/; // Indian mobile: starts 6-9, 10 digits

export default function ProfileSetupScreen({ user, onProfileCreated }: ProfileSetupScreenProps) {
  const [name,    setName]    = useState('');
  // Pre-fill phone for phone-auth users (strip country code if Indian +91)
  const [phone,   setPhone]   = useState(() => {
    const p = user.phoneNumber ?? '';
    return p.startsWith('+91') ? p.slice(3) : p.replace(/^\+\d{1,3}/, '');
  });
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);

  const validate = (): string => {
    const t = name.trim();
    if (t.length < NAME_MIN) return `Player name must be at least ${NAME_MIN} characters.`;
    if (t.length > NAME_MAX) return `Player name must be ${NAME_MAX} characters or less.`;
    if (!NAME_RE.test(t))    return 'Name: only letters, numbers, spaces, _ and - allowed.';
    const p = phone.trim();
    if (p && !PHONE_RE.test(p)) return 'Enter a valid 10-digit mobile number.';
    return '';
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const err = validate();
    if (err) { setError(err); return; }

    const trimmedName  = name.trim();
    const trimmedPhone = phone.trim();

    setLoading(true);
    setError('');

    try {
      const ref = doc(db, 'users', user.uid);
      const existing = await getDoc(ref);
      if (existing.exists()) {
        onProfileCreated(existing.data().playerName ?? trimmedName);
        return;
      }

      const provider = user.providerData[0]?.providerId ?? 'unknown';
      await setDoc(ref, {
        uid:              user.uid,
        playerName:       trimmedName,
        email:            user.email ?? '',
        photoURL:         user.photoURL ?? '',
        phoneNumber:      user.phoneNumber ?? (trimmedPhone ? `+91${trimmedPhone}` : ''),
        phone:            trimmedPhone,
        provider,
        // Game stats — all zero
        bestScore:        0,
        bestDistance:     0,
        totalRuns:        0,
        totalFeeds:       0,
        totalCrystalEggs: 0,
        totalBrownEggs:   0,
        totalTrays:       0,
        totalBatches:     0,
        level:            1,
        xp:               0,
        currentStage:     'EGG',
        evolutionProgress: 0,
        unlockedSkins:    ['skin_classic'],
        activeSkinId:     'skin_classic',
        dailyRewardStreak:    0,
        lastDailyRewardClaim: null,
        createdAt:        serverTimestamp(),
        lastLogin:        serverTimestamp(),
      });

      onProfileCreated(trimmedName);
    } catch (err) {
      console.error('[ProfileSetup] error:', err);
      setError('Failed to create profile. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    background: 'rgba(255,255,255,0.12)',
    border: '1.5px solid rgba(255,255,255,0.2)',
    color: 'white',
  };

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center p-6 overflow-hidden select-none"
      style={{ background: 'linear-gradient(160deg,#7f0000 0%,#b91c1c 35%,#991b1b 65%,#7f1d1d 100%)' }}
    >
      {/* Decorative glow */}
      <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle,rgba(255,255,255,0.07) 0%,transparent 70%)' }}/>
      <div className="absolute -bottom-32 -left-20 w-80 h-80 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle,rgba(180,0,0,0.35) 0%,transparent 70%)' }}/>

      <div className="w-full max-w-sm z-10">
        {/* Mascot */}
        <div className="flex justify-center mb-4"
          style={{ filter: 'drop-shadow(0 6px 20px rgba(0,0,0,0.5))' }}>
          <img
            src="/THUMBS_POSE__Egg_-removebg-preview.png"
            alt="SKM Egg"
            className="w-24 h-auto object-contain"
          />
        </div>

        {/* Card */}
        <div className="rounded-3xl p-6"
          style={{ background: 'rgba(255,255,255,0.10)', border: '1.5px solid rgba(255,255,255,0.2)', backdropFilter: 'blur(12px)' }}>

          {/* Header */}
          <div className="text-center mb-5">
            <h1 className="text-white font-black text-xl uppercase tracking-tight"
              style={{ fontFamily: '"Arial Black", Impact, sans-serif' }}>
              Welcome to SKM Egg Runner
            </h1>
            <p className="text-white/50 text-xs font-mono mt-1">
              {user.email ?? user.phoneNumber ?? ''}
            </p>
            <div className="mt-2 flex items-center justify-center gap-2">
              <div className="h-px w-8 bg-yellow-400/40"/>
              <p className="text-yellow-300 text-[10px] font-bold tracking-[0.25em] uppercase">Create Your Profile</p>
              <div className="h-px w-8 bg-yellow-400/40"/>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Player Name */}
            <div>
              <label className="text-white/50 text-[10px] font-mono uppercase tracking-widest block mb-1.5">
                Player Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={e => { setName(e.target.value); setError(''); }}
                placeholder="Enter your player name"
                minLength={NAME_MIN}
                maxLength={NAME_MAX}
                required
                autoFocus
                className="w-full py-3 px-4 rounded-xl font-bold text-sm text-center focus:outline-none transition placeholder-white/20 uppercase"
                style={{ ...inputStyle, letterSpacing: '0.08em' }}
                onFocus={e => (e.target.style.borderColor = 'rgba(252,211,77,0.7)')}
                onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.2)')}
              />
              <p className="text-white/25 text-[10px] font-mono text-right mt-0.5">
                {name.trim().length}/{NAME_MAX}
              </p>
            </div>

            {/* Phone Number */}
            <div>
              <label className="text-white/50 text-[10px] font-mono uppercase tracking-widest block mb-1.5">
                Mobile Number <span className="text-white/30 normal-case">(optional)</span>
              </label>
              <div className="flex gap-2">
                {/* Country code badge */}
                <div className="flex items-center justify-center px-3 rounded-xl shrink-0 font-mono text-sm font-bold"
                  style={{ ...inputStyle, border: '1.5px solid rgba(255,255,255,0.2)', color: '#FCD34D' }}>
                  🇮🇳 +91
                </div>
                <input
                  type="tel"
                  inputMode="numeric"
                  value={phone}
                  onChange={e => { setPhone(e.target.value.replace(/\D/g, '').slice(0, 10)); setError(''); }}
                  placeholder="9876543210"
                  maxLength={10}
                  className="flex-1 py-3 px-4 rounded-xl font-mono text-sm focus:outline-none transition placeholder-white/20"
                  style={inputStyle}
                  onFocus={e => (e.target.style.borderColor = 'rgba(252,211,77,0.7)')}
                  onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.2)')}
                />
              </div>
              {phone.length > 0 && (
                <p className="text-white/25 text-[10px] font-mono text-right mt-0.5">
                  {phone.length}/10
                </p>
              )}
            </div>

            {/* Error */}
            {error && (
              <p className="text-yellow-300 text-xs font-mono text-center leading-relaxed">{error}</p>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || name.trim().length < NAME_MIN}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: 'linear-gradient(135deg,#FCD34D 0%,#F59E0B 100%)',
                color: '#7f1d1d',
                boxShadow: '0 4px 20px rgba(252,211,77,0.4)',
              }}
            >
              {loading ? (
                <span className="w-4 h-4 border-2 border-red-900/40 border-t-red-900 rounded-full animate-spin"/>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                </svg>
              )}
              {loading ? 'Creating Profile…' : 'Create Profile'}
            </button>

          </form>
        </div>
      </div>
    </div>
  );
}
