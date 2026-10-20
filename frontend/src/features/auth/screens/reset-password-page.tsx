'use client';

import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useSearchParams } from 'next/navigation';
import apiClient from '@/lib/api/client';

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiClient.post('/api/accounts/password-reset/confirm/', {
        token,
        password,
      });
      setMessage('Password reset successful. You can now login.');
      setTimeout(() => router.push('/login'), 2000);
    } catch (err) {
      setMessage('Invalid or expired token.');
    }
  };

  return (
    <div className="max-w-md mx-auto py-20">
      <h1 className="text-2xl font-bold mb-6">Reset Password</h1>
      {message && <p className="mb-4">{message}</p>}
      {!message && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            className="w-full border p-2"
            type="password"
            placeholder="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit" className="w-full bg-brand-ink text-brand-paper py-2 rounded">
            Set new password
          </button>
        </form>
      )}
    </div>
  );
}
