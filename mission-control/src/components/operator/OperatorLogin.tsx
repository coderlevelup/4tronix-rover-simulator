'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, AlertTriangle, LogIn } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getFirebaseAuth } from '@/lib/firebase';

export function OperatorLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn, isOperator, loading: authLoading } = useAuth();
  const router = useRouter();

  // Send an already-signed-in operator who lands on /login straight to the
  // console. Suppressed while a sign-in is in flight (handleSubmit owns that
  // redirect from the verified token claim) so the two paths never race.
  useEffect(() => {
    if (!authLoading && isOperator && !loading) {
      router.replace('/operator');
    }
  }, [authLoading, isOperator, loading, router]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    console.log('🔐 Attempting login with:', email);

    try {
      await signIn(email, password);

      const auth = getFirebaseAuth();
      const user = auth.currentUser;
      if (!user) {
        throw new Error('Sign-in did not complete. Please try again.');
      }

      // Force-refresh the token so we read the latest custom claims (role) -
      // the same signal the server proxy trusts - instead of waiting on a
      // separate, racy role lookup. This is what fixes the first-login hang:
      // the redirect decision no longer depends on async context state landing
      // in the right order.
      const tokenResult = await user.getIdTokenResult(true);
      const role = tokenResult.claims.role as string | undefined;

      // Establish the server session cookie from the verified token.
      const sessionResponse = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenResult.token }),
      });

      if (!sessionResponse.ok) {
        const errorData = await sessionResponse.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to establish session');
      }

      if (role === 'operator' || role === 'admin') {
        // Session is set and the role is verified - go to the console. A full
        // navigation re-initialises auth against the fresh session cookie, so
        // the console never flashes "access required" while context catches up.
        // Keep the button loading; this navigation unmounts the form.
        window.location.replace('/operator');
      } else {
        setError('Your account does not have operator access.');
        setLoading(false);
      }
    } catch (err) {
      console.error('❌ Login error:', err);
      const e = err as { code?: string; message?: string };

      let errorMessage = 'Login failed';

      if (e.code === 'auth/invalid-credential') {
        errorMessage = 'Invalid email or password';
      } else if (e.code === 'auth/user-not-found') {
        errorMessage = 'User not found';
      } else if (e.code === 'auth/wrong-password') {
        errorMessage = 'Incorrect password';
      } else if (e.code === 'auth/too-many-requests') {
        errorMessage = 'Too many attempts. Please try again later';
      } else if (e.message) {
        errorMessage = e.message;
      }

      setError(errorMessage);
      setLoading(false);
    }
  };

  return (
    <div className="relative w-full max-w-md space-y-6 overflow-hidden rounded-3xl border border-border bg-card/60 p-8 backdrop-blur-xl clay">
      <div className="relative space-y-3 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-mars clay">
          <Lock className="h-7 w-7 text-primary-foreground" />
        </div>
        <h2 className="font-display text-2xl font-bold text-foreground">Operator Login</h2>
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Sign in with your operator credentials</p>
      </div>

      <form onSubmit={handleSubmit} className="relative grid gap-5">
        {error && (
          <div className="flex items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
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
          className="clay clay-press mt-2 flex items-center justify-center gap-2 rounded-2xl bg-gradient-mars px-6 py-3.5 text-sm font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          type="submit"
          disabled={loading}
        >
          {loading ? (
            <>
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>Signing in...</span>
            </>
          ) : (
            <>
              <LogIn className="h-4 w-4" />
              <span>Sign In</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
}
