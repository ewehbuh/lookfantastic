import ProductListing from '../components/ProductListing';
import type { CatalogueSearchParams } from '../types/catalogue';

export default async function CategoryPage({params, searchParams}: {
  params: Promise<{slug: string[]}>; searchParams: Promise<CatalogueSearchParams>;
}) {
  return <ProductListing category={(await params).slug.join('/')} searchParams={await searchParams} />;
}
