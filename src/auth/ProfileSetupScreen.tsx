/**
 * SKM EGG RUNNER — Profile Setup Screen
 * Shown once for every new Google account, before entering the game.
 * Creates the Firestore users/{uid} document with a fresh zero profile.
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
const NAME_RE  = /^[a-zA-Z0-9 _-]+$/; // letters, numbers, space, underscore, hyphen

export default function ProfileSetupScreen({ user, onProfileCreated }: ProfileSetupScreenProps) {
  const [name,     setName]     = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const validate = (v: string): string => {
    const t = v.trim();
    if (t.length < NAME_MIN) return `Name must be at least ${NAME_MIN} characters.`;
    if (t.length > NAME_MAX) return `Name must be ${NAME_MAX} characters or less.`;
    if (!NAME_RE.test(t))    return 'Only letters, numbers, spaces, _ and - allowed.';
    return '';
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = name.trim();
    const err = validate(trimmed);
    if (err) { setError(err); return; }

    setLoading(true);
    setError('');

    try {
      // Check if name is already taken
      // (simple check — in production add a separate playerNames collection)
      const ref = doc(db, 'users', user.uid);
      const existing = await getDoc(ref);
      if (existing.exists()) {
        // Profile was created in a race — just proceed
        onProfileCreated(existing.data().playerName ?? trimmed);
        return;
      }

      // Create fresh profile — all stats start at zero
      await setDoc(ref, {
        uid:              user.uid,
        playerName:       trimmed,
        email:            user.email ?? '',
        photoURL:         user.photoURL ?? '',
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
        // Inventory / skins
        unlockedSkins:    ['skin_classic'],
        activeSkinId:     'skin_classic',
        // Streak
        dailyRewardStreak:   0,
        lastDailyRewardClaim: null,
        // Timestamps
        createdAt:        serverTimestamp(),
        lastLogin:        serverTimestamp(),
      });

      onProfileCreated(trimmed);
    } catch (err) {
      console.error('[ProfileSetup] error:', err);
      setError('Failed to create profile. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
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
          <svg width="90" height="90" viewBox="0 0 512 512">
            <ellipse cx="256" cy="260" rx="110" ry="145" fill="#FFFFFF" stroke="#e5e5e5" strokeWidth="4"/>
            <path d="M170 120 Q256 55 342 120 L342 150 L170 150 Z" fill="#DC2626"/>
            <ellipse cx="256" cy="150" rx="105" ry="18" fill="#b91c1c"/>
            <ellipse cx="256" cy="112" rx="45" ry="20" fill="#FFF8DC" stroke="#DC2626" strokeWidth="2"/>
            <text x="256" y="118" fontSize="18" fontWeight="bold" textAnchor="middle" fill="#DC2626">BEST</text>
            <ellipse cx="225" cy="235" rx="22" ry="34" fill="white"/>
            <ellipse cx="287" cy="235" rx="22" ry="34" fill="white"/>
            <circle cx="225" cy="240" r="10" fill="#6B3E26"/>
            <circle cx="287" cy="240" r="10" fill="#6B3E26"/>
            <circle cx="228" cy="237" r="3" fill="white"/>
            <circle cx="290" cy="237" r="3" fill="white"/>
            <path d="M210 305 Q256 340 302 305" stroke="#ccc" strokeWidth="5" fill="none" strokeLinecap="round"/>
          </svg>
        </div>

        {/* Card */}
        <div className="rounded-3xl p-6"
          style={{ background: 'rgba(255,255,255,0.10)', border: '1.5px solid rgba(255,255,255,0.2)', backdropFilter: 'blur(12px)' }}>

          <div className="text-center mb-5">
            <h1 className="text-white font-black text-xl uppercase tracking-tight"
              style={{ fontFamily: '"Arial Black", Impact, sans-serif' }}>
              Welcome to SKM Egg Runner
            </h1>
            <p className="text-white/60 text-xs font-mono mt-1">
              {user.email}
            </p>
            <div className="mt-2 flex items-center justify-center gap-2">
              <div className="h-px w-8 bg-yellow-400/40"/>
              <p className="text-yellow-300 text-[10px] font-bold tracking-[0.25em] uppercase">Create Your Profile</p>
              <div className="h-px w-8 bg-yellow-400/40"/>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-white/50 text-[10px] font-mono uppercase tracking-widest block mb-1.5">
                Player Name
              </label>
              <input
                type="text"
                value={name}
                onChange={e => { setName(e.target.value); setError(''); }}
                placeholder="Enter your name"
                minLength={NAME_MIN}
                maxLength={NAME_MAX}
                required
                autoFocus
                className="w-full py-3 px-4 rounded-xl font-bold text-sm text-center focus:outline-none transition placeholder-white/20 uppercase"
                style={{
                  background: 'rgba(255,255,255,0.12)',
                  border: '1.5px solid rgba(255,255,255,0.2)',
                  color: 'white',
                  letterSpacing: '0.1em',
                }}
                onFocus={e => (e.target.style.borderColor = 'rgba(252,211,77,0.7)')}
                onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.2)')}
              />
              <p className="text-white/30 text-[10px] font-mono text-right mt-1">
                {name.trim().length}/{NAME_MAX}
              </p>
            </div>

            {error && (
              <p className="text-yellow-300 text-xs font-mono text-center leading-relaxed">{error}</p>
            )}

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
