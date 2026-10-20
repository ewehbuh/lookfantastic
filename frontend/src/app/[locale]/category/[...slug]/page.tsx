'use client';

import { useEffect, useState, use } from 'react';
import { useSearchParams } from 'next/navigation';
import ProductCard from '@/components/product/ProductCard';
import apiClient from '@/lib/api-client';

export default function CategoryPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const searchParams = useSearchParams();
  const { slug } = use(params);

  const [products, setProducts] = useState<any[]>([]);        // always an array
  const [facets, setFacets] = useState<any>({});               // always an object
  const [loading, setLoading] = useState(true);

  const categorySlug = slug?.join('/') || '';

  useEffect(() => {
    const fetchProducts = async () => {
      setLoading(true);
      const query = new URLSearchParams(searchParams.toString());
      if (categorySlug) query.set('category', categorySlug);
      try {
        const res = await apiClient.get(`/api/products/?${query.toString()}`);
        // Make sure we always use arrays / objects even if the API returns nothing
        setProducts(res.data.results || []);
        setFacets(res.data.facets || {});
      } catch (err) {
        console.error(err);
        // Keep empty state on error
        setProducts([]);
        setFacets({});
      } finally {
        setLoading(false);
      }
    };
    fetchProducts();
  }, [categorySlug, searchParams]);

  return (
    <div className="max-w-7xl mx-auto py-8 flex gap-8">
      {/* Faceted sidebar */}
      <aside className="w-64 hidden md:block">
        <h2 className="text-lg font-bold mb-4">Filters</h2>
        {facets.price_range && (
          <div className="mb-4">
            <p>
              Price: £{facets.price_range.min_price} – £{facets.price_range.max_price}
            </p>
          </div>
        )}
        {facets.brands && (
          <div>
            <h3 className="font-medium">Brands</h3>
            <ul>
              {facets.brands.map((b: any) => (
                <li key={b.brand__slug}>
                  {b.brand__name} ({b.count})
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>

      {/* Product grid */}
      <main className="flex-1">
        {loading ? (
          <p>Loading…</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}