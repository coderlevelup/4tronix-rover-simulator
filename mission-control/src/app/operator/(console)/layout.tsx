'use client';

import { OperatorConsole } from '@/components/operator/OperatorConsole';
import { ProtectedRoute } from '@/components/operator/ProtectedRoute';

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <OperatorConsole>
        {children}
      </OperatorConsole>
    </ProtectedRoute>
  );
}
