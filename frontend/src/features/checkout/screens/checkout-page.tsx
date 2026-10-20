'use client';

import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import { apiError } from '@/lib/api/errors';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import apiClient from '@/lib/api/client';
import { fetchCart } from '@/features/cart/state/cart-slice';
import { formatCurrency } from '@/lib/utils';

export default function CheckoutPage() {
  const {quote, loading: basketLoading} = useAppSelector(state => state.cart);
  const dispatch = useAppDispatch();
  const {selected, ready: currenciesReady} = useAppSelector(state => state.currency);
  const [error, setError] = useState('');
  const [order, setOrder] = useState<{order_number: string; total: string; currency: string; payment_url: string} | null>(null);
  const [email, setEmail] = useState('');
  const [shipping, setShipping] = useState({
    name: '', address: '', city: '', postcode: '', country: 'GB',
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quote || quote.currency !== selected || basketLoading || !currenciesReady) return;
    setError('');
    setLoading(true);
    try {
      const { data } = await apiClient.post('/api/cart/checkout/', {
        email,
        currency: quote.currency,
        shipping_name: shipping.name,
        shipping_address: shipping.address,
        shipping_city: shipping.city,
        shipping_postcode: shipping.postcode,
        shipping_country: shipping.country,
      });
      const paymentUrl = new URL(data.payment_url);
      if (paymentUrl.protocol !== 'https:') throw new Error('Invalid payment URL');
      setOrder(data);
      void dispatch(fetchCart());
      if (data.guest_access_token) {
        try {sessionStorage.setItem(`order-access:${data.order_number}`, data.guest_access_token);} catch { /* Email recovery is available on the backend. */ }
      }
    } catch (err) {
      setError(apiError(err, 'Unable to start payment. Please check your basket and try again.'));
    } finally {
      setLoading(false);
    }
  };

  if (order) return <section className="max-w-2xl mx-auto py-10">
    <h1 className="text-2xl font-bold">Confirm payment</h1>
    <p>Order {order.order_number}: {formatCurrency(order.total, order.currency)}</p>
    <p className="my-4">This is the final amount calculated by the backend. Payment is still pending.</p>
    <a href={order.payment_url} className="bg-brand-ink text-brand-paper inline-block px-6 py-3">Continue to secure payment</a>
  </section>;
  if (!quote || quote.currency !== selected || basketLoading || !currenciesReady) return <section className="max-w-2xl mx-auto py-10">
    <h1 className="text-2xl font-bold">Review your basket first</h1>
    <Link href="/cart" className="underline">Get a current total</Link>
  </section>;

  return (
    <div className="max-w-2xl mx-auto py-10">
      <h1 className="text-2xl font-bold mb-6">Checkout</h1>
      <p className="mb-4">Total: {formatCurrency(quote.total, quote.currency)}</p>
      {error && <p role="alert">{error}</p>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <input className="w-full border p-2" aria-label="Email" placeholder="Email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="w-full border p-2" aria-label="Full Name" placeholder="Full Name" required value={shipping.name} onChange={(e) => setShipping({ ...shipping, name: e.target.value })} />
        <input className="w-full border p-2" aria-label="Address" placeholder="Address" required value={shipping.address} onChange={(e) => setShipping({ ...shipping, address: e.target.value })} />
        <input className="w-full border p-2" aria-label="City" placeholder="City" required value={shipping.city} onChange={(e) => setShipping({ ...shipping, city: e.target.value })} />
        <input className="w-full border p-2" aria-label="Postcode" placeholder="Postcode" required value={shipping.postcode} onChange={(e) => setShipping({ ...shipping, postcode: e.target.value })} />
        <input aria-label="Country code" className="w-full border p-2" required maxLength={2} value={shipping.country} onChange={event => setShipping({...shipping, country: event.target.value.toUpperCase()})} />
        <button type="submit" disabled={loading} className="bg-brand-ink text-brand-paper px-8 py-3 rounded">
          {loading ? 'Processing...' : 'Place Order'}
        </button>
      </form>
    </div>
  );
}
