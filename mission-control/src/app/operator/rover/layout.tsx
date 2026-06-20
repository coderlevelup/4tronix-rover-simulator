import { ProtectedRoute } from '@/components/operator/ProtectedRoute';

export default function RoverLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      {children}
    </ProtectedRoute>
  );
}
