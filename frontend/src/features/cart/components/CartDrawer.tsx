'use client';
import { useEffect, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { fetchCart, removeFromCart } from '../state/cart-slice';
import Price from '@/features/currency/components/Price';

export default function CartDrawer() {
  const {items, totalPrice, totalItems, loading, error} = useAppSelector(state => state.cart);
  const auth = useAppSelector(state => state.auth);
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  useEffect(() => {if (open && auth.initialized && !auth.loading) void dispatch(fetchCart());}, [open, auth.initialized, auth.loading, auth.user?.id, dispatch]);
  return <>
    <button aria-expanded={open} aria-controls="basket-drawer" onClick={() => setOpen(!open)} className="fixed bottom-4 right-4 z-40 bg-brand-ink text-brand-paper p-3 rounded-full">Basket ({totalItems})</button>
    {open && <aside id="basket-drawer" aria-label="Basket summary" className="fixed inset-y-0 right-0 w-80 max-w-full bg-brand-paper shadow-xl z-50 p-4 flex flex-col">
      <div className="flex justify-between"><h2 className="text-xl font-bold">Your basket</h2><button onClick={() => setOpen(false)} aria-label="Close basket">×</button></div>
      {error && <p role="alert">{error}</p>}{loading && <p role="status">Updating basket…</p>}
      <div className="flex-1 overflow-auto my-4">{items.map(item => <div key={item.id} className="border-b py-3">
        <p>{item.variant?.product_name || item.variant?.sku} × {item.quantity}</p><Price amount={item.line_total} />
        <button disabled={loading} onClick={() => void dispatch(removeFromCart(item.id))} className="ml-3 underline">Remove {item.variant?.product_name || item.variant?.sku}</button>
      </div>)}{!loading && !error && !items.length && <p>Your basket is empty.</p>}</div>
      <p>Indicative subtotal: <Price amount={totalPrice} /></p><p className="text-sm">Vouchers and shipping are confirmed in your basket.</p>
      <Link href="/cart" onClick={() => setOpen(false)} className="block text-center bg-brand-ink text-brand-paper p-3 mt-3">View basket and total</Link>
    </aside>}
  </>;
}
