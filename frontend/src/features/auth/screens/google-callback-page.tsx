'use client';
import { useEffect, useRef, useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { useAppDispatch } from '@/store/hooks';
import { googleLogin } from '../state/auth-slice';

export default function GoogleCallbackPage() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code'); const state = params.get('state');
    window.history.replaceState(window.history.state, '', window.location.pathname);
    if (!code || !state || params.has('error')) {setError('Google sign-in was cancelled or the callback is incomplete. Please start again.'); return;}
    void dispatch(googleLogin({code, state})).then(result => {
      if (googleLogin.fulfilled.match(result)) router.replace('/account');
      else setError(String(result.payload || 'Google sign-in failed. Please start again.'));
    });
  }, [dispatch, router]);
  return <section className="max-w-md mx-auto px-4 py-20"><h1 className="text-2xl font-bold">Google sign-in</h1>
    {error ? <><p role="alert">{error}</p><Link href="/login" className="underline">Return to sign in</Link></> : <p role="status">Completing sign-in…</p>}
  </section>;
}
