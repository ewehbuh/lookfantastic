'use client';

import { useAppSelector } from '@/store/hooks';
import { Link } from '@/i18n/navigation';

export default function Dashboard() {
  const { user } = useAppSelector((s) => s.auth);

  return (
    <div className="max-w-2xl mx-auto py-10">
      <h1 className="text-2xl font-bold mb-4">My Account</h1>
      <p>Email: {user?.email}</p>
      <div className="mt-6 space-y-2">
        <Link href="/account/addresses" className="block underline">Address book</Link>
        <Link href="/account/wishlist" className="block underline">Wishlist</Link>
        <Link href="/account/points" className="block underline">Beauty Bag Points</Link>
        <Link href="/subscriptions" className="block underline">Beauty Box Subscription</Link>
      </div>
    </div>
  );
}
