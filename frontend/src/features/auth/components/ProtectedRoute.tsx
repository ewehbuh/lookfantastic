'use client';

import { useRouter } from '@/i18n/navigation';
import { useAppSelector } from '@/store/hooks';
import { useEffect } from 'react';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { accessToken, user, initialized, loading } = useAppSelector((s) => s.auth);
  const router = useRouter();

  useEffect(() => {
    if (!initialized || loading) return;
    if (!accessToken || !user) {
      router.push('/login');
    }
  }, [accessToken, user, router, initialized, loading]);

  if (!initialized || loading || !accessToken || !user) return null;
  return <>{children}</>;
}
