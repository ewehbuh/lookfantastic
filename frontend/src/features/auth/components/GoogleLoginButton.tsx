'use client';
import { useEffect, useState } from 'react';
import apiClient from '@/lib/api/client';
import { apiError } from '@/lib/api/errors';

export default function GoogleLoginButton() {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [url, setUrl] = useState('');
  useEffect(() => {
    let active = true;
    apiClient.get<{google: {enabled: boolean}}>('/api/accounts/auth/providers/')
      .then(({data}) => {if (active) setEnabled(data.google.enabled);}).catch(() => {});
    return () => {active = false;};
  }, []);
  if (!enabled) return null;
  return <div className="mt-4">{error && <p role="alert">{error}</p>}
    {url ? <a href={url} className="block text-center border p-3">Continue with Google</a> : <button disabled={busy} className="w-full border p-3" onClick={async () => {
      setBusy(true); setError('');
      try {
        const {data} = await apiClient.get<{authorization_url: string}>('/api/accounts/google/start/');
        const target = new URL(data.authorization_url);
        if (target.origin !== 'https://accounts.google.com') throw new Error('Invalid authorization URL');
        setUrl(target.href);
      } catch (error) {setError(apiError(error, 'Unable to start Google sign-in. Try again.'));}
      finally {setBusy(false);}
    }}>{busy ? 'Preparing Google…' : 'Sign in with Google'}</button>}
  </div>;
}
