'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { fetchCart, removeFromCart, updateCartItem } from '@/store/cartSlice';
import { formatCurrency } from '@/lib/utils';

export default function CartDrawer() {
  const { items, totalPrice, totalItems } = useAppSelector((s) => s.cart);
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);

  // Fetch cart from backend whenever the drawer is opened
  useEffect(() => {
    if (open) {
      dispatch(fetchCart());
    }
  }, [open, dispatch]);

  return (
    <>
      {/* Floating button to toggle the drawer */}
      <div className="fixed bottom-4 right-4 z-50">
        <button
          onClick={() => setOpen(!open)}
          className="bg-brand-ink text-brand-paper p-3 rounded-full shadow-lg"
        >
          Cart ({totalItems})
        </button>
      </div>

      {open && (
        <div className="fixed inset-y-0 right-0 w-80 bg-white shadow-xl z-50 p-4 flex flex-col">
          <h2 className="text-xl font-bold mb-4">Your Cart</h2>

          <div className="flex-1 overflow-y-auto">
            {items.map((item: any) => (
              <div key={item.id} className="flex justify-between items-center mb-2">
                <span>
                  {item.variant?.product_name || item.variant?.sku} x {item.quantity}
                </span>
                <span>{formatCurrency(item.line_total)}</span>
                <button onClick={() => dispatch(removeFromCart(item.id))}>×</button>
              </div>
            ))}
            {items.length === 0 && <p className="text-gray-500">Cart is empty.</p>}
          </div>

          <div className="border-t pt-4">
            <p className="font-bold">Total: {formatCurrency(totalPrice)}</p>
            <Link
              href="/cart"
              className="block text-center bg-brand-ink text-brand-paper py-2 mt-2 rounded"
              onClick={() => setOpen(false)}
            >
              View Cart
            </Link>
            <Link
              href="/checkout"
              className="block text-center border border-black py-2 mt-2 rounded"
              onClick={() => setOpen(false)}
            >
              Checkout
            </Link>
          </div>
        </div>
      )}
    </>
  );
}