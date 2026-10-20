'use client';

import { useEffect, useState, use } from 'react';
import { useRouter, useParams } from 'next/navigation';
import apiClient from '@/lib/api-client';

interface PlanForm {
  name: string;
  slug: string;
  description: string;
  features: string;
  price: string;
  interval: string;
  interval_count: string;
  is_active: boolean;
}

export default function EditPlan() {
  const params = useParams();
  const planId = params.id as string;
  const isNew = planId === 'new';
  const router = useRouter();

  const [form, setForm] = useState<PlanForm>({
    name: '',
    slug: '',
    description: '',
    features: '',
    price: '',
    interval: 'month',
    interval_count: '1',
    is_active: true,
  });
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isNew) {
      apiClient
        .get(`/api/admin/plans/${planId}/`)
        .then((res) => {
          const data = res.data;
          setForm({
            name: data.name,
            slug: data.slug,
            description: data.description || '',
            features: data.features || '',
            price: data.price,
            interval: data.interval,
            interval_count: data.interval_count?.toString() || '1',
            is_active: data.is_active,
          });
        })
        .catch(() => alert('Failed to load plan'))
        .finally(() => setLoading(false));
    }
  }, [isNew, planId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        price: parseFloat(form.price),
        interval_count: parseInt(form.interval_count),
      };
      if (isNew) {
        await apiClient.post('/api/admin/plans/', payload);
      } else {
        await apiClient.patch(`/api/admin/plans/${planId}/`, payload);
      }
      router.push('/admin/subscriptions');
    } catch (err) {
      alert('Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p>Loading...</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">{isNew ? 'New Plan' : 'Edit Plan'}</h1>
      <form onSubmit={handleSubmit} className="max-w-lg bg-white p-6 rounded shadow space-y-4">
        <input className="w-full border p-2" placeholder="Name" value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <input className="w-full border p-2" placeholder="Slug" value={form.slug}
          onChange={(e) => setForm({ ...form, slug: e.target.value })} required />
        <textarea className="w-full border p-2" placeholder="Description" value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <textarea className="w-full border p-2" placeholder="Features (HTML)" value={form.features}
          onChange={(e) => setForm({ ...form, features: e.target.value })} />
        <input className="w-full border p-2" placeholder="Price" type="number" step="0.01" value={form.price}
          onChange={(e) => setForm({ ...form, price: e.target.value })} required />
        <select className="w-full border p-2" value={form.interval}
          onChange={(e) => setForm({ ...form, interval: e.target.value })}>
          <option value="month">Monthly</option>
          <option value="quarter">Quarterly</option>
          <option value="year">Annual</option>
        </select>
        <input className="w-full border p-2" placeholder="Interval count (e.g. 1)" type="number" value={form.interval_count}
          onChange={(e) => setForm({ ...form, interval_count: e.target.value })} />
        <label className="flex items-center space-x-2">
          <input type="checkbox" checked={form.is_active}
            onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
          <span>Active</span>
        </label>
        <button type="submit" disabled={saving}
          className="bg-brand-ink text-brand-paper px-4 py-2 rounded hover:bg-brand-hover">
          {saving ? 'Saving...' : 'Save'}
        </button>
      </form>
    </div>
  );
}
