'use client';

/**
 * Protected Route Component
 *
 * Wraps components that require operator authentication.
 * Redirects to login page if user is not authenticated or lacks operator role.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading, isOperator } = useAuth();
  const router = useRouter();

  useEffect(() => {
    console.log('🛡️ ProtectedRoute check:', { loading, user: user?.email, isOperator });
    if (!loading) {
      if (!user || !isOperator) {
        console.log('❌ Access denied, redirecting to login');
        router.push('/login');
      } else {
        console.log('✅ Access granted to operator dashboard');
      }
    }
  }, [user, loading, isOperator, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="text-center space-y-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-orange-500 border-t-transparent mx-auto"></div>
          <p className="text-slate-400">Verifying credentials...</p>
        </div>
      </div>
    );
  }

  if (!user || !isOperator) {
    return null;
  }

  return <>{children}</>;
}
