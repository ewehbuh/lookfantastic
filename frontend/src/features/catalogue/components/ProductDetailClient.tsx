'use client';

import { useState } from 'react';
import { useAppDispatch } from '@/store/hooks';
import { addToCart } from '@/features/cart/state/cart-slice';
import VariantSelector from '@/features/catalogue/components/VariantSelector';
import type { ProductDetail } from '../types/catalogue';
import Price from '@/features/currency/components/Price';

export default function ProductDetailClient({ product }: { product: ProductDetail }) {
  const dispatch = useAppDispatch();
  const [selectedVariant, setSelectedVariant] = useState(
    product.variants.find(variant => variant.stock > 0) ?? product.default_variant ?? null
  );
  const [quantity, setQuantity] = useState(1);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [added, setAdded] = useState(false);

  // Image gallery state
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const images = product.images ?? [];

  const handleAdd = async () => {
    if (!selectedVariant || selectedVariant.stock < 1 || quantity > selectedVariant.stock) return;

    setAdding(true);
    setError('');
    setAdded(false);
    try {
      await dispatch(addToCart({ variant_id: selectedVariant.id, quantity })).unwrap();
      setAdded(true);

    } catch {
      setError('Unable to add this item. Check availability and try again.');
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
                {images.map((img, idx) => (
                  <button
                    key={img.id || idx}
                    aria-label={`Show image ${idx + 1}`}
                    aria-pressed={idx === activeImageIndex}
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
        <p className="text-2xl font-bold mt-2"><Price amount={selectedVariant?.price} /></p>

        {product.variants?.length > 1 && (
          <VariantSelector variants={product.variants} value={selectedVariant?.id} onSelect={variant => {setSelectedVariant(variant); setQuantity(1); setAdded(false); setError('');}} />
        )}

        {/* Quantity selector */}
        <div className="mt-4 flex items-center gap-2">
          <label htmlFor="product-quantity" className="text-sm">Qty:</label>
          <input
            id="product-quantity"
            type="number"
            max={selectedVariant?.stock || 1}
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(Math.min(selectedVariant?.stock || 1, Math.max(1, parseInt(e.target.value) || 1)))}
            className="w-16 border p-1 text-center rounded"
          />
        </div>

        {/* Add to cart button */}
        <button
          onClick={handleAdd}
          disabled={adding || !selectedVariant || selectedVariant.stock < 1}
          className={`mt-6 px-8 py-3 rounded text-brand-paper font-semibold transition
            ${added ? 'bg-green-600 hover:bg-green-600' : 'bg-brand-ink hover:bg-brand-hover'}
          `}
        >
          {!selectedVariant || selectedVariant.stock < 1 ? 'Out of stock' : adding ? 'Adding...' : added ? 'Added ✓' : 'Add to Cart'}
        </button>

        {error && <p role="alert" className="mt-3 text-red-700">{error}</p>}
        {added && <p role="status" className="mt-3">Item added to your basket.</p>}
        {product.offers.map(offer => <p key={offer.id} className="mt-3 border p-3">{offer.name} · Applied in your basket when eligible</p>)}
        <p className="mt-6">{product.review_count} reviews{product.rating_average !== null ? ` · ${product.rating_average.toFixed(1)} / 5` : ''}</p>
        <div className="mt-8 whitespace-pre-line">{product.description}</div>
        {product.how_to_use && <section className="mt-6"><h2 className="font-bold">How to use</h2><p className="whitespace-pre-line">{product.how_to_use}</p></section>}
        {product.ingredients && <section className="mt-6"><h2 className="font-bold">Ingredients</h2><p className="whitespace-pre-line">{product.ingredients}</p></section>}
      </div>
    </div>
  );
}
