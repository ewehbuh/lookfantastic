'use client';

import { useState } from 'react';
import { useAppDispatch } from '@/store/hooks';
import { addToCart } from '@/store/cartSlice';
import VariantSelector from '@/components/product/VariantSelector';
import ProductReviews from '@/components/product/ProductReviews';
import { formatCurrency } from '@/lib/utils';

export default function ProductDetailClient({ product }: { product: any }) {
  const dispatch = useAppDispatch();
  const [selectedVariant, setSelectedVariant] = useState(
    product.default_variant ?? product.variants?.[0] ?? null
  );
  const [quantity, setQuantity] = useState(1);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);

  // Image gallery state
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const images = product.images ?? [];

  const handleAdd = async () => {
    if (!selectedVariant) return;

    setAdding(true);
    try {
      await dispatch(addToCart({ variant_id: selectedVariant.id, quantity })).unwrap();
      setAdded(true);
      setTimeout(() => setAdded(false), 2000);
    } catch (err) {
      console.error('Add to cart failed', err);
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto py-10 grid grid-cols-1 md:grid-cols-2 gap-10">
      {/* Image gallery */}
      <div>
        {images.length > 0 ? (
          <>
            {/* Main preview image */}
            <div className="aspect-square w-full overflow-hidden rounded-lg border bg-gray-50">
              <img
                src={images[activeImageIndex].image}
                alt={images[activeImageIndex].alt_text || product.name}
                className="w-full h-full object-cover"
              />
            </div>

            {/* Thumbnails row */}
            {images.length > 1 && (
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {images.map((img: any, idx: number) => (
                  <button
                    key={img.id || idx}
                    onClick={() => setActiveImageIndex(idx)}
                    className={`w-16 h-16 flex-shrink-0 border-2 rounded overflow-hidden transition
                      ${idx === activeImageIndex ? 'border-black' : 'border-transparent hover:border-gray-400'}
                    `}
                  >
                    <img
                      src={img.image}
                      alt={img.alt_text || `Image ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="aspect-square bg-gray-200 rounded-lg" />
        )}
      </div>

      {/* Product details */}
      <div>
        <p className="text-sm text-gray-500">{product.brand?.name}</p>
        <h1 className="text-3xl font-bold">{product.name}</h1>
        <p className="text-2xl font-bold mt-2">{formatCurrency(selectedVariant?.price)}</p>

        {product.variants?.length > 1 && (
          <VariantSelector variants={product.variants} onSelect={setSelectedVariant} />
        )}

        {/* Quantity selector */}
        <div className="mt-4 flex items-center gap-2">
          <label className="text-sm">Qty:</label>
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-16 border p-1 text-center rounded"
          />
        </div>

        {/* Add to cart button */}
        <button
          onClick={handleAdd}
          disabled={adding}
          className={`mt-6 px-8 py-3 rounded text-brand-paper font-semibold transition
            ${added ? 'bg-green-600 hover:bg-green-600' : 'bg-brand-ink hover:bg-brand-hover'}
          `}
        >
          {adding ? 'Adding...' : added ? 'Added ✓' : 'Add to Cart'}
        </button>

        <div className="mt-8 prose" dangerouslySetInnerHTML={{ __html: product.description }} />
        <ProductReviews productId={product.id} />
      </div>
    </div>
  );
}