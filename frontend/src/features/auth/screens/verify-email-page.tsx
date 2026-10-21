'use client';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import apiClient from '@/lib/api/client';
import { apiError } from '@/lib/api/errors';

export default function VerifyEmailPage() {
  const params = useSearchParams();
  const [key, setKey] = useState(params.get('key') || '');
  const [complete, setComplete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <section className="max-w-md mx-auto px-4 py-20"><h1 className="text-2xl font-bold">Verify email</h1>
    {complete ? <><p role="status">Email verified.</p><Link href="/login" className="underline">Sign in</Link></> : <form className="space-y-4" onSubmit={async event => {
      event.preventDefault(); setError(''); setBusy(true);
      try {await apiClient.post('/api/accounts/verify-email/', {key}); setComplete(true);}
      catch (error) {setError(apiError(error, 'The verification link is invalid or expired.'));}
      finally {setBusy(false);}
    }}>
      {error && <p role="alert">{error}</p>}
      <label className="block">Verification key<input required className="w-full border p-2" value={key} onChange={event => setKey(event.target.value)} /></label>
      <button disabled={busy} className="bg-brand-ink text-brand-paper p-3">Verify email</button>
    </form>}
  </section>;
}
