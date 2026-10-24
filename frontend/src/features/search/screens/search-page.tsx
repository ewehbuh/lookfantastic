import ProductListing from '@/features/catalogue/components/ProductListing';
import type { CatalogueSearchParams } from '@/features/catalogue/types/catalogue';
import SearchBox from '../components/SearchBox';
export default async function SearchPage({searchParams}: {searchParams: Promise<CatalogueSearchParams>}) {
  const params = await searchParams;
  const query = typeof params.q === 'string' ? params.q.trim().replace(/\s+/g, ' ') : '';
  if (!query || query.length > 200 || query.split(/\s+/).length > 10) return <section className="max-w-4xl mx-auto p-4 py-10"><h1 className="text-2xl font-bold mb-6">Search products</h1><p className="mb-4">Enter up to 200 characters and ten search terms.</p><SearchBox /></section>;
  return <ProductListing searchParams={params} searchTerm={query} />;
}
