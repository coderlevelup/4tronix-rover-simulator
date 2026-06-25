'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { getFirebaseAuth } from '@/lib/firebase';

export function OperatorLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasRedirected, setHasRedirected] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const { signIn, user, isOperator, loading: authLoading } = useAuth();
  const router = useRouter();

  // Redirect only after BOTH session is ready AND user is authenticated as operator
  useEffect(() => {
    // Don't run redirect logic multiple times
    if (hasRedirected) return;

    // Wait for auth to finish loading
    if (authLoading) return;

    // Wait for session to be established (set by handleSubmit)
    if (!sessionReady) return;

    // No user logged in - nothing to do
    if (!user) return;

    console.log('🔄 Login redirect check:', { user: user.email, isOperator, sessionReady });

    if (isOperator) {
      console.log('✅ User is authenticated as operator and session is ready, navigating to /operator');
      setHasRedirected(true);
      router.replace('/operator');
      return;
    }

    console.log('⛔ Authenticated user does not have operator role');
    setError('Your account does not have operator access.');
    setLoading(false);
  }, [authLoading, user, isOperator, router, hasRedirected, sessionReady]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    console.log('🔐 Attempting login with:', email);

    try {
      await signIn(email, password);
      console.log('✅ Login successful, establishing session...');

      // Get the current user and their ID token
      const auth = getFirebaseAuth();
      const user = auth.currentUser;

      if (user) {
        // Get the ID token and send it to the session API route
        const idToken = await user.getIdToken(true); // Force refresh to get latest claims
        console.log('🎫 Obtained ID token, sending to session API...');

        const sessionResponse = await fetch('/api/auth/session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ token: idToken }),
        });

        if (!sessionResponse.ok) {
          const errorData = await sessionResponse.json();
          throw new Error(errorData.error || 'Failed to establish session');
        }

        console.log('✅ Session established successfully');
        // Signal that session is ready for the redirect check
        setSessionReady(true);
        // Don't set loading to false - let the useEffect handle redirect
        // The loading spinner will stay visible until redirect completes
      }
    } catch (err: any) {
      console.error('❌ Login error:', err);

      let errorMessage = 'Login failed';

      if (err.code === 'auth/invalid-credential') {
        errorMessage = 'Invalid email or password';
      } else if (err.code === 'auth/user-not-found') {
        errorMessage = 'User not found';
      } else if (err.code === 'auth/wrong-password') {
        errorMessage = 'Incorrect password';
      } else if (err.code === 'auth/too-many-requests') {
        errorMessage = 'Too many attempts. Please try again later';
      } else if (err.message) {
        errorMessage = err.message;
      }

      setError(errorMessage);
      setLoading(false);
    }
  };

  return (
    <div className="relative w-full max-w-md space-y-6 overflow-hidden rounded-2xl border border-border bg-card/60 backdrop-blur-xl p-8 shadow-card">
      <div className="absolute inset-0 bg-gradient-cosmic opacity-10 pointer-events-none" />
      <div className="relative space-y-3 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-mars shadow-glow-mars">
          <span className="text-3xl">🔐</span>
        </div>
        <h2 className="font-display text-2xl font-bold text-foreground">Operator Login</h2>
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Sign in with your operator credentials</p>
      </div>

      <form onSubmit={handleSubmit} className="relative grid gap-5">
        {error && (
          <div className="animate-in slide-in-from-top-2 fade-in duration-300 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive shadow-card">
            <div className="flex items-center gap-2">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          </div>
        )}

        <label className="grid gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          Email
          <input
            className="rounded-2xl border border-border bg-card/60 px-4 py-3.5 text-sm text-foreground shadow-inner transition-all duration-200 outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
            placeholder="operator@example.com"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading}
            autoComplete="email"
          />
        </label>

        <label className="grid gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          Password
          <input
            className="rounded-2xl border border-border bg-card/60 px-4 py-3.5 text-sm text-foreground shadow-inner transition-all duration-200 outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
            placeholder="Enter your password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading}
            autoComplete="current-password"
          />
        </label>

        <button
          className="group relative mt-2 overflow-hidden rounded-2xl bg-gradient-mars px-6 py-3.5 text-sm font-semibold text-primary-foreground shadow-glow-mars transition-all duration-300 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 active:scale-95"
          type="submit"
          disabled={loading}
        >
          <span className="relative z-10 flex items-center justify-center gap-2">
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                </svg>
                <span>Signing in...</span>
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                </svg>
                <span>Sign In</span>
              </>
            )}
          </span>
          <div className="absolute inset-0 bg-gradient-launch opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        </button>
      </form>
    </div>
  );
}
