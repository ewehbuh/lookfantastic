'use client';

import { useRouter } from '@/i18n/navigation';
import { useAppSelector } from '@/store/hooks';
import { useEffect } from 'react';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { accessToken, initialized, loading } = useAppSelector((s) => s.auth);
  const router = useRouter();

  useEffect(() => {
    if (!initialized || loading) return;
    if (!accessToken) {
      router.push('/login');
    }
  }, [accessToken, router, initialized, loading]);

  if (!initialized || loading || !accessToken) return null;
  return <>{children}</>;
}
