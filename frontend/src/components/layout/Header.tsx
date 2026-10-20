'use client';

import Link from 'next/link';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { logout } from '@/store/authSlice';
import MegaMenu from './MegaMenu';
import AdminGuard from '../account/AdminGuard';

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

        <MegaMenu />

        <div className="flex items-center gap-4 text-sm">
          {user ? (
            <>
              <Link href="/account" className="hover:underline">
                My Account
              </Link>

               <AdminGuard>
                <Link href="/admin" className="hover:underline text-brand-muted">
                  Admin
                </Link>
            </AdminGuard>

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