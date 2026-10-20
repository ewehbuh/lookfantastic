'use client';

import { useEffect, useState } from 'react';
import { Link } from '@/i18n/navigation';
import apiClient from '@/lib/api/client';

interface Product {
  id: number;
  name: string;
  slug: string;
  brand_name: string;
  category_name: string;
  price: string;
  is_active: boolean;
}

export default function AdminProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProducts = async () => {
    try {
      const res = await apiClient.get('/api/admin/products/');
      setProducts(res.data.results || res.data);
    } catch (err) {
      console.error('Failed to load products', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this product?')) return;
    try {
      await apiClient.delete(`/api/admin/products/${id}/`);
      setProducts((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      alert('Delete failed');
    }
  };

  if (loading) return <p>Loading products...</p>;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Products</h1>
        <Link
          href="/admin/products/new"
          className="bg-brand-ink text-brand-paper px-4 py-2 rounded hover:bg-brand-hover"
        >
          Add Product
        </Link>
      </div>
      <table className="min-w-full bg-white border rounded">
        <thead>
          <tr className="bg-gray-100 text-left">
            <th className="p-2">Name</th>
            <th className="p-2">Brand</th>
            <th className="p-2">Category</th>
            <th className="p-2">Price</th>
            <th className="p-2">Active</th>
            <th className="p-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {products.map((product) => (
            <tr key={product.id} className="border-t hover:bg-gray-50">
              <td className="p-2">{product.name}</td>
              <td className="p-2">{product.brand_name}</td>
              <td className="p-2">{product.category_name}</td>
              <td className="p-2">{product.price}</td>
              <td className="p-2">{product.is_active ? '✅' : '❌'}</td>
              <td className="p-2 space-x-2">
                <Link href={`/admin/products/${product.id}`} className="text-blue-600 underline">
                  Edit
                </Link>
                <button onClick={() => handleDelete(product.id)} className="text-red-600 underline">
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
