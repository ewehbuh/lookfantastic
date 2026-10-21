'use client';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import apiClient from '@/lib/api/client';
import { apiError } from '@/lib/api/errors';

export default function ResetPasswordPage() {
  const params = useSearchParams();
  const uid = params.get('uid');
  const token = params.get('token');
  const confirming = Boolean(uid && token);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return <section className="max-w-md mx-auto px-4 py-20"><h1 className="text-2xl font-bold mb-6">Reset password</h1>
    {message ? <><p role="status">{message}</p><Link href="/login" className="underline">Sign in</Link></> : <>
      {error && <p role="alert">{error}</p>}
      <form className="space-y-4" onSubmit={async event => {
        event.preventDefault(); setError('');
        if (confirming && password !== confirmation) {setError('Passwords must match.'); return;}
        setBusy(true);
        try {
          if (confirming) {
            await apiClient.post('/api/accounts/password-reset/confirm/', {uid, token, new_password1: password, new_password2: confirmation});
            setMessage('Password changed. You can now sign in.');
          } else {
            await apiClient.post('/api/accounts/password-reset/', {email});
            setMessage('If this email belongs to an account, a password reset link has been sent.');
          }
        } catch (error) {setError(apiError(error, 'Unable to reset your password. Check the link or try again.'));}
        finally {setBusy(false);}
      }}>
        {confirming ? <>
          <label className="block">New password<input className="w-full border p-2" type="password" autoComplete="new-password" required value={password} onChange={event => setPassword(event.target.value)} /></label>
          <label className="block">Confirm password<input className="w-full border p-2" type="password" autoComplete="new-password" required value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label>
        </> : <label className="block">Email<input className="w-full border p-2" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} /></label>}
        <button disabled={busy} className="bg-brand-ink text-brand-paper px-6 py-3">{busy ? 'Sending…' : confirming ? 'Set new password' : 'Send reset link'}</button>
      </form>
    </>}
  </section>;
}
