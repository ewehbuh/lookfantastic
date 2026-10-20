import { Link } from '@/i18n/navigation';
import { catalogue } from '../api/server';
import { catalogueQuery, pageHref } from '../api/query';
import type { CatalogueSearchParams, ProductPage } from '../types/catalogue';
import ProductCard from './ProductCard';

export default async function ProductListing({searchParams, category}: {
  searchParams: CatalogueSearchParams; category?: string;
}) {
  const query = catalogueQuery(searchParams, category);
  const path = category ? `/category/${category}` : '/products';
  let data: ProductPage;
  try {
    data = await catalogue.products(query);
  } catch {
    return <section className="max-w-7xl mx-auto p-8">
      <h1 className="text-3xl font-bold">Products unavailable</h1>
      <p role="alert" className="my-4">We could not load these products. Check your filters or try again shortly.</p>
      <Link href={path} className="underline">Reset filters and try again</Link>
    </section>;
  }
  const page = Math.max(1, Number(query.get('page')) || 1);
  return <section className="max-w-7xl mx-auto px-4 py-8">
    <h1 className="text-3xl font-bold capitalize">{category ? category.split('/').at(-1)?.replaceAll('-', ' ') : 'All products'}</h1>
    <p className="my-4" role="status">{data.count} products</p>
    <form className="flex flex-wrap items-end gap-4 border-y py-4 mb-8">
      {query.getAll('brand').slice(1).map(brand => <input key={brand} type="hidden" name="brand" value={brand} />)}
      <label>Search<input className="block border p-2" name="search" defaultValue={query.get('search') ?? ''} /></label>
      <label>Brand<select className="block border p-2" name="brand" defaultValue={query.get('brand') ?? ''}>
        <option value="">All brands</option>
        {query.get('brand') && !data.facets.brands.some(brand => brand.brand__slug === query.get('brand')) && <option value={query.get('brand')!}>{query.get('brand')}</option>}
        {data.facets.brands.map(brand => <option key={brand.brand__slug} value={brand.brand__slug}>{brand.brand__name} ({brand.count})</option>)}
      </select></label>
      <label>Minimum price<input className="block border p-2 w-32" name="min_price" type="number" min="0" step="0.01" defaultValue={query.get('min_price') ?? ''} /></label>
      <label>Maximum price<input className="block border p-2 w-32" name="max_price" type="number" min="0" step="0.01" defaultValue={query.get('max_price') ?? ''} /></label>
      <label>Sort<select className="block border p-2" name="ordering" defaultValue={query.get('ordering') ?? '-created_at'}>
        <option value="-created_at">Newest first</option><option value="price">Price: low to high</option>
        <option value="-price">Price: high to low</option><option value="name">Name</option>
      </select></label>
      <label><input type="checkbox" name="on_offer" value="true" defaultChecked={query.get('on_offer') === 'true'} /> Offers only</label>
      <button className="bg-brand-ink text-brand-paper px-4 py-2">Apply filters</button>
      <Link href={path} className="underline">Clear filters</Link>
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
