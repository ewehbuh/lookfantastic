import { Link } from '@/i18n/navigation';
import { catalogue } from '../api/server';
import { catalogueQuery, pageHref } from '../api/query';
import type { CatalogueSearchParams, ProductPage, SearchResults } from '../types/catalogue';
import BaseCurrencyLabel from '@/features/currency/components/BaseCurrencyLabel';
import ProductCard from './ProductCard';

export default async function ProductListing({searchParams, category, searchTerm}: {
  searchParams: CatalogueSearchParams; category?: string; searchTerm?: string;
}) {
  const query = catalogueQuery(searchParams, category);
  if (searchTerm !== undefined) {
    query.delete('search'); query.set('q', searchTerm);
    if (searchParams.typo_correction === 'false') query.set('typo_correction', 'false');
  }
  const path = searchTerm !== undefined ? '/search' : category ? `/category/${category}` : '/products';
  const clear = searchTerm !== undefined ? `/search?q=${encodeURIComponent(searchTerm)}${query.get('typo_correction') === 'false' ? '&typo_correction=false' : ''}` : path;
  let data: ProductPage | SearchResults;
  try {
    data = searchTerm !== undefined ? await catalogue.search(query) : await catalogue.products(query);
  } catch {
    return <section className="max-w-7xl mx-auto p-8">
      <h1 className="text-3xl font-bold">Products unavailable</h1>
      <p role="alert" className="my-4">We could not load these products. Check your filters or try again shortly.</p>
      <Link href={clear} className="underline">Reset filters and try again</Link>
    </section>;
  }
  const correction = 'corrected_query' in data && typeof data.corrected_query === 'string' && 'correction_applied' in data && data.correction_applied === true ? data.corrected_query : null;
  const originalQuery = new URLSearchParams(query); originalQuery.set('typo_correction', 'false'); originalQuery.delete('page');
  const page = Math.max(1, Number(query.get('page')) || 1);
  return <section className="max-w-7xl mx-auto px-4 py-8">
    <h1 className="text-3xl font-bold capitalize">{searchTerm !== undefined ? `Search results for “${searchTerm}”` : category ? category.split('/').at(-1)?.replaceAll('-', ' ') : 'All products'}</h1>
    {correction && <p className="my-4">Showing results for “{correction}”. <Link className="underline" href={pageHref(path, originalQuery, 1)}>Search original wording</Link></p>}
    <p className="my-4" role="status">{data.count} products</p>
    <form className="flex flex-wrap items-end gap-4 border-y py-4 mb-8">
      {query.getAll('brand').slice(1).map(brand => <input key={brand} type="hidden" name="brand" value={brand} />)}
      {searchTerm !== undefined && query.get('typo_correction') === 'false' && <input type="hidden" name="typo_correction" value="false" />}
      <label>Search<input className="block border p-2" name={searchTerm !== undefined ? 'q' : 'search'} maxLength={200} defaultValue={searchTerm ?? query.get('search') ?? ''} /></label>
      <label>Brand<select className="block border p-2" name="brand" defaultValue={query.get('brand') ?? ''}>
        <option value="">All brands</option>
        {query.get('brand') && !data.facets.brands.some(brand => brand.brand__slug === query.get('brand')) && <option value={query.get('brand')!}>{query.get('brand')}</option>}
        {data.facets.brands.map(brand => <option key={brand.brand__slug} value={brand.brand__slug}>{brand.brand__name} ({brand.count})</option>)}
      </select></label>
      <label>Minimum price (<BaseCurrencyLabel />)<input className="block border p-2 w-32" name="min_price" type="number" min="0" step="0.01" defaultValue={query.get('min_price') ?? ''} /></label>
      <label>Maximum price (<BaseCurrencyLabel />)<input className="block border p-2 w-32" name="max_price" type="number" min="0" step="0.01" defaultValue={query.get('max_price') ?? ''} /></label>
      <label>Sort<select className="block border p-2" name="ordering" defaultValue={query.get('ordering') ?? (searchTerm !== undefined ? 'relevance' : '-created_at')}>
        {searchTerm !== undefined && <option value="relevance">Relevance</option>}
        <option value="-created_at">Newest first</option><option value="price">Price: low to high</option>
        <option value="-price">Price: high to low</option><option value="name">Name</option>
      </select></label>
      <label><input type="checkbox" name="on_offer" value="true" defaultChecked={query.get('on_offer') === 'true'} /> Offers only</label>
      <button className="bg-brand-ink text-brand-paper px-4 py-2">Apply filters</button>
      <Link href={clear} className="underline">Clear filters</Link>
    </form>
    {data.results.length ? <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
      {data.results.map(product => <ProductCard key={product.id} product={product} />)}
    </div> : <p>No products match these filters.</p>}
    <nav aria-label="Product pagination" className="flex justify-center items-center gap-6 mt-8">
      {data.previous && <Link href={pageHref(path, query, page-1)} className="underline">Previous</Link>}
      <span>Page {page}</span>
      {data.next && <Link href={pageHref(path, query, page+1)} className="underline">Next</Link>}
    </nav>
  </section>;
}
