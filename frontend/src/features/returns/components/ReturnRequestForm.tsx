'use client';
import { isAxiosError } from 'axios';
import { useRef, useState } from 'react';
import type { Order } from '@/features/orders/types/order';
import { requestReturn } from '../api/returns';
import { apiError } from '@/lib/api/errors';

export default function ReturnRequestForm({order, token, onCreated}: {order: Order; token?: string; onCreated: () => void}) {
  const [itemId, setItemId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  if (!['paid', 'processing', 'shipped'].includes(order.status)) return null;
  const available = order.items.map(item => ({...item, remaining: Math.max(0, item.quantity - order.returns.filter(returned => returned.item === item.id && returned.status !== 'rejected').reduce((sum, returned) => sum+returned.quantity, 0))})).filter(item => item.remaining > 0);
  const selected = available.find(item => item.id === itemId) ?? available[0];
  if (complete) return <p role="status">Return request submitted for staff review. A refund has not been issued.</p>;
  if (!selected) return <p>All purchased quantities already have return requests.</p>;
  return <section className="border-t mt-8 pt-6"><h2 className="text-xl font-bold">Request a return</h2>
    <p>Return eligibility and the return window are checked by the backend. Staff must review your request.</p>
    {error && <p role="alert">{error}</p>}
    <form className="space-y-4 mt-4" onSubmit={async event => {
      event.preventDefault(); if (submitting.current || uncertain) return;
      const count = Number(quantity);
      if (!Number.isInteger(count) || count < 1 || count > selected.remaining || !reason.trim()) {setError('Enter a valid remaining quantity and a reason.'); return;}
      submitting.current = true; setBusy(true); setError('');
      try {await requestReturn({order_number: order.order_number, item_id: selected.id, quantity: count, reason: reason.trim(), ...(token ? {token} : {})}); setComplete(true); onCreated();}
      catch (error) {
        if (!isAxiosError(error) || !error.response || error.response.status >= 500) {
          setUncertain(true); setError('The request outcome could not be confirmed. Refresh order status before trying again.');
        } else setError(apiError(error, 'Unable to submit this return. Please check the details.'));
      }
      finally {setBusy(false); submitting.current = false;}
    }}>
      <label className="block">Return item<select className="w-full border p-2" disabled={busy || uncertain} value={selected.id} onChange={event => {setItemId(Number(event.target.value)); setQuantity('1');}}>{available.map(item => <option key={item.id} value={item.id}>{item.product_name} · {item.remaining} remaining</option>)}</select></label>
      <label className="block">Return quantity<input className="w-full border p-2" type="number" required min={1} max={selected.remaining} step={1} disabled={busy || uncertain} value={quantity} onChange={event => setQuantity(event.target.value)} /></label>
      <label className="block">Reason<textarea className="w-full border p-2" required maxLength={2000} disabled={busy || uncertain} value={reason} onChange={event => setReason(event.target.value)} /></label>
      <button disabled={busy || uncertain} className="bg-brand-ink text-brand-paper p-3">{busy ? 'Submitting…' : 'Submit return request'}</button>
    </form>
  </section>;
}
