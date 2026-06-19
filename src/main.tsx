import { StrictMode, useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { AuthProvider, useAuth } from './auth/AuthProvider.tsx';
import WelcomeScreen from './auth/WelcomeScreen.tsx';
import ProfileSetupScreen from './auth/ProfileSetupScreen.tsx';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './services/firebase/firebase.ts';
import './index.css';

// ─────────────────────────────────────────────────────────────────────────────
// Flow:
//   Loading → Login → Profile Setup (new users only) → Game
//
// Data isolation: every new account gets ProfileSetupScreen,
// which writes a zero-value Firestore document at users/{uid}.
// App.tsx uses UID-scoped localStorage keys so no two accounts share data.
// ─────────────────────────────────────────────────────────────────────────────

type ProfileStatus = 'CHECKING' | 'NEEDED' | 'READY';

function AppRoot() {
  const { user } = useAuth();
  const [profileStatus, setProfileStatus] = useState<ProfileStatus>('CHECKING');

  // When Firebase resolves a user, check if their Firestore profile exists
  useEffect(() => {
    if (!user) { setProfileStatus('CHECKING'); return; }

    setProfileStatus('CHECKING');
    getDoc(doc(db, 'users', user.uid))
      .then(snap => setProfileStatus(snap.exists() ? 'READY' : 'NEEDED'))
      .catch(() => setProfileStatus('NEEDED')); // treat Firestore error as new user
  }, [user]);

  // ── Loading splash ────────────────────────────────────────────────────────
  if (user === undefined || (user && profileStatus === 'CHECKING')) {
    return (
      <div className="fixed inset-0 flex items-center justify-center"
        style={{ background: 'linear-gradient(160deg,#7f0000 0%,#b91c1c 35%,#991b1b 65%,#7f1d1d 100%)' }}>
        <div className="flex flex-col items-center gap-5">
          <svg width="72" height="72" viewBox="0 0 512 512" className="animate-pulse"
            style={{ filter: 'drop-shadow(0 0 20px rgba(252,211,77,0.5))' }}>
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
          <p className="text-yellow-300/70 text-xs font-mono uppercase tracking-widest animate-pulse">
            Loading…
          </p>
        </div>
      </div>
    );
  }

  // ── Not logged in → login screen ─────────────────────────────────────────
  if (user === null) {
    return <WelcomeScreen onAuthSuccess={() => {}} />;
  }

  // ── Logged in, new user → profile setup ──────────────────────────────────
  if (profileStatus === 'NEEDED') {
    return (
      <ProfileSetupScreen
        user={user}
        onProfileCreated={(playerName) => {
          // Save player name into UID-scoped localStorage so App.tsx picks it up
          localStorage.setItem(`skm_player_name_${user.uid}`, playerName);
          setProfileStatus('READY');
        }}
      />
    );
  }

  // ── Logged in, profile exists → game ─────────────────────────────────────
  return <App />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <AppRoot />
    </AuthProvider>
  </StrictMode>,
);
