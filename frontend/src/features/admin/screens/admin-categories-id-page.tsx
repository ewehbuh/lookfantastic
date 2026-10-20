'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useParams } from 'next/navigation';
import apiClient from '@/lib/api/client';
import CategoryTreeSelect from '@/features/admin/components/CategoryTreeSelect';

interface CategoryForm {
  name: string;
  slug: string;
  description: string;
  parent_id: string;      // renamed to parent_id
  is_active: boolean;
}

export default function EditCategory() {
  const params = useParams();
  const categoryId = params.id as string;
  const isNew = categoryId === 'new';
  const router = useRouter();

  const [form, setForm] = useState<CategoryForm>({
    name: '',
    slug: '',
    description: '',
    parent_id: '',
    is_active: true,
  });
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isNew) {
      apiClient
        .get(`/api/admin/categories/${categoryId}/`)
        .then((res) => {
          const data = res.data;
          setForm({
            name: data.name,
            slug: data.slug,
            description: data.description || '',
            parent_id: data.parent_id ? data.parent_id.toString() : '',
            is_active: data.is_active,
          });
        })
        .catch(() => setError('Failed to load category'))
        .finally(() => setLoading(false));
    }
  }, [isNew, categoryId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: form.name,
        slug: form.slug,
        description: form.description,
        parent_id: form.parent_id ? parseInt(form.parent_id) : null,
        is_active: form.is_active,
      };

      if (isNew) {
        await apiClient.post('/api/admin/categories/', payload);
      } else {
        await apiClient.patch(`/api/admin/categories/${categoryId}/`, payload);
      }
      router.push('/admin/categories');
    } catch (err: any) {
      const data = err.response?.data;
      const msg = data?.parent_id?.[0] || data?.detail || 'Save failed';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p>Loading category...</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">
        {isNew ? 'New Category' : 'Edit Category'}
      </h1>
      {error && <p className="text-red-600 mb-4">{error}</p>}
      <form onSubmit={handleSubmit} className="max-w-md bg-white p-6 rounded shadow space-y-4">
        <input
          className="w-full border p-2"
          placeholder="Name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
        <input
          className="w-full border p-2"
          placeholder="Slug"
          value={form.slug}
          onChange={(e) => setForm({ ...form, slug: e.target.value })}
          required
        />
        <textarea
          className="w-full border p-2"
          placeholder="Description"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
        <div>
          <label className="block text-sm font-medium mb-1">Parent Category</label>
          <CategoryTreeSelect
            value={form.parent_id}
            onChange={(val) => setForm({ ...form, parent_id: val })}
            admin
            excludeId={isNew ? undefined : parseInt(categoryId)}
          />
        </div>
        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
          />
          <span>Active</span>
        </label>
        <button
          type="submit"
          disabled={saving}
          className="bg-brand-ink text-brand-paper px-4 py-2 rounded hover:bg-brand-hover"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </form>
    </div>
  );
}
