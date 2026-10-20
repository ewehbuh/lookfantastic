import { Link } from '@/i18n/navigation';

export default function ProductNotFound() {
  return <section className="max-w-7xl mx-auto p-8"><h1 className="text-2xl font-bold">Product not found</h1>
    <Link href="/products" className="underline">Browse products</Link>
  </section>;
}
