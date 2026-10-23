'use client';
import { useRef, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { apiError } from '@/lib/api/errors';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import apiClient from '@/lib/api/client';
import { fetchCart } from '@/features/cart/state/cart-slice';
import { formatCurrency } from '@/lib/utils';
import { paymentLabels, type PaymentMethod, type CheckoutOrder } from '../api/checkout';
import { useCheckoutResources } from '../hooks/use-checkout-resources';

export default function CheckoutPage() {
  const auth = useAppSelector(state => state.auth);
  const identity = auth.initialized && !auth.loading ? auth.user?.id ?? 'guest' : 'restoring';
  return <CheckoutForm key={identity} />;
}

function CheckoutForm() {
  const {quote, loading: basketLoading} = useAppSelector(state => state.cart);
  const auth = useAppSelector(state => state.auth);
  const dispatch = useAppDispatch();
  const {selected, ready: currenciesReady} = useAppSelector(state => state.currency);
  const resources = useCheckoutResources();
  const [error, setError] = useState('');
  const [order, setOrder] = useState<{owner: typeof resources.owner; data: CheckoutOrder} | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [choice, setChoice] = useState('default');
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [shipping, setShipping] = useState({name: '', address: '', city: '', postcode: '', country: 'GB'});
  const [loading, setLoading] = useState(false);
  const submitting = useRef(false);
  const methods = resources.methods?.data?.methods;
  const available = (['stripe', 'bank', 'crypto'] as const).filter(key => methods?.[key] === true);
  const paymentMethod = method && available.includes(method) ? method : available[0];
  const saved = resources.book?.items.find(address => choice === 'default' ? address.is_default : String(address.id) === choice);
  const ready = Boolean(quote && quote.currency === selected && !basketLoading && currenciesReady && resources.owner !== null && paymentMethod);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!ready || !quote || submitting.current) return;
    submitting.current = true; setError(''); setLoading(true);
    const owner = resources.owner;
    try {
      const {data} = await apiClient.post<CheckoutOrder>('/api/cart/checkout/', {
        email: email ?? auth.user?.email ?? '', currency: quote.currency, payment_method: paymentMethod,
        ...(saved ? {address_id: saved.id} : {
          shipping_name: shipping.name, shipping_address: shipping.address, shipping_city: shipping.city,
          shipping_postcode: shipping.postcode, shipping_country: shipping.country.toUpperCase(),
        }),
      });
      setOrder({owner, data});
      void dispatch(fetchCart());
      if (data.guest_access_token) {
        try {sessionStorage.setItem(`order-access:${data.order_number}`, data.guest_access_token);} catch { /* Email recovery remains available. */ }
      }
    } catch (error) {setError(apiError(error, 'Unable to start payment. Please check your basket and try again.'));}
    finally {submitting.current = false; setLoading(false);}
  };
  if (order && resources.owner !== null && order.owner === resources.owner) {
    let paymentUrl: string | null = null;
    try {
      const target = new URL(order.data.payment_url);
      if (target.protocol === 'https:' && !target.username && !target.password) paymentUrl = target.href;
    } catch { /* Keep the created order visible instead of retrying order creation. */ }
    return <section className="max-w-2xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold">Confirm payment</h1>
      <p>Order {order.data.order_number}: {formatCurrency(order.data.total, order.data.currency)}</p>
      <p className="my-4">This is the final amount calculated by the backend. Payment is still pending.</p>
      {paymentUrl ? <a href={paymentUrl} className="bg-brand-ink text-brand-paper inline-block px-6 py-3">Continue to secure payment</a> :
        <p role="alert">Your order was created but its payment link is unavailable. Keep the order number and contact support; do not create another order.</p>}
    </section>;
  }
  if (!quote || quote.currency !== selected || basketLoading || !currenciesReady) return <section className="max-w-2xl mx-auto px-4 py-10">
    <h1 className="text-2xl font-bold">Review your basket first</h1><Link href="/cart" className="underline">Get a current total</Link>
  </section>;
  return <section className="max-w-2xl mx-auto px-4 py-10">
    <h1 className="text-2xl font-bold mb-6">Checkout</h1>
    <p className="mb-4">Total: {formatCurrency(quote.total, quote.currency)}</p>
    {error && <p role="alert">{error}</p>}
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="block">Email<input className="w-full border p-2" type="email" autoComplete="email" required disabled={loading} value={email ?? auth.user?.email ?? ''} onChange={event => setEmail(event.target.value)} /></label>
      {resources.owner !== null && resources.owner !== 'guest' && <div>
        <Link href="/account/addresses" className="underline">Manage saved addresses</Link>
        {!resources.book && <p role="status">Loading saved addresses…</p>}
        {resources.book?.error && <p role="alert">{resources.book.error} <button type="button" onClick={resources.retry} disabled={loading} className="underline">Retry addresses</button></p>}
        {resources.book && <label className="block mt-3">Shipping address<select disabled={loading} className="w-full border p-2" value={saved ? String(saved.id) : 'new'} onChange={event => setChoice(event.target.value)}>
          <option value="new">Enter a new shipping address</option>
          {resources.book.items.map(address => <option key={address.id} value={address.id}>{address.label || address.full_name} · {address.line1}{address.is_default ? ' (default)' : ''}</option>)}
        </select></label>}
        {resources.book?.nextPage && <button type="button" disabled={loading || resources.moreBusy} onClick={() => void resources.loadMore()} className="underline">Load more addresses</button>}
      </div>}
      {saved ? <address className="not-italic border p-3">{saved.full_name}<br />{saved.line1} {saved.line2}<br />{saved.city}, {saved.postcode}, {saved.country}</address> : <fieldset disabled={loading} className="space-y-3"><legend className="font-semibold">Shipping details</legend>
        {([
          ['name', 'Full Name', 100], ['address', 'Address', 255], ['city', 'City', 100], ['postcode', 'Postcode', 20], ['country', 'Country code', 2],
        ] as const).map(([key, label, maxLength]) => <label key={key} className="block">{label}<input className="w-full border p-2" required maxLength={maxLength} pattern={key === 'country' ? '[A-Za-z]{2}' : undefined} value={shipping[key]} onChange={event => {setChoice('new'); setShipping({...shipping, [key]: event.target.value});}} /></label>)}
      </fieldset>}
      <fieldset disabled={loading} className="border p-4 space-y-2"><legend className="font-semibold">Payment method</legend>
        {!resources.methods && <p role="status">Loading payment methods…</p>}
        {resources.methods?.error && <p role="alert">{resources.methods.error} <button type="button" onClick={resources.retry} className="underline">Retry payment methods</button></p>}
        {resources.methods?.data && !available.length && <p role="status">No payment methods are currently configured. Please try again later.</p>}
        {available.map(key => <label key={key} className="block"><input type="radio" name="payment_method" value={key} checked={paymentMethod === key} onChange={() => setMethod(key)} /> {paymentLabels[key]}</label>)}
        {!!available.length && <p className="text-sm">Available currencies and bank methods are confirmed by the payment provider. Bank and crypto payments may take time to confirm.</p>}
      </fieldset>
      <button type="submit" disabled={loading || !ready} className="bg-brand-ink text-brand-paper px-8 py-3 rounded">{loading ? 'Processing...' : 'Place Order'}</button>
    </form>
  </section>;
}
