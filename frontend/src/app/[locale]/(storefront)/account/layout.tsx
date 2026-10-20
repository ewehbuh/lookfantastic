
import ProtectedRoute from '@/features/auth/components/ProtectedRoute';

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <ProtectedRoute>{children}</ProtectedRoute>;
}
