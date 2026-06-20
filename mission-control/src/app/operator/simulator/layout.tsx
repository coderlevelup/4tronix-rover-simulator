import { ProtectedRoute } from '@/components/operator/ProtectedRoute';

export default function SimulatorLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      {children}
    </ProtectedRoute>
  );
}
