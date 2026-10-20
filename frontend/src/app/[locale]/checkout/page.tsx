'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppSelector } from '@/store/hooks';
import apiClient from '@/lib/api-client';
import { formatCurrency } from '@/lib/utils';

export default function CheckoutPage() {
  const { totalPrice } = useAppSelector((s) => s.cart);
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [shipping, setShipping] = useState({
    name: '', address: '', city: '', postcode: '', country: 'UK',
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await apiClient.post('/api/cart/checkout/', {
        email,
        shipping_name: shipping.name,
        shipping_address: shipping.address,
        shipping_city: shipping.city,
        shipping_postcode: shipping.postcode,
        shipping_country: shipping.country,
      });
      router.push(`/checkout/success?order=${data.order_number}`);
    } catch (err) {
      console.error(err);
      alert('Checkout failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-10">
      <h1 className="text-2xl font-bold mb-6">Checkout</h1>
      <p className="mb-4">Total: {formatCurrency(totalPrice)}</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input className="w-full border p-2" placeholder="Email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="w-full border p-2" placeholder="Full Name" required value={shipping.name} onChange={(e) => setShipping({ ...shipping, name: e.target.value })} />
        <input className="w-full border p-2" placeholder="Address" required value={shipping.address} onChange={(e) => setShipping({ ...shipping, address: e.target.value })} />
        <input className="w-full border p-2" placeholder="City" required value={shipping.city} onChange={(e) => setShipping({ ...shipping, city: e.target.value })} />
        <input className="w-full border p-2" placeholder="Postcode" required value={shipping.postcode} onChange={(e) => setShipping({ ...shipping, postcode: e.target.value })} />
        <button type="submit" disabled={loading} className="bg-brand-ink text-brand-paper px-8 py-3 rounded">
          {loading ? 'Processing...' : 'Place Order'}
        </button>
      </form>
    </div>
  );
}
