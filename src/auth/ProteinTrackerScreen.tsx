import { useState, useEffect } from 'react';
import type { User } from 'firebase/auth';
import { useAuth } from './AuthProvider';
import { useNavigation } from '../context/NavigationContext';
import DashboardScreen   from '../protein/DashboardScreen';
import QRScanScreen      from '../protein/QRScanScreen';
import ConsumptionScreen from '../protein/ConsumptionScreen';
import AnalyticsScreen   from '../protein/AnalyticsScreen';
import ProfileScreen     from '../protein/ProfileScreen';
import EggStreakScreen   from '../protein/EggStreakScreen';
import RewardsClubScreen from '../protein/RewardsClubScreen';
import { HomeIcon, CameraIcon, FoodLogIcon, AnalyticsIcon, GiftIcon } from '../protein/Icons';
import NotificationBell from '../components/notifications/NotificationBell';

type Tab = 'dashboard' | 'scan' | 'log' | 'stats' | 'profile' | 'streaks' | 'rewards';

interface ProteinTrackerScreenProps {
  onBack: () => void;
  /** Navigates to the existing Egg Runner Home screen (main.tsx setScreen('GAME')) — never launches gameplay directly. */
  onPlayGame?: () => void;
}

// ── Shared warm-neutral tokens (same values as RewardsClubScreen.tsx's PALETTE) ──
const T = {
  red:      '#B42318',
  redDeep:  '#7A1F17',
  redSoft:  '#FBE7E4',
  ink:      '#241A17',
  inkSoft:  '#74645E',
  inkMuted: '#A79C97',
  surface:  '#FFFFFF',
  cream:    '#F8F6F2',
  border:   '#E9DED8',
};

function FlameNavIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill={active ? T.red : T.inkMuted} stroke="none">
      <path d="M12 2C12 2 8 7 8 12a4 4 0 008 0c0-2.5-1.5-5-4-10zM8.5 18.5A5.5 5.5 0 0112 8c0 3 1 5.5 3.5 7A4 4 0 018.5 18.5z"/>
    </svg>
  );
}

// Profile is intentionally excluded from the bottom tab bar — it's reachable
// via the avatar button in the top app bar instead (see the top-right button
// below that already sets tab to 'profile').
const PRIMARY_NAV: { key: Tab; label: string; icon: (a: boolean) => React.ReactNode }[] = [
  { key: 'dashboard', label: 'Home',    icon: (a) => <HomeIcon      size={20} color={a ? T.red : T.inkMuted} /> },
  { key: 'scan',      label: 'Scan',    icon: (a) => <CameraIcon    size={20} color={a ? T.red : T.inkMuted} /> },
  { key: 'streaks',   label: 'Streaks', icon: (a) => <FlameNavIcon  active={a} /> },
  { key: 'stats',     label: 'Stats',   icon: (a) => <AnalyticsIcon size={20} color={a ? T.red : T.inkMuted} /> },
  { key: 'rewards',   label: 'Rewards', icon: (a) => <GiftIcon      size={20} color={a ? T.red : T.inkMuted} /> },
];

