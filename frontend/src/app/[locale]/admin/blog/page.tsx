'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import apiClient from '@/lib/api-client';

interface Article {
  id: number;
  title: string;
  slug: string;
  category_name: string;
  is_published: boolean;
  published_at: string | null;
}

export default function AdminBlogList() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchArticles = async () => {
    try {
      const res = await apiClient.get('/api/admin/articles/');
      setArticles(res.data.results || res.data);
    } catch (err) {
      console.error('Failed to load articles', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchArticles();
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this article?')) return;
    try {
      await apiClient.delete(`/api/admin/articles/${id}/`);
      setArticles((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      alert('Delete failed');
    }
  };

  if (loading) return <p>Loading articles...</p>;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Blog Articles</h1>
        <Link
          href="/admin/blog/new"
          className="bg-brand-ink text-brand-paper px-4 py-2 rounded hover:bg-brand-hover"
        >
          Add Article
        </Link>
      </div>
      <table className="min-w-full bg-white border rounded">
        <thead>
          <tr className="bg-gray-100 text-left">
            <th className="p-2">Title</th>
            <th className="p-2">Category</th>
            <th className="p-2">Published</th>
            <th className="p-2">Published At</th>
            <th className="p-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {articles.map((article) => (
            <tr key={article.id} className="border-t hover:bg-gray-50">
              <td className="p-2">{article.title}</td>
              <td className="p-2">{article.category_name || '—'}</td>
              <td className="p-2">{article.is_published ? '✅' : '❌'}</td>
              <td className="p-2">
                {article.published_at
                  ? new Date(article.published_at).toLocaleDateString()
                  : '—'}
              </td>
              <td className="p-2 space-x-2">
                <Link href={`/admin/blog/${article.id}`} className="text-blue-600 underline">
                  Edit
                </Link>
                <button onClick={() => handleDelete(article.id)} className="text-red-600 underline">
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