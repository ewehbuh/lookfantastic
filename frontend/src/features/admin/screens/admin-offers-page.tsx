'use client';

import { useEffect, useState } from 'react';
import { Link } from '@/i18n/navigation';
import apiClient from '@/lib/api/client';

interface Offer {
  id: number;
  name: string;
  slug: string;
  offer_type: string;
  value: string;
  valid_from: string;
  valid_to: string;
  is_active: boolean;
}

export default function AdminOffers() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOffers = async () => {
    try {
      const res = await apiClient.get('/api/admin/offers/');
      setOffers(res.data.results || res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchOffers(); }, []);

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this offer?')) return;
    try {
      await apiClient.delete(`/api/admin/offers/${id}/`);
      setOffers((prev) => prev.filter((o) => o.id !== id));
    } catch (err) {
      alert('Delete failed');
    }
  };

  if (loading) return <p>Loading offers...</p>;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Offers</h1>
        <Link href="/admin/offers/new" className="bg-brand-ink text-brand-paper px-4 py-2 rounded">
          Add Offer
        </Link>
      </div>
      <table className="min-w-full bg-white border rounded">
        <thead>
          <tr className="bg-gray-100">
            <th className="p-2">Name</th>
            <th className="p-2">Type</th>
            <th className="p-2">Value</th>
            <th className="p-2">Active</th>
            <th className="p-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {offers.map((offer) => (
            <tr key={offer.id} className="border-t">
              <td className="p-2">{offer.name}</td>
              <td className="p-2">{offer.offer_type}</td>
              <td className="p-2">{offer.value}</td>
              <td className="p-2">{offer.is_active ? '✅' : '❌'}</td>
              <td className="p-2 space-x-2">
                <Link href={`/admin/offers/${offer.id}`} className="text-blue-600 underline">Edit</Link>
                <button onClick={() => handleDelete(offer.id)} className="text-red-600 underline">Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
