'use client';

import { useEffect, useState, use } from 'react';
import { useRouter, useParams } from 'next/navigation';
import apiClient from '@/lib/api-client';

interface BrandForm {
  name: string;
  slug: string;
  description: string;
  website: string;
  is_active: boolean;
  featured: boolean;
  logo: File | null;            // new file to upload
  existingLogo: string | null;  // current logo URL
}

export default function EditBrand() {
  const params = useParams();
  const brandId = params.id as string;
  const isNew = brandId === 'new';
  const router = useRouter();

  const [form, setForm] = useState<BrandForm>({
    name: '',
    slug: '',
    description: '',
    website: '',
    is_active: true,
    featured: false,
    logo: null,
    existingLogo: null,
  });
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<string | null>(null);   // for new logo preview

  useEffect(() => {
    if (!isNew) {
      apiClient
        .get(`/api/admin/brands/${brandId}/`)
        .then((res) => {
          const data = res.data;
          setForm({
            name: data.name,
            slug: data.slug,
            description: data.description || '',
            website: data.website || '',
            is_active: data.is_active,
            featured: data.featured,
            logo: null,
            existingLogo: data.logo,
          });
          if (data.logo) setPreview(data.logo);   // show existing logo
        })
        .catch(() => setError('Failed to load brand'))
        .finally(() => setLoading(false));
    }
  }, [isNew, brandId]);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setForm((prev) => ({ ...prev, logo: file }));
    if (file) {
      setPreview(URL.createObjectURL(file));
    } else {
      setPreview(form.existingLogo);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      // Use FormData to support file upload
      const formData = new FormData();
      formData.append('name', form.name);
      formData.append('slug', form.slug);
      formData.append('description', form.description);
      formData.append('website', form.website);
      formData.append('is_active', form.is_active ? 'true' : 'false');
      formData.append('featured', form.featured ? 'true' : 'false');
      if (form.logo) {
        formData.append('logo', form.logo);
      }

      if (isNew) {
        await apiClient.post('/api/admin/brands/', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      } else {
        await apiClient.patch(`/api/admin/brands/${brandId}/`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }
      router.push('/admin/brands');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p>Loading brand...</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">{isNew ? 'New Brand' : 'Edit Brand'}</h1>
      {error && <p className="text-red-600 mb-4">{error}</p>}
      <form onSubmit={handleSubmit} className="max-w-lg bg-white p-6 rounded shadow space-y-4">
        {/* Logo */}
        <div>
          <label className="block text-sm font-medium mb-1">Logo</label>
          {preview && (
            <img src={preview} alt="Preview" className="w-24 h-24 object-contain border rounded mb-2" />
          )}
          <input type="file" accept="image/*" onChange={handleLogoChange} />
          {form.existingLogo && !form.logo && (
            <p className="text-xs text-gray-500 mt-1">Current logo will be kept if no new file chosen.</p>
          )}
        </div>

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
        <input
          className="w-full border p-2"
          placeholder="Website URL"
          value={form.website}
          onChange={(e) => setForm({ ...form, website: e.target.value })}
        />
        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
          />
          <span>Active</span>
        </label>
        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={form.featured}
            onChange={(e) => setForm({ ...form, featured: e.target.checked })}
          />
          <span>Featured</span>
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
