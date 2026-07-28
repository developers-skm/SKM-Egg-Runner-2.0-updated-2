/**
 * SKM EGG RUNNER — Auth Context + Provider
 * Wraps the app and exposes the current Firebase user + logout helper.
 *
 * Navigation is driven entirely by `user` state changes from onAuthStateChanged.
 * Components must NOT navigate based on login callbacks — react to user state.
 */

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { auth } from '../services/firebase/firebase';
import { signOutGoogle, checkRedirectResult } from './googleAuthService';
import { writeAuditLog } from '../services/audit/auditLogService';

interface AuthContextValue {
  /** undefined = loading, null = logged out, User = logged in */
  user:   User | null | undefined;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user:   undefined,
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  // Tracks whether we've already logged a "login" for the current uid, so a
  // page reload (which re-fires onAuthStateChanged with the persisted user)
  // doesn't get logged as a fresh sign-in every time.
  const loggedInUidRef = useRef<string | null>(null);

  useEffect(() => {
    // onAuthStateChanged is the single source of truth for auth state.
    // It fires immediately with the persisted user (if any), then again
    // after any sign-in/sign-out event — including redirect completions.
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      console.log('[AUTH] onAuthStateChanged →', firebaseUser ? `uid=${firebaseUser.uid}` : 'null');
      if (firebaseUser && loggedInUidRef.current !== firebaseUser.uid) {
        loggedInUidRef.current = firebaseUser.uid;
        writeAuditLog(firebaseUser.uid, 'login', firebaseUser.email ?? firebaseUser.uid, true);
      } else if (!firebaseUser) {
        loggedInUidRef.current = null;
      }
      setUser(firebaseUser);
    });

    // On mobile, after signInWithRedirect, the page reloads and we must call
    // getRedirectResult() to complete the sign-in. onAuthStateChanged will
    // fire automatically once getRedirectResult resolves, so we just ensure
    // it runs and log any errors — navigation is handled by state change above.
    checkRedirectResult()
      .then(result => {
        if (result.success && result.user) {
          console.log('[AUTH] Redirect sign-in completed, uid=', result.user.uid);
        }
      })
      .catch(err => {
        console.warn('[AUTH] checkRedirectResult error (non-fatal):', err?.message);
      });

    return unsubscribe;
  }, []);

  const logout = async () => {
    console.log('[AUTH] Logging out');
    if (user) writeAuditLog(user.uid, 'logout', user.email ?? user.uid, true);
    await signOutGoogle();
    // onAuthStateChanged fires → user becomes null → AppRoot shows WelcomeScreen
  };

  return (
    <AuthContext.Provider value={{ user, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
