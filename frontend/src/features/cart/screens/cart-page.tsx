'use client';
import { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { fetchCart, updateCartItem, removeFromCart, applyVoucher, fetchQuote } from '../state/cart-slice';
import { Link } from '@/i18n/navigation';
import { formatCurrency } from '@/lib/utils';
import Price from '@/features/currency/components/Price';

export default function CartPage() {
  const dispatch = useAppDispatch();
  const cart = useAppSelector(state => state.cart);
  const currency = useAppSelector(state => state.currency);
  const auth = useAppSelector(state => state.auth);
  const authReady = auth.initialized && !auth.loading;
  const [code, setCode] = useState('');
  useEffect(() => {if (authReady) void dispatch(fetchCart());}, [authReady, auth.user?.id, dispatch]);
  useEffect(() => {
    if (cart.loaded && !cart.loading && currency.ready && cart.items.length) void dispatch(fetchQuote(currency.selected));
  }, [cart.revision, cart.loaded, cart.loading, cart.items.length, currency.selected, currency.ready, dispatch]);
  const quote = currency.ready && cart.quote?.currency === currency.selected && !cart.loading ? cart.quote : null;
  const unavailable = cart.items.some(item => !item.variant || item.quantity > item.variant.stock);
  return <section className="max-w-4xl mx-auto px-4 py-10">
    <h1 className="text-2xl font-bold mb-6">Shopping basket ({cart.totalItems} items)</h1>
    {cart.error && <div role="alert" className="border p-3 mb-4">{cart.error} <button onClick={() => void dispatch(fetchCart())} className="underline">Reload basket</button></div>}
    {currency.error && <p role="alert">{currency.error}</p>}
    {cart.warnings.map((warning, index) => <p role="status" key={`${warning.variant_id}-${index}`}>{warning.detail}</p>)}
    {!cart.loaded && !cart.error && <p role="status">Loading your basket…</p>}
    {cart.loaded && !cart.items.length && <div><p>Your basket is empty.</p><Link href="/products" className="underline">Continue shopping</Link></div>}
    {unavailable && <p role="alert">Some items have insufficient stock. Update or remove them before checkout.</p>}
    {cart.items.map(item => {
      const line = quote?.items.find(line => line.id === item.id);
      const name = item.variant?.product_name || item.variant?.sku || 'Unavailable product';
      return <article key={item.id} className="flex flex-wrap gap-4 items-center justify-between border-b py-4">
        <div><h2 className="font-semibold">{name}</h2><p>{item.variant?.size} {item.variant?.shade}</p>
          {Number(item.promotion_discount) > 0 && <p>Indicative promotion saving: <Price amount={item.promotion_discount} /></p>}
          <div className="flex gap-3 mt-3 items-center">
            <button aria-label={`Decrease quantity of ${name}`} disabled={cart.loading || item.quantity <= 1} onClick={() => void dispatch(updateCartItem({item_id: item.id, quantity: item.quantity-1}))} className="border px-3">−</button>
            <span>Quantity: {item.quantity}</span>
            <button aria-label={`Increase quantity of ${name}`} disabled={cart.loading || !item.variant || item.quantity >= Math.min(item.variant.stock, 10000)} onClick={() => void dispatch(updateCartItem({item_id: item.id, quantity: item.quantity+1}))} className="border px-3">+</button>
          </div>
        </div>
        <p>{line && quote ? formatCurrency(line.line_total, quote.currency) : <Price amount={item.line_total} />}</p>
        <button disabled={cart.loading} onClick={() => void dispatch(removeFromCart(item.id))} className="underline">Remove {name}</button>
      </article>;
    })}
    {cart.items.length > 0 && <>
      <form className="my-6 flex flex-wrap gap-3" onSubmit={event => {event.preventDefault(); void dispatch(applyVoucher(code.trim()));}}>
        <label>Voucher code<input value={code} onChange={event => setCode(event.target.value)} required maxLength={40} className="block border p-2" /></label>
        <button disabled={cart.loading} className="border px-4">Apply voucher</button>
      </form>
      {cart.voucher && <div className="my-4"><p>{cart.voucher.code}: {cart.voucher.valid ? 'Applied' : cart.voucher.error || 'Unavailable'}</p>
        <button disabled={cart.loading} onClick={() => void dispatch(applyVoucher(null))} className="underline">Remove voucher</button></div>}
      {cart.quoteError && <p role="alert">{cart.quoteError}</p>}
      {(cart.quoteLoading || cart.loading) && <p role="status">Updating your total…</p>}
      {quote ? <div className="border p-4 space-y-2" aria-label="Checkout quote">
        <p>Subtotal: {formatCurrency(quote.subtotal, quote.currency)}</p>
        <p>Voucher discount: −{formatCurrency(quote.discount_amount, quote.currency)}</p>
        <p>Shipping: {formatCurrency(quote.shipping_cost, quote.currency)}</p>
        <p className="font-bold">Total: {formatCurrency(quote.total, quote.currency)}</p>
        <p className="text-sm">Checkout recalculates current prices, availability and exchange rates.</p>
        {!unavailable && <Link href={`/checkout?currency=${quote.currency}`} className="inline-block bg-brand-ink text-brand-paper px-6 py-3">Proceed to checkout</Link>}
      </div> : <div><p>A current quote is required before checkout.</p><button className="underline" disabled={!currency.ready || cart.loading || cart.quoteLoading} onClick={() => void dispatch(fetchQuote(currency.selected))}>Refresh total</button></div>}
    </>}
  </section>;
}
