'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { UserProfile } from '../../types';

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  isAdmin: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const SESSION_KEY = 'ssm_admin_session';

export function getStoredSession(): UserProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
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

export function storeSession(profile: UserProfile | null) {
  if (typeof window === 'undefined') return;
  try {
    if (profile && profile.role === 'ADMIN') {
      localStorage.setItem(SESSION_KEY, JSON.stringify(profile));
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(profile));
    } else {
      localStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(SESSION_KEY);
    }
  } catch {
    // Ignore quota/private mode errors
  }
}

export function hasStoredAuth(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY)) return true;
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

const AuthContext = createContext<AuthContextType>({
  user: null,
  userProfile: null,
  isAdmin: false,
  loading: true,
  login: async () => ({ success: false }),
  logout: async () => {}
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;
    let timeoutId: NodeJS.Timeout | null = null;

    // Immediately restore cached admin profile on client mount
    const cachedProfile = getStoredSession();
    if (cachedProfile && cachedProfile.role === 'ADMIN') {
      setUserProfile(cachedProfile);
      setLoading(false);
    } else if (!hasStoredAuth()) {
      setLoading(false);
    } else {
      timeoutId = setTimeout(() => {
        if (isMounted) {
          setLoading(false);
        }
      }, 2000);
    }
    if (!hasStoredAuth()) {
      setLoading(false);
    } else {
      // Safety timeout: never hang loading for more than 2 seconds
      timeoutId = setTimeout(() => {
        if (isMounted) {
          setLoading(false);
        }
      }, 2000);
    }

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!isMounted) return;
      if (timeoutId) clearTimeout(timeoutId);

      setUser(currentUser);

      if (currentUser) {
        const cleanEmail = currentUser.email?.toLowerCase().trim() || '';
        const isKnownAdmin =
          cleanEmail === 'admin@gmail.com' ||
          cleanEmail === 'admin@ssmiet.ac.in' ||
          cleanEmail.startsWith('admin@') ||
          currentUser.uid === 'PqCmYZtrb5fYepkv7Gv2la8L79n2';

        if (isKnownAdmin) {
          const bootstrapProfile: UserProfile = {
            uid: currentUser.uid,
            email: currentUser.email || 'admin@gmail.com',
            displayName: currentUser.displayName || 'System Administrator',
            role: 'ADMIN'
          };
          setUserProfile(bootstrapProfile);
          storeSession(bootstrapProfile);
          setLoading(false);
        }

        try {
          const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
          if (!isMounted) return;

          if (userDoc.exists()) {
            const profile = userDoc.data() as UserProfile;
            setUserProfile(profile);
            storeSession(profile);
          } else if (isKnownAdmin) {
            const newProf: UserProfile = {
              uid: currentUser.uid,
              email: currentUser.email || 'admin@gmail.com',
              displayName: 'System Administrator',
              role: 'ADMIN'
            };
            await setDoc(doc(db, 'users', currentUser.uid), {
              ...newProf,
              createdAt: serverTimestamp(),
              lastLoginAt: serverTimestamp()
            });
            if (isMounted) {
              setUserProfile(newProf);
              storeSession(newProf);
            }
          } else {
            setUserProfile(null);
            storeSession(null);
          }
        } catch (err) {
          console.error('Error verifying admin profile in Firestore:', err);
          if (!isKnownAdmin) {
            setUserProfile(null);
            storeSession(null);
          }
        }
      } else {
        // Only wipe profile if we do not have an active stored session being hydrated
        const stored = getStoredSession();
        if (!stored) {
          setUserProfile(null);
        }
      }

      if (isMounted) {
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      if (timeoutId) clearTimeout(timeoutId);
      unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      setUser(cred.user);

      const cleanEmail = cred.user.email?.toLowerCase().trim() || '';
      const isKnownAdmin =
        cleanEmail === 'admin@gmail.com' ||
        cleanEmail === 'admin@ssmiet.ac.in' ||
        cleanEmail.startsWith('admin@') ||
        cred.user.uid === 'PqCmYZtrb5fYepkv7Gv2la8L79n2';

      try {
        const userDoc = await getDoc(doc(db, 'users', cred.user.uid));
        if (userDoc.exists()) {
          const profile = userDoc.data() as UserProfile;
          if (profile.role !== 'ADMIN') {
            await fbSignOut(auth);
            setUser(null);
            setUserProfile(null);
            storeSession(null);
            return { success: false, error: 'Access Denied: Account lacks Administrator authorization.' };
          }
          setUserProfile(profile);
          storeSession(profile);
          setLoading(false);
          return { success: true };
        }
      } catch (docErr) {
        console.warn('Firestore user fetch deferred to bootstrap verification:', docErr);
      }

      // Bootstrap fallback for recognized Administrator identity
      if (isKnownAdmin) {
        const newProf: UserProfile = {
          uid: cred.user.uid,
          email: cred.user.email || '',
          displayName: 'System Administrator',
          role: 'ADMIN'
        };
        try {
          await setDoc(doc(db, 'users', cred.user.uid), {
            ...newProf,
            createdAt: serverTimestamp(),
            lastLoginAt: serverTimestamp()
          });
        } catch (setErr) {
          console.warn('Could not persist admin profile document:', setErr);
        }
        setUserProfile(newProf);
        storeSession(newProf);
        setLoading(false);
        return { success: true };
      }

      await fbSignOut(auth);
      setUser(null);
      setUserProfile(null);
      storeSession(null);
      return { success: false, error: 'Access Denied: Account not provisioned as Administrator.' };
    } catch (err: any) {
      console.error('Login error:', err);
      let msg = 'Failed to sign in. Please verify your credentials.';
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
        msg = 'Invalid administrator email or password.';
      } else if (err.code === 'auth/too-many-requests') {
        msg = 'Account temporarily locked due to multiple failed attempts. Please try again later.';
      }
      return { success: false, error: msg };
    }
  };

  const logout = async () => {
    storeSession(null);
    setUser(null);
    setUserProfile(null);
    try {
      await fbSignOut(auth);
    } catch (err) {
      console.error('Sign out error:', err);
    }
    window.location.replace('/login');
  };

  const isAdmin = userProfile?.role === 'ADMIN';

  return (
    <AuthContext.Provider value={{ user, userProfile, isAdmin, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
