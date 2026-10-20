import { notFound } from 'next/navigation';
import { catalogue } from '../api/server';
import ProductDetailClient from '../components/ProductDetailClient';

export default async function ProductPage({params}: {params: Promise<{slug: string}>}) {
  const product = await catalogue.product((await params).slug);
  if (!product) notFound();
  return <ProductDetailClient key={product.id} product={product} />;
}