export default function ProteinTrackerScreen({ onBack, onPlayGame }: ProteinTrackerScreenProps) {
  const { user, logout } = useAuth();
  const [tab,        setTab]        = useState<Tab>('dashboard');
  const [refreshKey, setRefreshKey] = useState(0);
  const [avatarBroken, setAvatarBroken] = useState(false);
  const { pendingTarget } = useNavigation();

  // Preload html5-qrcode in the background so the scanner opens instantly
  useEffect(() => {
    import('html5-qrcode').catch(() => {});
  }, []);

  useEffect(() => { setAvatarBroken(false); }, [user?.photoURL]);

  // ── Smart notification navigation — jump to the target tab ────────────────
  // Doesn't call consumeTarget() itself: the destination screen (which knows
  // whether it finished applying section/entityId) clears it once it's done,
  // so a slow-loading destination screen doesn't lose the target mid-flight.
  useEffect(() => {
    if (pendingTarget?.screen === 'PROTEIN_TRACKER' && pendingTarget.tab !== tab) {
      setTab(pendingTarget.tab);
    }
  }, [pendingTarget, tab]);

  const typedUser = user as User;
  if (!typedUser) return null;

  const bump = () => setRefreshKey(k => k + 1);

  const handleScanSuccess = () => { bump(); setTab('dashboard'); };
  const handleLogout      = async () => { await logout(); };

  return (
    <div style={{
      position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
      background: T.cream,
      fontFamily: 'system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    }}>

      {/* ── Top App Bar ── */}
      <div style={{ flexShrink: 0, background: T.surface, borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px' }}>

          {/* Left: back arrow + mascot + title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={onBack}
              aria-label="Go back"
              style={{
                width: 32, height: 32, borderRadius: '50%',
                background: T.cream, border: 'none',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, transition: 'background 150ms ease',
              }}
              onPointerDown={e => (e.currentTarget.style.background = T.border)}
              onPointerUp={e   => (e.currentTarget.style.background = T.cream)}
              onPointerLeave={e => (e.currentTarget.style.background = T.cream)}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={T.ink} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 5l-7 7 7 7"/>
              </svg>
            </button>
            <img src="/egg mus_Image_v5vrg3v5vrg3v5vr-removebg-preview.png" alt="SKM"
              style={{ width: 24, height: 24, objectFit: 'contain' }} />
            <span style={{ fontWeight: 800, fontSize: 14.5, color: T.red, letterSpacing: 0.1 }}>SKM<span style={{ color: T.ink, fontWeight: 700 }}> Protein</span></span>
          </div>

          {/* Right: notification + scan + avatar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <NotificationBell size={17} color={T.ink} />
            <button
              onClick={() => setTab('scan')}
              aria-label="Scan"
              style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 20,
                background: tab === 'scan' ? T.redSoft : 'transparent',
                border: `1px solid ${tab === 'scan' ? 'transparent' : T.border}`,
                cursor: 'pointer', transition: 'background 150ms ease',
              }}
            >
              <CameraIcon size={14} color={T.red} />
              <span style={{ fontSize: 11, fontWeight: 700, color: T.red }}>Scan</span>
            </button>
            <button onClick={() => setTab('profile')} aria-label="Profile" style={{
              width: 32, height: 32, borderRadius: '50%', overflow: 'hidden',
              border: tab === 'profile' ? `2px solid ${T.red}` : `1px solid ${T.border}`,
              background: 'none', cursor: 'pointer', padding: 0, flexShrink: 0,
            }}>
              {typedUser.photoURL && !avatarBroken ? (
                <img
                  src={typedUser.photoURL}
                  alt=""
                  referrerPolicy="no-referrer"
                  onError={() => setAvatarBroken(true)}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <div style={{ width: '100%', height: '100%', background: T.redSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: T.red }}>{(typedUser.displayName ?? 'U')[0].toUpperCase()}</span>
                </div>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── Screen content ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {tab === 'dashboard' && (
          <DashboardScreen
            user={typedUser}
            refreshKey={refreshKey}
            onScanQR={() => setTab('scan')}
            onViewAnalytics={() => setTab('stats')}
            onViewLog={() => setTab('log')}
            onViewStreaks={() => setTab('streaks')}
            navTarget={pendingTarget?.tab === 'dashboard' ? pendingTarget : null}
          />
        )}
        {tab === 'scan'    && <QRScanScreen      user={typedUser} onScanSuccess={handleScanSuccess} />}
        {tab === 'log'     && <ConsumptionScreen  user={typedUser} refreshKey={refreshKey} onScanQR={() => setTab('scan')} />}
        {tab === 'stats'   && (
          <AnalyticsScreen
            user={typedUser}
            refreshKey={refreshKey}
            navTarget={pendingTarget?.tab === 'stats' ? pendingTarget : null}
          />
        )}
        {tab === 'streaks' && (
          <EggStreakScreen
            user={typedUser}
            refreshKey={refreshKey}
            onScanQR={() => setTab('scan')}
            navTarget={pendingTarget?.tab === 'streaks' ? pendingTarget : null}
          />
        )}
        {tab === 'rewards' && (
          <RewardsClubScreen
            user={typedUser}
            onBack={() => setTab('dashboard')}
            onScanQR={() => setTab('scan')}
            onPlayGame={onPlayGame}
            navTarget={pendingTarget?.tab === 'rewards' ? pendingTarget : null}
          />
        )}
        {tab === 'profile' && (
          <ProfileScreen
            user={typedUser}
            onLogout={handleLogout}
            onDataDeleted={() => {}}
            onBackToMenu={onBack}
            navTarget={pendingTarget?.tab === 'profile' ? pendingTarget : null}
          />
        )}
      </div>

      {/* ── Bottom Navigation ── */}
      <div style={{
        flexShrink: 0, background: T.surface,
        borderTop: `1px solid ${T.border}`,
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}>
        <div style={{ display: 'flex' }}>
          {PRIMARY_NAV.map(item => {
            const active = tab === item.key;
            return (
              <button
                key={item.key}
                onClick={() => setTab(item.key)}
                aria-label={item.label}
                aria-current={active ? 'page' : undefined}
                style={{
                  flex: 1, minHeight: 52, display: 'flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'center', padding: '8px 0 7px', gap: 3,
                  background: 'none', border: 'none', cursor: 'pointer', outline: 'none',
                }}
                onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.94)')}
                onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
                onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
              >
                <div style={{
                  width: 40, height: 28, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: active ? T.redSoft : 'transparent', transition: 'background 150ms ease',
                }}>
                  {item.icon(active)}
                </div>
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.2, color: active ? T.red : T.inkMuted, transition: 'color 150ms ease' }}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
