'use client';

/**
 * Authentication Context Provider
 *
 * Manages Firebase authentication state and provides auth methods to the app.
 * Handles operator role checking via custom claims in ID token.
 */

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  User,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isOperator: boolean;
  operatorId: string | null;
  operatorRole: string | null;
  operatorYards: string[] | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOperator, setIsOperator] = useState(false);
  const [operatorId, setOperatorId] = useState<string | null>(null);
  const [operatorRole, setOperatorRole] = useState<string | null>(null);
  const [operatorYards, setOperatorYards] = useState<string[] | null>(null);

  useEffect(() => {
    console.log('🔧 Initializing AuthContext');
    const auth = getFirebaseAuth();

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      console.log('👤 Auth state changed:', user ? `User: ${user.email}` : 'No user');
      setUser(user);

      if (user) {
        try {
          // Force refresh token to get latest claims after login
          const tokenResult = await user.getIdTokenResult(true);
          const role = tokenResult.claims.role;
          const yardIds = tokenResult.claims.yardIds;

          const normalizedYards = Array.isArray(yardIds)
            ? yardIds.filter((value): value is string => typeof value === 'string')
            : null;

          console.log('🔑 User role from token claims:', role);
          console.log('🏗️ User yards from token claims:', normalizedYards);
          setOperatorId(user.uid);
          setOperatorRole(typeof role === 'string' ? role : null);
          setOperatorYards(normalizedYards);
          setIsOperator(role === 'operator' || role === 'admin');
        } catch (error) {
          console.error('❌ Error reading token claims:', error);
          setOperatorId(null);
          setOperatorRole(null);
          setOperatorYards(null);
          setIsOperator(false);
        }
      } else {
        setOperatorId(null);
        setOperatorRole(null);
        setOperatorYards(null);
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
    const result = await signInWithEmailAndPassword(auth, email, password);
    console.log('✅ SignIn successful:', result.user.email);
  };

  const signOut = async () => {
    const auth = getFirebaseAuth();
    await firebaseSignOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, loading, isOperator, operatorId, operatorRole, operatorYards, signIn, signOut }}>
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
