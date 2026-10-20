import ProductListing from '../components/ProductListing';
import type { CatalogueSearchParams } from '../types/catalogue';

export default async function ProductsPage({searchParams}: {searchParams: Promise<CatalogueSearchParams>}) {
  return <ProductListing searchParams={await searchParams} />;
}
