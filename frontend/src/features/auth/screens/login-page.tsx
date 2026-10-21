'use client';

import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import GoogleLoginButton from '../components/GoogleLoginButton';
import { login } from '@/features/auth/state/auth-slice';
import { Link } from '@/i18n/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const dispatch = useAppDispatch();
  const { loading, error } = useAppSelector((s) => s.auth);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await dispatch(login({ email, password }));

    if (login.fulfilled.match(result)) {
      // Extract user data (now includes is_staff, is_superuser)
      const user = result.payload.user;

      // Redirect admin users to the admin panel, others to account page
      if (user?.is_staff || user?.is_superuser) {
        router.push('/admin');
      } else {
        router.push('/account');
      }
    }
    // If rejected, the error state will be shown automatically
  };

  return (
    <div className="max-w-md mx-auto py-20">
      <h1 className="text-2xl font-bold mb-6">Login</h1>
      {error && (
        <div role="alert" className="bg-red-100 text-red-700 p-3 rounded mb-4">
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          className="w-full border p-2"
          type="email"
          aria-label="Email"
          autoComplete="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className="w-full border p-2"
          type="password"
          aria-label="Password"
          autoComplete="current-password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-brand-ink text-brand-paper py-2 rounded"
        >
          {loading ? 'Logging in...' : 'Login'}
        </button>
      </form>
      <GoogleLoginButton />
      <p className="mt-4 text-sm">
        <Link href="/register">Create account</Link> |{' '}
        <Link href="/reset-password">Forgot password?</Link>
      </p>
    </div>
  );
}
