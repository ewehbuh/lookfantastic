'use client';
import { useEffect, useRef, useState } from 'react';
import { ordersApi } from '../api/orders';
import OrderStatus from '../components/OrderStatus';
import { apiError } from '@/lib/api/errors';

export default function GuestAccessPage() {
  const captured = useRef(false);
  const [link, setLink] = useState<{number: string; token?: string} | null>(null);
  const [number, setNumber] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (captured.current) return;
    captured.current = true;
    const query = new URLSearchParams(window.location.search);
    const number = query.get('order_number') || '';
    const token = query.get('token') || undefined;
    if (token) window.history.replaceState(window.history.state, '', window.location.pathname);
    setNumber(number); setLink({number, token});
    // Read window only once; removing sensitive parameters must not erase in-memory access.
  }, []);
  return <section className="max-w-3xl mx-auto p-4 py-10"><h1 className="text-2xl font-bold mb-6">Guest order access</h1>
    {link?.token && <div className="mb-8"><OrderStatus number={link.number} token={link.token} guestOnly />
      <button className="underline mt-4" onClick={() => {try {sessionStorage.removeItem(`order-access:${link.number}`);} catch { /* Storage unavailable. */ } setLink(null);}}>Forget access on this page</button>
    </div>}
    <h2 className="font-bold">Request an access email</h2>
    <p>Use the email address entered at guest checkout.</p>
    {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
    <form className="space-y-4 mt-4" onSubmit={async event => {
      event.preventDefault(); setBusy(true); setError(''); setMessage('');
      try {await ordersApi.requestAccess(number, email); setMessage('If the details match a guest order, an access link will be emailed.');}
      catch (error) {setError(apiError(error, 'Unable to request access. Please try again later.'));}
      finally {setBusy(false);}
    }}>
      <label className="block">Order number<input required maxLength={20} value={number} onChange={event => setNumber(event.target.value)} className="w-full border p-2" /></label>
      <label className="block">Email<input required type="email" value={email} onChange={event => setEmail(event.target.value)} className="w-full border p-2" /></label>
      <button disabled={busy} className="bg-brand-ink text-brand-paper p-3">{busy ? 'Requesting…' : 'Send access link'}</button>
    </form>
  </section>;
}
