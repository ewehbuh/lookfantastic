'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import apiClient from '@/lib/api-client';

interface Plan {
  id: number;
  name: string;
  slug: string;
  price: string;
  interval: string;
  is_active: boolean;
}

export default function AdminPlans() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPlans = async () => {
    try {
      const res = await apiClient.get('/api/admin/plans/');
      setPlans(res.data.results || res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this plan?')) return;
    try {
      await apiClient.delete(`/api/admin/plans/${id}/`);
      setPlans((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      alert('Delete failed');
    }
  };

  if (loading) return <p>Loading plans...</p>;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Subscription Plans</h1>
        <Link href="/admin/subscriptions/new" className="bg-brand-ink text-brand-paper px-4 py-2 rounded">
          Add Plan
        </Link>
      </div>
      <table className="min-w-full bg-white border rounded">
        <thead>
          <tr className="bg-gray-100 text-left">
            <th className="p-2">Name</th>
            <th className="p-2">Price</th>
            <th className="p-2">Interval</th>
            <th className="p-2">Active</th>
            <th className="p-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {plans.map((plan) => (
            <tr key={plan.id} className="border-t">
              <td className="p-2">{plan.name}</td>
              <td className="p-2">{plan.price}</td>
              <td className="p-2">{plan.interval}</td>
              <td className="p-2">{plan.is_active ? '✅' : '❌'}</td>
              <td className="p-2 space-x-2">
                <Link href={`/admin/subscriptions/${plan.id}`} className="text-blue-600 underline">Edit</Link>
                <button onClick={() => handleDelete(plan.id)} className="text-red-600 underline">Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
