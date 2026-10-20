import apiClient from '@/lib/api/server';
import { notFound } from 'next/navigation';
import ProductCard from '@/features/catalogue/components/ProductCard';

async function getArticle(slug: string) {
  const res = await apiClient.get(`/api/blog/articles/?slug=${slug}`);
  return res.data.results?.[0] ?? null;
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const article = await getArticle((await params).slug);
  if (!article) notFound();

  const detail = await apiClient.get(`/api/blog/articles/${article.id}/`).then(r => r.data);

  return (
    <div className="max-w-3xl mx-auto py-10">
      <h1 className="text-3xl font-bold mb-4">{detail.title}</h1>
      <div className="text-gray-500 mb-6">{new Date(detail.published_at).toLocaleDateString()}</div>
      <div className="prose mb-10" dangerouslySetInnerHTML={{ __html: detail.body }} />
      {detail.related_products?.length > 0 && (
        <div>
          <h2 className="text-xl font-bold mb-4">Shop the Story</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {detail.related_products.map((p: any) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
