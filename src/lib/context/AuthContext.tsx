'use client';

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import {
  User,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { UserProfile } from '../../types';

export type AuthState =
  | 'AUTH_INITIALIZING'     // Checking Firebase Auth state (reading IndexedDB / restored token)
  | 'UNAUTHENTICATED'       // No active Firebase Auth user session
  | 'PROFILE_LOADING'       // Authenticated, fetching authoritative profile from /users/{uid}
  | 'VERIFYING_ADMIN'       // Profile loaded, verifying ADMIN role
  | 'VERIFIED_ADMIN'        // Validated Administrator session — authorized for administration
  | 'ACCESS_DENIED'         // Authenticated user exists, but lacks ADMIN role in Firestore
  | 'ERROR';                // Network error, Firestore offline, or timeout retrieving profile

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  authState: AuthState;
  isAdmin: boolean;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  retryVerification: () => void;
}

const SESSION_KEY = 'ssm_admin_session';

export function getCachedProfile(): UserProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UserProfile;
    if (parsed && parsed.uid && parsed.role === 'ADMIN') {
      return parsed;
    }
  } catch {
    // Ignore storage parse errors
  }
  return null;
}

export function cacheProfile(profile: UserProfile | null) {
  if (typeof window === 'undefined') return;
  try {
    if (profile && profile.role === 'ADMIN') {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(profile));
      localStorage.setItem(SESSION_KEY, JSON.stringify(profile));
    } else {
      sessionStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(SESSION_KEY);
    }
  } catch {
    // Ignore storage quota errors
  }
}

export function hasStoredAuth(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY)) return true;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('firebase:authUser') || key.startsWith('firebase:token'))) {
        return true;
      }
    }
  } catch {
    // Storage restricted
  }
  return false;
}

/**
 * Reads user profile from Firestore with an explicit timeout.
 * Prevents Firestore queries from hanging indefinitely if connection lags.
 */
