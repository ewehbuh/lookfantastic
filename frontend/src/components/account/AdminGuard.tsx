'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppSelector } from '@/store/hooks';

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const user = useAppSelector((state) => state.auth.user);
  const router = useRouter();

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    if (!user.is_staff && !user.is_superuser) {
      router.push('/');
    }
  }, [user, router]);

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
