'use client';

/**
 * Authentication Context Provider
 *
 * Manages Firebase authentication state and provides auth methods to the app.
 * Handles operator role checking via custom claims.
 */

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  User,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { getFirebaseAuth, getFirestoreClient } from '@/lib/firebase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isOperator: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOperator, setIsOperator] = useState(false);

  useEffect(() => {
    console.log('🔧 Initializing AuthContext');
    const auth = getFirebaseAuth();
    const db = getFirestoreClient();

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      console.log('👤 Auth state changed:', user ? `User: ${user.email}` : 'No user');
      setUser(user);

      if (user) {
        try {
          // Query user role from Firestore 'users' collection by email
          const usersRef = collection(db, 'users');
          const q = query(usersRef, where('email', '==', user.email));
          const querySnapshot = await getDocs(q);

          if (!querySnapshot.empty) {
            const userData = querySnapshot.docs[0].data();
            const role = userData.role as string | undefined;
            console.log('🔑 User role from Firestore:', role);
            setIsOperator(role === 'operator' || role === 'admin');
          } else {
            console.log('⚠️ User document not found in Firestore for email:', user.email);
            setIsOperator(false);
          }
        } catch (error) {
          console.error('❌ Error fetching user role:', error);
          setIsOperator(false);
        }
      } else {
        setIsOperator(false);
      }

      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const signIn = async (email: string, password: string) => {
    console.log('📧 SignIn called for:', email);
    const auth = getFirebaseAuth();
    console.log('🔐 Firebase Auth instance:', auth ? 'OK' : 'Missing');
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      console.log('✅ SignIn successful:', result.user.email);
    } catch (err: any) {
      console.error('❌ Firebase signIn error:', err.code || err.name, err.message || err);
      throw err;
    }
  };

  const signOut = async () => {
    const auth = getFirebaseAuth();
    await firebaseSignOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, loading, isOperator, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
