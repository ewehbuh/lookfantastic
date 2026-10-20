
import ProtectedRoute from '@/components/account/ProtectedRoute';

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <ProtectedRoute>{children}</ProtectedRoute>;
}