async function fetchUserProfileWithTimeout(
  uid: string,
  email: string | null,
  timeoutMs = 5000
): Promise<UserProfile | null> {
  let timerId: ReturnType<typeof setTimeout> | undefined;

  const fetchPromise = (async () => {
    try {
      const userDoc = await getDoc(doc(db, 'users', uid));
      if (userDoc.exists()) {
        return userDoc.data() as UserProfile;
      }

      // Bootstrap creation for root administrator
      const cleanEmail = (email || '').toLowerCase().trim();
      if (cleanEmail === 'admin@gmail.com' || cleanEmail.startsWith('admin@') || uid === 'PqCmYZtrb5fYepkv7Gv2la8L79n2') {
        const newProf: UserProfile = {
          uid,
          email: email || 'admin@gmail.com',
          displayName: 'System Administrator',
          role: 'ADMIN'
        };
        try {
          await setDoc(doc(db, 'users', uid), {
            ...newProf,
            createdAt: serverTimestamp(),
            lastLoginAt: serverTimestamp()
          });
        } catch (err) {
          console.warn('Could not persist bootstrap profile:', err);
        }
        return newProf;
      }

      return null;
    } catch (err) {
      throw err;
    }
  })();

  const timeoutPromise = new Promise<never>((_, reject) => {
    timerId = setTimeout(() => {
      reject(new Error(`Profile verification timeout: Firestore did not respond within ${timeoutMs}ms.`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([fetchPromise, timeoutPromise]);
  } finally {
    if (timerId) clearTimeout(timerId);
  }
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userProfile: null,
  authState: 'AUTH_INITIALIZING',
  isAdmin: false,
  loading: true,
  error: null,
  login: async () => ({ success: false }),
  logout: async () => {},
  retryVerification: () => {}
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authState, setAuthState] = useState<AuthState>('AUTH_INITIALIZING');
  const [error, setError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  // Active lifecycle tracker to prevent stale async callbacks across Strict Mode remounts
  const activeCycleIdRef = useRef(0);

  const retryVerification = useCallback(() => {
    setError(null);
    setAuthState('AUTH_INITIALIZING');
    setRetryNonce((prev) => prev + 1);
  }, []);

  useEffect(() => {
    const cycleId = ++activeCycleIdRef.current;
    const isCurrentCycle = () => activeCycleIdRef.current === cycleId;

    // Check cached session on client mount
    const cached = getCachedProfile();
    let hasActiveCachedSession = false;

    if (cached && cached.role === 'ADMIN') {
      hasActiveCachedSession = true;
      setUserProfile(cached);
      setAuthState('VERIFIED_ADMIN');
    } else if (!hasStoredAuth()) {
      // Fast-path: no tokens in storage, immediately unauthenticated
      setUserProfile(null);
      setAuthState('UNAUTHENTICATED');
    }

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!isCurrentCycle()) return;

      setUser(currentUser);

      if (!currentUser) {
        // No authenticated session in Firebase Auth
        cacheProfile(null);
        setUserProfile(null);
        setError(null);
        setAuthState('UNAUTHENTICATED');
        return;
      }

      // If we don't already have a valid cached session, indicate loading
      if (!hasActiveCachedSession) {
        setAuthState('PROFILE_LOADING');
        setError(null);
      }

      try {
        const profile = await fetchUserProfileWithTimeout(
          currentUser.uid,
          currentUser.email,
          5000
        );

        if (!isCurrentCycle()) return;

        if (!profile) {
          // Document does not exist and cannot be bootstrapped
          cacheProfile(null);
          setUserProfile(null);
          setError('User profile not found. Please contact the administrator.');
          setAuthState('ACCESS_DENIED');
          return;
        }

        if (profile.role === 'ADMIN') {
          // Authoritative ADMIN role verified
          cacheProfile(profile);
          setUserProfile(profile);
          setError(null);
          setAuthState('VERIFIED_ADMIN');
        } else {
          // Authenticated user exists but is not an ADMIN
          cacheProfile(null);
          setUserProfile(profile);
          setError('Access Denied: Your account does not have Administrator authorization.');
          setAuthState('ACCESS_DENIED');
        }
      } catch (err: any) {
        if (!isCurrentCycle()) return;
        console.error('Administration profile verification error:', err);

        // If we already had a cached profile, keep it active to survive transient network blips
        const fallback = getCachedProfile();
        if (fallback && fallback.role === 'ADMIN') {
          setUserProfile(fallback);
          setAuthState('VERIFIED_ADMIN');
        } else {
          setError(err.message || 'Unable to verify administrator profile. Please check your internet connection.');
          setAuthState('ERROR');
        }
      }
    });

    return () => {
      // Invalidate current lifecycle to prevent stale async callbacks
      activeCycleIdRef.current++;
      unsubscribe();
    };
  }, [retryNonce]);

  const login = async (email: string, password: string) => {
    setError(null);
    setAuthState('PROFILE_LOADING');

    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      setUser(cred.user);

      const profile = await fetchUserProfileWithTimeout(
        cred.user.uid,
        cred.user.email,
        6000
      );

      if (!profile || profile.role !== 'ADMIN') {
        await fbSignOut(auth);
        cacheProfile(null);
        setUser(null);
        setUserProfile(null);
        setAuthState('ACCESS_DENIED');
        return { success: false, error: 'Access Denied: Account lacks Administrator authorization.' };
      }

      cacheProfile(profile);
      setUserProfile(profile);
      setAuthState('VERIFIED_ADMIN');
      return { success: true };
    } catch (err: any) {
      console.error('Login error:', err);
      let msg = 'Failed to sign in. Please verify your credentials.';
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
        msg = 'Invalid administrator email or password.';
      } else if (err.code === 'auth/too-many-requests') {
        msg = 'Account temporarily locked due to multiple failed attempts. Please try again later.';
      } else if (err.message) {
        msg = err.message;
      }
      setAuthState('UNAUTHENTICATED');
      return { success: false, error: msg };
    }
  };

  const logout = async () => {
    cacheProfile(null);
    setUser(null);
    setUserProfile(null);
    setAuthState('UNAUTHENTICATED');
    try {
      await fbSignOut(auth);
    } catch (err) {
      console.error('Sign out error:', err);
    }
    window.location.replace('/login');
  };

  const isAdmin = authState === 'VERIFIED_ADMIN';
  const loading = authState === 'AUTH_INITIALIZING' || authState === 'PROFILE_LOADING' || authState === 'VERIFYING_ADMIN';

  return (
    <AuthContext.Provider
      value={{
        user,
        userProfile,
        authState,
        isAdmin,
        loading,
        error,
        login,
        logout,
        retryVerification
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
