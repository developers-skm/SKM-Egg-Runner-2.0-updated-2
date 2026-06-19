/**
 * SKM EGG RUNNER — Auth Context + Provider
 * Wraps the app and exposes the current Firebase user + logout helper.
 * Handles both popup and redirect-based Google sign-in flows.
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { auth } from '../services/firebase/firebase';
import { signOutGoogle, checkRedirectResult } from './googleAuthService';

// ─────────────────────────────────────────────
// Context shape
// ─────────────────────────────────────────────

interface AuthContextValue {
  /** null = not logged in, undefined = still loading */
  user: User | null | undefined;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: undefined,
  logout: async () => {},
});

// ─────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    // 1. Subscribe to auth state (handles session persistence + redirect result)
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
    });

    // 2. Also check if we're returning from a Google redirect flow
    checkRedirectResult().catch(() => {
      // Silently ignore — onAuthStateChanged handles the resulting login
    });

    return unsubscribe;
  }, []);

  const logout = async () => {
    await signOutGoogle();
    // onAuthStateChanged fires automatically → user becomes null
  };

  return (
    <AuthContext.Provider value={{ user, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// ─────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
