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
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
          if (userDoc.exists()) {
            const profile = userDoc.data() as UserProfile;
            setUserProfile(profile);
          } else {
            // Check bootstrap email
            const email = currentUser.email?.toLowerCase().trim() || '';
            if (email === 'admin@gmail.com' || email.startsWith('admin@')) {
              const newProf: UserProfile = {
                uid: currentUser.uid,
                email: currentUser.email || '',
                displayName: 'System Administrator',
                role: 'ADMIN'
              };
              await setDoc(doc(db, 'users', currentUser.uid), {
                ...newProf,
                createdAt: serverTimestamp(),
                lastLoginAt: serverTimestamp()
              });
              setUserProfile(newProf);
            } else {
              setUserProfile(null);
            }
          }
        } catch (err) {
          console.error('Error fetching admin profile:', err);
          setUserProfile(null);
        }
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      const userDoc = await getDoc(doc(db, 'users', cred.user.uid));

      if (userDoc.exists()) {
        const profile = userDoc.data() as UserProfile;
        if (profile.role !== 'ADMIN') {
          await fbSignOut(auth);
          return { success: false, error: 'Access Denied: Account lacks Administrator authorization.' };
        }
        setUserProfile(profile);
        return { success: true };
      }

      // Bootstrap check
      const cleanEmail = cred.user.email?.toLowerCase().trim() || '';
      if (cleanEmail === 'admin@gmail.com' || cleanEmail.startsWith('admin@')) {
        const newProf: UserProfile = {
          uid: cred.user.uid,
          email: cred.user.email || '',
          displayName: 'System Administrator',
          role: 'ADMIN'
        };
        await setDoc(doc(db, 'users', cred.user.uid), {
          ...newProf,
          createdAt: serverTimestamp(),
          lastLoginAt: serverTimestamp()
        });
        setUserProfile(newProf);
        return { success: true };
      }

      await fbSignOut(auth);
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
    await fbSignOut(auth);
    setUser(null);
    setUserProfile(null);
  };

  const isAdmin = userProfile?.role === 'ADMIN';

  return (
    <AuthContext.Provider value={{ user, userProfile, isAdmin, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

