'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import OrderStatus from '@/features/orders/components/OrderStatus';
export default function CheckoutSuccessPage() {
  const params = useSearchParams();
  const number = params.get('order') || '';
  const [access, setAccess] = useState<{number: string; token?: string} | null>(null);
  useEffect(() => {
    let token: string | undefined;
    try {token = sessionStorage.getItem(`order-access:${number}`) || undefined;} catch { /* Offer email recovery when storage is unavailable. */ }
    setAccess({number, token});
  }, [number]);
  return <section className="max-w-3xl mx-auto p-4 py-10"><h1 className="text-2xl font-bold mb-6">Order confirmation</h1>
    {access?.number === number ? <OrderStatus number={number} token={access.token} /> : <p role="status">Loading order access…</p>}
  </section>;
}
