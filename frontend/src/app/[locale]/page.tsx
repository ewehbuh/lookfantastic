import Image from 'next/image';
import Link from 'next/link';
import { fetchHomepage } from '@/lib/api';
import ProductCard from '@/components/product/ProductCard';

export default async function HomePage() {
  const data = await fetchHomepage();
  const newIn = data?.new_in ?? [];
  const bestsellers = data?.bestsellers ?? [];
  const featuredBrands = data?.featured_brands ?? [];

  // If the backend is completely unreachable, show a minimal call‑to‑action
  if (!data) {
    return (
      <div className="max-w-7xl mx-auto py-20 text-center">
        <h1 className="text-3xl font-bold mb-4">Welcome to Lookfantastic</h1>
        <p className="text-gray-500 mb-6">
          Our catalogue is being prepared – browse our categories while you wait!
        </p>
        <Link
          href="/category/skincare"
          className="inline-block bg-brand-ink text-brand-paper px-6 py-3 rounded hover:bg-brand-hover"
        >
          Shop Skincare
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto py-10">
      {/* New In */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-4">New In</h2>
        {newIn.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {newIn.map((product: any) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <p className="text-gray-500">No new products yet. Check back soon!</p>
        )}
      </section>

      {/* Bestsellers */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-4">Bestsellers</h2>
        {bestsellers.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {bestsellers.map((product: any) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <p className="text-gray-500">Bestsellers will appear here once products are added.</p>
        )}
      </section>

      {/* Featured Brands */}
      <section>
        <h2 className="text-2xl font-bold mb-4">Featured Brands</h2>
        {featuredBrands.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
            {featuredBrands.map((brand: any) => (
              <Link
                key={brand.id}
                href={`/brands/${brand.slug}`}
                className="border p-4 rounded hover:shadow-md flex flex-col items-center justify-center text-center"
              >
                {brand.logo ? (
                  <Image
                    src={brand.logo}
                    alt={brand.name}
                    width={80}
                    height={40}
                    className="object-contain h-10 w-auto"
                  />
                ) : (
                  <span className="text-lg font-semibold text-gray-700">{brand.name}</span>
                )}
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-gray-500">No featured brands yet.</p>
        )}
      </section>
    </div>
  );
}
