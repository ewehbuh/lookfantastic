import { Link } from '@/i18n/navigation';
import { fetchHomepage } from '@/features/home/api/homepage';
import ProductCard from '@/features/catalogue/components/ProductCard';

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
          The catalogue is temporarily unavailable. Please try again shortly.
        </p>
        <Link
          href="/products"
          className="inline-block bg-brand-ink text-brand-paper px-6 py-3 rounded hover:bg-brand-hover"
        >
          Browse products
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto py-10">
      <h1 className="text-3xl font-bold mb-8">Discover beauty</h1>
      {data.hero_categories.length > 0 && <nav aria-label="Shop by category" className="flex flex-wrap gap-4 mb-8">
        {data.hero_categories.map(category => <Link key={category.id} href={`/category/${category.slug}`} className="border px-4 py-3">{category.name}</Link>)}
      </nav>}
      {/* New In */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-4">New In</h2>
        {newIn.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {newIn.map((product) => (
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
            {bestsellers.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <p className="text-gray-500">Bestsellers will appear here after confirmed purchases.</p>
        )}
      </section>

      {/* Featured Brands */}
      <section>
        <h2 className="text-2xl font-bold mb-4">Featured Brands</h2>
        {featuredBrands.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
            {featuredBrands.map((brand) => (
              <Link
                key={brand.id}
                href={`/products?brand=${encodeURIComponent(brand.slug)}`}
                className="border p-4 rounded hover:shadow-md flex flex-col items-center justify-center text-center"
              >
                {brand.logo ? (
                  <img
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
