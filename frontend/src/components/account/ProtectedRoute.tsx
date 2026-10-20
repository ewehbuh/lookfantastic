'use client';

import { useRouter } from 'next/navigation';
import { useAppSelector } from '@/store/hooks';
import { useEffect } from 'react';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { accessToken } = useAppSelector((s) => s.auth);
  const router = useRouter();

  useEffect(() => {
    if (!accessToken) {
      router.push('/login');
    }
  }, [accessToken, router]);

  if (!accessToken) return null;
  return <>{children}</>;
}
