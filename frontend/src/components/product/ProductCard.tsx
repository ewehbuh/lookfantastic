import Link from 'next/link';
import { formatCurrency } from '@/lib/utils';

export default function ProductCard({ product }: { product: any }) {
  return (
    <Link href={`/product/${product.slug}`} className="group relative block">
      {/* Featured badge */}
      {product.featured && (
        <span className="absolute top-2 left-2 bg-brand-ink text-brand-paper text-xs font-bold px-2 py-1 rounded z-10">
          Featured
        </span>
      )}
      <div className="aspect-square bg-brand-surface mb-2">
        {product.image ? (
          <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400">No Image</div>
        )}
      </div>
      <h3 className="text-sm font-medium group-hover:underline">{product.name}</h3>
      <p className="text-sm text-brand-muted">{product.brand?.name}</p>
      <p className="text-sm font-bold">{formatCurrency(product.price)}</p>
    </Link>
  );
}