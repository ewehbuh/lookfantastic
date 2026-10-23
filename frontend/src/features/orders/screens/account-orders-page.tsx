'use client';
import { useEffect, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { ordersApi } from '../api/orders';
import type { OrderPage } from '../types/order';
import { formatCurrency } from '@/lib/utils';
import { apiError } from '@/lib/api/errors';
export default function AccountOrdersPage() {
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [resource, setResource] = useState<{page: number; revision: number; data: OrderPage | null; error: string} | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    ordersApi.list(page, controller.signal).then(data => {if (!controller.signal.aborted) setResource({page, revision, data, error: ''});})
      .catch(error => {if (!controller.signal.aborted) setResource({page, revision, data: null, error: apiError(error, 'Unable to load orders. Please try again.')});});
    return () => controller.abort();
  }, [page, revision]);
  const current = resource?.page === page && resource.revision === revision ? resource : null;
  return <section className="max-w-4xl mx-auto p-4 py-10"><h1 className="text-2xl font-bold mb-6">Your orders</h1>
    {!current && <p role="status">Loading orders…</p>}
    {current?.error && <p role="alert">{current.error}</p>}
    {current?.data?.results.length === 0 && <p>No orders yet.</p>}
    {current?.data?.results.map(order => <article key={order.id} className="border p-4 my-3"><Link href={`/account/orders/${encodeURIComponent(order.order_number)}`} className="font-semibold underline">Order {order.order_number}</Link><p>{order.status} · {formatCurrency(order.total, order.currency)}</p></article>)}
    <nav aria-label="Order pagination" className="flex gap-4 my-4">{current?.data?.previous && <button onClick={() => setPage(value => value-1)}>Previous orders</button>}{current?.data?.next && <button onClick={() => setPage(value => value+1)}>Next orders</button>}</nav>
    <button disabled={!current} onClick={() => setRevision(value => value+1)} className="underline">Reload orders</button>
  </section>;
}
