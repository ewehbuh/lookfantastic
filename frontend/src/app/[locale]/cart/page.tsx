'use client';

import { useEffect } from 'react';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { fetchCart, updateCartItem, removeFromCart } from '@/store/cartSlice';
import Link from 'next/link';
import { formatCurrency } from '@/lib/utils';

export default function CartPage() {
  const { items, totalPrice, totalItems, loading } = useAppSelector((s) => s.cart);
  const dispatch = useAppDispatch();

  useEffect(() => {
    dispatch(fetchCart());
  }, [dispatch]);

  // Show a loading skeleton
  if (loading) {
    return (
      <div className="max-w-4xl mx-auto py-10 animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-40 mb-6" />
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex justify-between border-b pb-4">
              <div className="space-y-2">
                <div className="h-4 bg-gray-200 rounded w-32" />
                <div className="h-3 bg-gray-200 rounded w-24" />
                <div className="h-8 bg-gray-200 rounded w-16" />
              </div>
              <div className="space-y-2 text-right">
                <div className="h-4 bg-gray-200 rounded w-20" />
                <div className="h-4 bg-gray-200 rounded w-16" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Empty cart view
  if (items.length === 0) {
    return (
      <div className="max-w-4xl mx-auto py-20 text-center">
        <h2 className="text-2xl font-bold mb-2">Your cart is empty</h2>
        <p className="text-gray-500 mb-6">Looks like you haven’t added anything yet.</p>
        <Link
          href="/category/skincare"
          className="inline-block bg-brand-ink text-brand-paper px-6 py-3 rounded hover:bg-brand-hover transition"
        >
          Continue Shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-10">
      <h1 className="text-2xl font-bold mb-6">Shopping Cart ({totalItems} items)</h1>

      <div className="space-y-4">
        {items.map((item: any) => (
          <div
            key={item.id}
            className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b pb-4 gap-4"
          >
            <div className="flex-1">
              <p className="font-medium text-lg">
                {item.variant?.product_name || item.variant?.sku || 'Product unavailable'}
              </p>
              {item.variant?.size && (
                <p className="text-sm text-gray-500">Size: {item.variant.size}</p>
              )}
              {item.variant?.shade && (
                <p className="text-sm text-gray-500">Shade: {item.variant.shade}</p>
              )}

              <div className="mt-2 flex items-center gap-2">
                <label htmlFor={`qty-${item.id}`} className="text-sm text-gray-600">
                  Qty:
                </label>
                <input
                  id={`qty-${item.id}`}
                  type="number"
                  min={1}
                  value={item.quantity}
                  onChange={(e) => {
                    const newQty = Math.max(1, parseInt(e.target.value) || 1);
                    dispatch(updateCartItem({ item_id: item.id, quantity: newQty }));
                  }}
                  className="w-16 border rounded px-2 py-1 text-center text-sm"
                />
              </div>
            </div>

            <div className="flex items-center gap-6">
              <p className="text-lg font-semibold whitespace-nowrap">
                {formatCurrency(item.line_total)}
              </p>
              <button
                onClick={() => dispatch(removeFromCart(item.id))}
                className="text-red-500 hover:text-red-700 text-sm font-medium transition"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 border-t pt-6 flex flex-col sm:flex-row justify-between items-end sm:items-center gap-4">
        <p className="text-sm text-gray-500">
          Shipping & taxes calculated at checkout
        </p>
        <div className="text-right">
          <p className="text-lg text-gray-600">Subtotal</p>
          <p className="text-3xl font-bold">{formatCurrency(totalPrice)}</p>
          <Link
            href="/checkout"
            className="mt-4 inline-block bg-brand-ink text-brand-paper px-8 py-3 rounded-md hover:bg-brand-hover transition"
          >
            Proceed to Checkout
          </Link>
        </div>
      </div>
    </div>
  );
}