'use client';

import { useEffect } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useAppSelector } from '@/store/hooks';

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const {user, initialized, loading} = useAppSelector((state) => state.auth);
  const router = useRouter();

  useEffect(() => {
    if (!initialized || loading) return;
    if (!user) {
      router.push('/login');
      return;
    }
    if (!user.is_staff && !user.is_superuser) {
      router.push('/');
    }
  }, [user, router, initialized, loading]);

  // Show nothing / loader while checking
  if (!user || (!user.is_staff && !user.is_superuser)) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-gray-500">Checking permissions…</p>
      </div>
    );
  }

  return <>{children}</>;
}
