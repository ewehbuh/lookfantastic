'use client';

import { useEffect, useState, use } from 'react';
import { useRouter, useParams } from 'next/navigation';
import apiClient from '@/lib/api-client';
import SearchableMultiSelect from '@/components/admin/SearchableMultiSelect';

interface OfferForm {
  name: string;
  slug: string;
  offer_type: string;
  value: string;
  valid_from: string;
  valid_to: string;
  is_active: boolean;
  products: number[];
  categories: number[];
  brands: number[];
}

interface Option {
  id: number;
  name: string;
}

export default function EditOffer() {
  const params = useParams();
  const offerId = params.id as string;
  const isNew = offerId === 'new';
  const router = useRouter();

  const [form, setForm] = useState<OfferForm>({
    name: '',
    slug: '',
    offer_type: 'percentage',
    value: '',
    valid_from: '',
    valid_to: '',
    is_active: true,
    products: [],
    categories: [],
    brands: [],
  });

  const [productOptions, setProductOptions] = useState<Option[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<Option[]>([]);
  const [brandOptions, setBrandOptions] = useState<Option[]>([]);

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Load options
  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const [pRes, cRes, bRes] = await Promise.all([
          apiClient.get('/api/products/'),
          apiClient.get('/api/admin/categories/'),
          apiClient.get('/api/admin/brands/'),
        ]);
        setProductOptions((pRes.data.results || pRes.data).map((p: any) => ({ id: p.id, name: p.name })));
        setCategoryOptions((cRes.data.results || cRes.data).map((c: any) => ({ id: c.id, name: c.name })));
        setBrandOptions((bRes.data.results || bRes.data).map((b: any) => ({ id: b.id, name: b.name })));
      } catch (err) {
        console.error(err);
      }
    };
    fetchOptions();
  }, []);

  // Load offer data if editing
  useEffect(() => {
    if (!isNew) {
      apiClient
        .get(`/api/admin/offers/${offerId}/`)
        .then((res) => {
          const data = res.data;
          setForm({
            name: data.name,
            slug: data.slug,
            offer_type: data.offer_type,
            value: data.value.toString(),
            valid_from: data.valid_from ? data.valid_from.slice(0, 16) : '',
            valid_to: data.valid_to ? data.valid_to.slice(0, 16) : '',
            is_active: data.is_active,
            products: data.products?.map((p: any) => p.id) || [],
            categories: data.categories?.map((c: any) => c.id) || [],
            brands: data.brands?.map((b: any) => b.id) || [],
          });
        })
        .catch(() => setError('Failed to load offer'))
        .finally(() => setLoading(false));
    }
  }, [isNew, offerId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        value: parseFloat(form.value),
        valid_from: form.valid_from || null,
        valid_to: form.valid_to || null,
      };

      if (isNew) {
        await apiClient.post('/api/admin/offers/', payload);
      } else {
        await apiClient.patch(`/api/admin/offers/${offerId}/`, payload);
      }
      router.push('/admin/offers');
    } catch (err: any) {
      const data = err.response?.data;
      const msg = data?.detail || Object.values(data || {}).flat().join(', ') || 'Save failed';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p>Loading offer...</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">{isNew ? 'New Offer' : 'Edit Offer'}</h1>
      {error && <p className="text-red-600 mb-4">{error}</p>}
      <form onSubmit={handleSubmit} className="max-w-2xl bg-white p-6 rounded shadow space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <input className="border p-2" placeholder="Name" value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <input className="border p-2" placeholder="Slug" value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })} required />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <select className="border p-2" value={form.offer_type}
            onChange={(e) => setForm({ ...form, offer_type: e.target.value })}>
            <option value="percentage">Percentage off</option>
            <option value="fixed">Fixed amount off</option>
            <option value="buy_x_get_y">Buy X Get Y Free</option>
          </select>
          <input className="border p-2" type="number" step="0.01" placeholder="Value" value={form.value}
            onChange={(e) => setForm({ ...form, value: e.target.value })} required />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm mb-1">Valid From</label>
            <input className="border p-2 w-full" type="datetime-local" value={form.valid_from}
              onChange={(e) => setForm({ ...form, valid_from: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm mb-1">Valid To</label>
            <input className="border p-2 w-full" type="datetime-local" value={form.valid_to}
              onChange={(e) => setForm({ ...form, valid_to: e.target.value })} />
          </div>
        </div>

        {/* Products – searchable multi‑select */}
        <div>
          <label className="block text-sm font-medium mb-1">Apply to Products</label>
          <SearchableMultiSelect
            options={productOptions}
            selected={form.products}
            onChange={(selected) => setForm({ ...form, products: selected })}
            placeholder="Search products…"
          />
        </div>

        {/* Categories – searchable multi‑select */}
        <div>
          <label className="block text-sm font-medium mb-1">Apply to Categories</label>
          <SearchableMultiSelect
            options={categoryOptions}
            selected={form.categories}
            onChange={(selected) => setForm({ ...form, categories: selected })}
            placeholder="Search categories…"
          />
        </div>

        {/* Brands – searchable multi‑select */}
        <div>
          <label className="block text-sm font-medium mb-1">Apply to Brands</label>
          <SearchableMultiSelect
            options={brandOptions}
            selected={form.brands}
            onChange={(selected) => setForm({ ...form, brands: selected })}
            placeholder="Search brands…"
          />
        </div>

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