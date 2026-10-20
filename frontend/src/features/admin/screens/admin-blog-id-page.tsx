'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useParams } from 'next/navigation';
import apiClient from '@/lib/api/client';

interface ArticleForm {
  title: string;
  slug: string;
  category_id: string;
  excerpt: string;
  body: string;
  is_published: boolean;
  published_at: string;
  meta_title: string;
  meta_description: string;
}

export default function EditArticle() {
  const params = useParams();
  const articleId = params.id as string;
  const isNew = articleId === 'new';
  const router = useRouter();

  const [form, setForm] = useState<ArticleForm>({
    title: '',
    slug: '',
    category_id: '',
    excerpt: '',
    body: '',
    is_published: false,
    published_at: '',
    meta_title: '',
    meta_description: '',
  });
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isNew) {
      apiClient
        .get(`/api/admin/articles/${articleId}/`)
        .then((res) => {
          const data = res.data;
          setForm({
            title: data.title,
            slug: data.slug,
            category_id: data.category?.id?.toString() || '',
            excerpt: data.excerpt || '',
            body: data.body || '',
            is_published: data.is_published,
            published_at: data.published_at ? data.published_at.slice(0, 16) : '',
            meta_title: data.meta_title || '',
            meta_description: data.meta_description || '',
          });
        })
        .catch(() => alert('Failed to load article'))
        .finally(() => setLoading(false));
    }
  }, [isNew, articleId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        category_id: form.category_id ? Number(form.category_id) : null,
        published_at: form.published_at || null,
      };

      if (isNew) {
        await apiClient.post('/api/admin/articles/', payload);
      } else {
        await apiClient.patch(`/api/admin/articles/${articleId}/`, payload);
      }
      router.push('/admin/blog');
    } catch (err) {
      alert('Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p>Loading...</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">
        {isNew ? 'New Article' : 'Edit Article'}
      </h1>
      <form onSubmit={handleSubmit} className="max-w-2xl bg-white p-6 rounded shadow space-y-4">
        <input className="w-full border p-2" placeholder="Title" value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })} required />
        <input className="w-full border p-2" placeholder="Slug" value={form.slug}
          onChange={(e) => setForm({ ...form, slug: e.target.value })} required />
        <input className="w-full border p-2" placeholder="Category ID" type="number" value={form.category_id}
          onChange={(e) => setForm({ ...form, category_id: e.target.value })} />
        <textarea className="w-full border p-2" placeholder="Excerpt" value={form.excerpt}
          onChange={(e) => setForm({ ...form, excerpt: e.target.value })} />
        <textarea className="w-full border p-2" rows={8} placeholder="Body (HTML)" value={form.body}
          onChange={(e) => setForm({ ...form, body: e.target.value })} />
        <label className="flex items-center space-x-2">
          <input type="checkbox" checked={form.is_published}
            onChange={(e) => setForm({ ...form, is_published: e.target.checked })} />
          <span>Published</span>
        </label>
        <input className="w-full border p-2" type="datetime-local" value={form.published_at}
          onChange={(e) => setForm({ ...form, published_at: e.target.value })} />
        <input className="w-full border p-2" placeholder="Meta Title" value={form.meta_title}
          onChange={(e) => setForm({ ...form, meta_title: e.target.value })} />
        <input className="w-full border p-2" placeholder="Meta Description" value={form.meta_description}
          onChange={(e) => setForm({ ...form, meta_description: e.target.value })} />
        <button type="submit" disabled={saving}
          className="bg-brand-ink text-brand-paper px-4 py-2 rounded hover:bg-brand-hover">
          {saving ? 'Saving...' : 'Save'}
        </button>
      </form>
    </div>
  );
}
