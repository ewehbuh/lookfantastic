'use client';

import { useEffect, useState } from 'react';
import { Link } from '@/i18n/navigation';
import apiClient from '@/lib/api/client';

export default function BlogList() {
  const [articles, setArticles] = useState<any[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    apiClient
      .get('/api/blog/articles/')
      .then((res) => setArticles(res.data.results || []))
      .catch(() => setError(true));
  }, []);

  if (error) {
    return (
      <div className="max-w-4xl mx-auto py-20 text-center text-gray-500">
        <p>Unable to load articles. Please make sure the backend is running.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-10">
      <h1 className="text-2xl font-bold mb-6">The Edit</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {articles.map((article) => (
          <Link key={article.id} href={`/blog/${article.slug}`}>
            {/* ... */}
          </Link>
        ))}
      </div>
    </div>
  );
}
