'use client';

import { useEffect, useState } from 'react';
import { Link } from '@/i18n/navigation';
import apiClient from '@/lib/api/client';

interface Brand {
  id: number;
  name: string;
  slug: string;
  logo: string | null;          // absolute URL
  is_active: boolean;
  featured: boolean;
  description: string;
  website: string;
}

export default function AdminBrands() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBrands = async () => {
    try {
      const res = await apiClient.get('/api/admin/brands/');
      setBrands(res.data.results || res.data);
    } catch (err) {
      console.error('Failed to load brands', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBrands(); }, []);

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this brand?')) return;
    try {
      await apiClient.delete(`/api/admin/brands/${id}/`);
      setBrands((prev) => prev.filter((b) => b.id !== id));
    } catch (err) {
      alert('Delete failed');
    }
  };

  if (loading) return <p>Loading brands...</p>;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Brands</h1>
        <Link
          href="/admin/brands/new"
          className="bg-brand-ink text-brand-paper px-4 py-2 rounded hover:bg-brand-hover"
        >
          Add Brand
        </Link>
      </div>
      <table className="min-w-full bg-white border rounded">
        <thead>
          <tr className="bg-gray-100 text-left">
            <th className="p-2">Logo</th>
            <th className="p-2">Name</th>
            <th className="p-2">Slug</th>
            <th className="p-2">Featured</th>
            <th className="p-2">Active</th>
            <th className="p-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {brands.map((brand) => (
            <tr key={brand.id} className="border-t hover:bg-gray-50">
              <td className="p-2">
                {brand.logo ? (
                  <img src={brand.logo} alt="" className="w-10 h-10 object-contain rounded border" />
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </td>
              <td className="p-2">{brand.name}</td>
              <td className="p-2">{brand.slug}</td>
              <td className="p-2">{brand.featured ? '⭐' : ''}</td>
              <td className="p-2">{brand.is_active ? '✅' : '❌'}</td>
              <td className="p-2 space-x-2">
                <Link href={`/admin/brands/${brand.id}`} className="text-blue-600 underline">
                  Edit
                </Link>
                <button onClick={() => handleDelete(brand.id)} className="text-red-600 underline">
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
