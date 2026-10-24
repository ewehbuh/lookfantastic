'use client';
import { useEffect, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { useAppSelector } from '@/store/hooks';
import { ordersApi } from '../api/orders';
import { apiError } from '@/lib/api/errors';
import type { Order } from '../types/order';
import ReturnRequestForm from '@/features/returns/components/ReturnRequestForm';
import OrderSummary from './OrderSummary';

export default function OrderStatus({number, token, guestOnly = false}: {number: string; token?: string; guestOnly?: boolean}) {
  const auth = useAppSelector(state => state.auth);
  const owner = token ? 'guest-capability' : !guestOnly && auth.initialized && !auth.loading && !auth.logoutError ? auth.user?.id ?? null : null;
  const [notice, setNotice] = useState<{owner: typeof owner; number: string; message: string} | null>(null);
  const [revision, setRevision] = useState(0);
  const [resource, setResource] = useState<{owner: typeof owner; number: string; token?: string; revision: number; order: Order | null; error: string} | null>(null);
  useEffect(() => {
    if (!number || owner === null) return;
    const controller = new AbortController();
    const request = token ? ordersApi.guest(number, token, controller.signal) : ordersApi.detail(number, controller.signal);
    request.then(order => {
      if (!controller.signal.aborted) {
        if (token) {try {sessionStorage.setItem(`order-access:${number}`, token);} catch { /* Access remains in memory. */ }}
        setResource({owner, number, token, revision, order, error: ''});
      }
    }).catch(error => {if (!controller.signal.aborted) setResource({owner, number, token, revision, order: null, error: apiError(error, 'Unable to access this order. Sign in or request a new guest access link.')});});
    return () => controller.abort();
  }, [owner, number, token, revision]);
  const current = resource?.owner === owner && resource?.number === number && resource?.token === token && resource?.revision === revision ? resource : null;
  if (!number) return <p role="alert">No order number was supplied.</p>;
  if (!token && !guestOnly && (!auth.initialized || auth.loading)) return <p role="status">Checking your session…</p>;
  if (owner === null) return <div><p>Sign in to view an account order, or request an access link for a guest order.</p><Link href="/login" className="underline mr-4">Sign in</Link><Link href={`/orders/access?order_number=${encodeURIComponent(number)}`} className="underline">Request guest access</Link></div>;
  return <div>
    {!current && <p role="status">Checking order status…</p>}
    {current?.error && <div role="alert">{current.error} <Link href={`/orders/access?order_number=${encodeURIComponent(number)}`} className="underline">Request guest access</Link></div>}
    {notice?.owner === owner && notice?.number === number && owner !== null && <p role="status">{notice.message}</p>}
    {current?.order && <><OrderSummary order={current.order} /><ReturnRequestForm key={`${owner}-${number}`} order={current.order} token={token} onCreated={() => {setNotice({owner, number, message: 'Return request submitted for staff review. A refund has not been issued.'}); setRevision(value => value+1);}} /></>}
    <button disabled={!current} onClick={() => setRevision(value => value+1)} className="border p-3 mt-6">Refresh order status</button>
  </div>;
}
