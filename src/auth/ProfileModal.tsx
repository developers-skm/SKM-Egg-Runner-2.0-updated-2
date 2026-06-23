/**
 * SKM EGG RUNNER — Profile Modal
 * Shows real Firebase data for the logged-in user.
 * Includes Edit Name, Logout, and Delete My Data.
 */

import React, { useState } from 'react';
import { doc, deleteDoc, updateDoc, serverTimestamp, collection, getDocs } from 'firebase/firestore';
import { deleteUser, updateProfile, reauthenticateWithPopup, GoogleAuthProvider, reauthenticateWithPhoneNumber, RecaptchaVerifier } from 'firebase/auth';
import { db, auth } from '../services/firebase/firebase';
import type { User } from 'firebase/auth';
import type { PlayerStats } from '../types';

interface ProfileModalProps {
  isOpen:   boolean;
  onClose:  () => void;
  user:     User;
  stats:    PlayerStats;
  onLogout: () => Promise<void>;
  onDataDeleted: () => void;
}

type View = 'PROFILE' | 'EDIT_NAME' | 'DELETE_CONFIRM';

export default function ProfileModal({
  isOpen, onClose, user, stats, onLogout, onDataDeleted,
}: ProfileModalProps) {
  const [view,       setView]       = useState<View>('PROFILE');
  const [newName,    setNewName]    = useState('');
  const [nameErr,    setNameErr]    = useState('');
  const [nameLoading,setNameLoading]= useState(false);
  const [delLoading, setDelLoading] = useState(false);
  const [delErr,     setDelErr]     = useState('');

  if (!isOpen) return null;

  const createdDate   = user.metadata.creationTime
    ? new Date(user.metadata.creationTime).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })
    : '—';
  const lastLogin     = user.metadata.lastSignInTime
    ? new Date(user.metadata.lastSignInTime).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })
    : '—';
  const playerName    = user.displayName ?? 'Runner';

  // ── edit name ─────────────────────────────────────────────────────────────
  const handleSaveName = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const t = newName.trim();
    if (t.length < 3)  { setNameErr('Minimum 3 characters.'); return; }
    if (t.length > 20) { setNameErr('Maximum 20 characters.'); return; }
    if (!/^[a-zA-Z0-9 _-]+$/.test(t)) { setNameErr('Only letters, numbers, spaces, _ and - allowed.'); return; }
    setNameLoading(true);
    setNameErr('');
    try {
      await updateProfile(auth.currentUser!, { displayName: t });
      await updateDoc(doc(db, 'users', user.uid), { playerName: t, updatedAt: serverTimestamp() });
      setView('PROFILE');
      setNewName('');
    } catch (err) {
      console.error(err);
      setNameErr('Failed to update name. Try again.');
    } finally {
      setNameLoading(false);
    }
  };

  // ── delete account ────────────────────────────────────────────────────────
  const handleDeleteForever = async () => {
    setDelLoading(true);
    setDelErr('');
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setDelErr('No authenticated user found. Please log in again.');
      setDelLoading(false);
      return;
    }

    try {
      // Step 1: Re-authenticate so Firebase accepts the deleteUser call
      const provider = currentUser.providerData[0]?.providerId ?? '';
      if (provider === 'google.com') {
        await reauthenticateWithPopup(currentUser, new GoogleAuthProvider());
      } else if (provider === 'phone') {
        // For phone users: re-send OTP then confirm — use a temp invisible reCAPTCHA
        const tempDiv = document.createElement('div');
        tempDiv.id = 'reauth-recaptcha-' + Date.now();
        tempDiv.style.display = 'none';
        document.body.appendChild(tempDiv);
        try {
          const verifier = new RecaptchaVerifier(auth, tempDiv.id, { size: 'invisible' });
          const confirmResult = await reauthenticateWithPhoneNumber(currentUser, currentUser.phoneNumber!, verifier);
          verifier.clear();
          document.body.removeChild(tempDiv);
          // Prompt the user for the OTP code
          const code = window.prompt('Enter the OTP sent to ' + currentUser.phoneNumber + ' to confirm deletion:');
          if (!code) {
            setDelErr('OTP is required to delete your account.');
            setDelLoading(false);
            return;
          }
          await confirmResult.confirm(code.trim());
        } catch (reAuthErr) {
          try { document.body.removeChild(tempDiv); } catch { /* already removed */ }
          throw reAuthErr;
        }
      }
      // For any other provider, attempt deleteUser directly (will work if session is fresh)

      // Step 2: Delete Firestore data
      const uid = currentUser.uid;
      const topLevelDocs = [
        `users/${uid}`,
        `settings/${uid}`,
        `login_streaks/${uid}`,
        `tracker_settings/${uid}`,
        `tracker_rewards/${uid}`,
        `tracker_leaderboard/${uid}`,
        `leaderboard/${uid}`,
        `streak_shields/${uid}`,
      ];
      await Promise.allSettled(topLevelDocs.map(p => deleteDoc(doc(db, p))));

      // Sub-collections
      const subColPaths: [string, string][] = [
        ['missions', 'daily'],
        ['achievements', 'list'],
        ['protein_logs', 'entries'],
        ['daily_stats', 'days'],
        ['tracker_achievements', 'list'],
        ['tracker_challenges', 'list'],
        ['daily_missions', 'days'],
        ['weekly_missions', 'weeks'],
        ['login_streaks', 'claims'],
        ['game_rewards', 'unlocked'],
      ];
      await Promise.allSettled(
        subColPaths.map(async ([col, sub]) => {
          const snap = await getDocs(collection(db, col, uid, sub));
          return Promise.allSettled(snap.docs.map(d => deleteDoc(d.ref)));
        })
      );

      // Step 3: Delete Firebase Auth account
      await deleteUser(currentUser);

      onDataDeleted();
    } catch (err: unknown) {
      console.error('[DELETE]', err);
      const code = (err as { code?: string }).code ?? '';
      if (code === 'auth/requires-recent-login') {
        setDelErr('Session expired. Please log out, log back in, and try again.');
      } else if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setDelErr('Re-authentication cancelled. Please try again.');
      } else if (code === 'auth/invalid-verification-code') {
        setDelErr('Incorrect OTP. Please try again.');
      } else {
        setDelErr('Deletion failed. Please try again.');
      }
      setDelLoading(false);
    }
  };

  // ── shared components ─────────────────────────────────────────────────────

  const Row = ({ label, value }: { label: string; value: string | number }) => (
    <div className="flex items-center justify-between py-2 border-b border-white/5">
      <span className="text-white/50 text-xs font-mono">{label}</span>
      <span className="text-white font-bold text-xs text-right">{value}</span>
    </div>
  );

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="mb-4">
      <p className="text-yellow-400 text-[10px] font-black uppercase tracking-widest mb-2 font-mono">{title}</p>
      <div className="rounded-2xl px-3 py-1"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
        {children}
      </div>
    </div>
  );

  // ─────────────────────────────────────────────
  // DELETE CONFIRM VIEW
  // ─────────────────────────────────────────────
  if (view === 'DELETE_CONFIRM') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-5"
        style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)' }}>
        <div className="w-full max-w-sm rounded-3xl p-6"
          style={{ background: '#1a0505', border: '2px solid rgba(239,68,68,0.4)' }}>
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(239,68,68,0.15)', border: '2px solid rgba(239,68,68,0.5)' }}>
              <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/>
              </svg>
            </div>
          </div>
          <h3 className="text-white font-black text-base text-center uppercase tracking-wide mb-2">Are you sure?</h3>
          <p className="text-white/60 text-xs font-mono text-center leading-relaxed mb-4">
            This will permanently delete:
          </p>
          <ul className="text-white/50 text-xs font-mono space-y-0.5 mb-5 px-2">
            {['Profile & Player Name','Scores & Statistics','Missions & Achievements',
              'Inventory & Skins','Champion Hall Records','Saved Progress'].map(item => (
              <li key={item} className="flex items-center gap-2">
                <span className="text-red-400">✕</span> {item}
              </li>
            ))}
          </ul>
          {delErr && <p className="text-red-400 text-xs font-mono text-center mb-3">{delErr}</p>}
          <div className="flex gap-3">
            <button onClick={() => { setView('PROFILE'); setDelErr(''); }}
              className="flex-1 py-3 rounded-2xl font-bold text-sm uppercase tracking-wide transition cursor-pointer"
              style={{ background: 'rgba(255,255,255,0.08)', color: 'white', border: '1px solid rgba(255,255,255,0.15)' }}>
              Cancel
            </button>
            <button onClick={handleDeleteForever} disabled={delLoading}
              className="flex-1 py-3 rounded-2xl font-black text-sm uppercase tracking-wide transition active:scale-95 disabled:opacity-50 cursor-pointer"
              style={{ background: 'linear-gradient(135deg,#dc2626,#991b1b)', color: 'white', boxShadow: '0 4px 16px rgba(220,38,38,0.4)' }}>
              {delLoading ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block"/>
              ) : 'Delete Forever'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────
  // EDIT NAME VIEW
  // ─────────────────────────────────────────────
  if (view === 'EDIT_NAME') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-5"
        style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}>
        <div className="w-full max-w-sm rounded-3xl p-6"
          style={{ background: '#1a0a00', border: '1.5px solid rgba(252,211,77,0.35)' }}>
          <h3 className="text-yellow-300 font-black text-sm uppercase tracking-widest mb-4">Edit Player Name</h3>
          <form onSubmit={handleSaveName} className="space-y-3">
            <input
              type="text" value={newName}
              onChange={e => { setNewName(e.target.value); setNameErr(''); }}
              placeholder={playerName}
              maxLength={20} autoFocus
              className="w-full py-3 px-4 rounded-xl font-bold text-sm text-center uppercase tracking-widest focus:outline-none"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1.5px solid rgba(255,255,255,0.15)', color: 'white' }}
              onFocus={e => (e.target.style.borderColor = 'rgba(252,211,77,0.6)')}
              onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.15)')}
            />
            {nameErr && <p className="text-yellow-300 text-xs font-mono text-center">{nameErr}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => { setView('PROFILE'); setNewName(''); setNameErr(''); }}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer"
                style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.15)' }}>
                Cancel
              </button>
              <button type="submit" disabled={nameLoading || newName.trim().length < 3}
                className="flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition active:scale-95 disabled:opacity-50 cursor-pointer"
                style={{ background: 'linear-gradient(135deg,#FCD34D,#F59E0B)', color: '#7f1d1d' }}>
                {nameLoading ? '…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────
  // MAIN PROFILE VIEW
  // ─────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}>
      <div
        className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl overflow-hidden"
        style={{
          background: 'linear-gradient(180deg,#1a0a00 0%,#0f0500 100%)',
          border: '1.5px solid rgba(255,255,255,0.12)',
          maxHeight: '92vh',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4"
          style={{ background: 'linear-gradient(135deg,#7f0000,#b91c1c)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <div className="flex items-center gap-3">
            {/* Avatar circle */}
            {user.photoURL ? (
              <img src={user.photoURL} alt="" className="w-11 h-11 rounded-full border-2 border-yellow-400/60 object-cover"/>
            ) : (
              <div className="w-11 h-11 rounded-full flex items-center justify-center border-2 border-yellow-400/60"
                style={{ background: 'rgba(252,211,77,0.2)' }}>
                <span className="text-yellow-400 font-black text-lg uppercase">{playerName[0]}</span>
              </div>
            )}
            <div>
              <p className="text-white font-black text-sm uppercase tracking-wide leading-none">{playerName}</p>
              <p className="text-white/50 text-[10px] font-mono mt-0.5">{user.email}</p>
            </div>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full transition cursor-pointer"
            style={{ background: 'rgba(255,255,255,0.1)' }}>
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto px-4 py-4" style={{ maxHeight: 'calc(92vh - 80px)' }}>

          <Section title="Account Information">
            <Row label="Player Name"    value={playerName}/>
            <Row label="Email"          value={user.email ?? '—'}/>
            <Row label="Account Created" value={createdDate}/>
            <Row label="Last Login"     value={lastLogin}/>
            <Row label="🔥 Daily Streak" value={`${stats.dailyRewardStreak} days`}/>
          </Section>

          {/* Account Actions */}
          <div className="space-y-2 mt-2 mb-4">
            <button onClick={() => { setNewName(playerName); setView('EDIT_NAME'); }}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-bold text-sm uppercase tracking-wide transition active:scale-95 cursor-pointer"
              style={{ background: 'rgba(252,211,77,0.12)', color: '#FCD34D', border: '1.5px solid rgba(252,211,77,0.3)' }}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z"/>
              </svg>
              Edit Name
            </button>

            <button onClick={async () => { onClose(); await onLogout(); }}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-bold text-sm uppercase tracking-wide transition active:scale-95 cursor-pointer"
              style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.12)' }}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
              </svg>
              Logout
            </button>

            <button onClick={() => setView('DELETE_CONFIRM')}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-bold text-sm uppercase tracking-wide transition active:scale-95 cursor-pointer"
              style={{ background: 'rgba(220,38,38,0.1)', color: 'rgba(248,113,113,0.8)', border: '1px solid rgba(220,38,38,0.2)' }}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916"/>
              </svg>
              Delete My Data
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
