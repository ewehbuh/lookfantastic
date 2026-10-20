'use client';

import { Link } from '@/i18n/navigation';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { logout } from '@/features/auth/state/auth-slice';
import CurrencySelector from '@/features/currency/components/CurrencySelector';
import MegaMenu from './MegaMenu';

export default function Header() {
  const { user } = useAppSelector((s) => s.auth);
  const totalItems = useAppSelector((s) => s.cart.totalItems);
  const dispatch = useAppDispatch();   // ← fixed

  return (
    <header className="bg-brand-paper text-brand-ink border-b border-brand-border">
      <div className="max-w-7xl mx-auto flex items-center justify-between p-4">
        <Link href="/" className="text-xl font-bold">
          Lookfantastic
        </Link>

        <Link href="/products" className="text-sm underline">Shop all</Link>
        <MegaMenu />
        <CurrencySelector />

        <div className="flex items-center gap-4 text-sm">
          {user ? (
            <>
              <Link href="/account" className="hover:underline">
                My Account
              </Link>

               {(user.is_staff || user.is_superuser) && (
                <Link href="/admin" className="hover:underline text-brand-muted">
                  Admin
                </Link>
            )}

              <button
                onClick={() => dispatch(logout())}
                className="hover:underline"
              >
                Logout
              </button>
            </>
          ) : (
            <Link href="/login" className="hover:underline">
              Login
            </Link>
          )}

          <Link href="/cart" className="hover:underline">
            Cart ({totalItems})
          </Link>
        </div>
      </div>
    </header>
  );
}
