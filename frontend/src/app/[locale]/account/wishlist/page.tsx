'use client';

import { useEffect, useState } from 'react';
import apiClient from '@/lib/api-client';
import ProductCard from '@/components/product/ProductCard';

export default function WishlistPage() {
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    apiClient.get('/api/accounts/wishlist/').then((res) => setItems(res.data));
  }, []);

  return (
    <div className="max-w-4xl mx-auto py-10">
      <h1 className="text-2xl font-bold mb-4">Wishlist</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {items.map((item: any) => (
          <ProductCard key={item.id} product={item.product} />
        ))}
      </div>
    </div>
  );
}