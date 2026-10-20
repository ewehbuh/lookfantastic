import { notFound } from 'next/navigation';
import ProductDetailClient from './ProductDetailClient';
import apiClient from '@/lib/api-client';

async function getProduct(slug: string) {
  try {
    const res = await apiClient.get(`/api/products/?slug=${slug}`);
    if (res.data.results && res.data.results.length > 0) {
      return res.data.results[0];
    }
    return null;
  } catch {
    return null;
  }
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  // Unwrap the Promise to get the actual slug
  const { slug } = await params;

  const product = await getProduct(slug);
  if (!product) notFound();

  // Fetch full details using the product id
  const res = await apiClient.get(`/api/products/${product.id}/`);
  return <ProductDetailClient product={res.data} />;
}
