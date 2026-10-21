'use client';
import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { register } from '../state/auth-slice';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password1, setPassword1] = useState('');
  const [password2, setPassword2] = useState('');
  const [complete, setComplete] = useState(false);
  const [validation, setValidation] = useState('');
  const dispatch = useAppDispatch();
  const {loading, error} = useAppSelector(state => state.auth);
  if (complete) return <section className="max-w-md mx-auto py-20"><h1 className="text-2xl font-bold">Account created</h1>
    <p role="status">Check your email for a verification link, then sign in.</p><Link href="/login" className="underline">Sign in</Link></section>;
  return <section className="max-w-md mx-auto py-20 px-4"><h1 className="text-2xl font-bold mb-6">Create account</h1>
    {(validation || error) && <p role="alert">{validation || error}</p>}
    <form className="space-y-4" onSubmit={async event => {
      event.preventDefault(); setValidation('');
      if (password1 !== password2) {setValidation('Passwords must match.'); return;}
      const result = await dispatch(register({email, password1, password2}));
      if (register.fulfilled.match(result)) setComplete(true);
    }}>
      <label className="block">Email<input className="w-full border p-2" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} /></label>
      <label className="block">Password<input className="w-full border p-2" type="password" autoComplete="new-password" required value={password1} onChange={event => setPassword1(event.target.value)} /></label>
      <label className="block">Confirm password<input className="w-full border p-2" type="password" autoComplete="new-password" required value={password2} onChange={event => setPassword2(event.target.value)} /></label>
      <button disabled={loading} className="bg-brand-ink text-brand-paper px-6 py-3">{loading ? 'Creating…' : 'Create account'}</button>
    </form>
  </section>;
}
