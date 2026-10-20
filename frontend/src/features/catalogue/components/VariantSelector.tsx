import type { Variant } from '../types/catalogue';

export default function VariantSelector({variants, value, onSelect}: {
  variants: Variant[]; value: number | undefined; onSelect: (variant: Variant) => void;
}) {
  return <div className="mt-4">
    <label htmlFor="product-variant" className="text-sm font-medium">Size / Shade:</label>
    <select id="product-variant" value={value ?? ''} onChange={event => {
      const variant = variants.find(item => item.id === Number(event.target.value));
      if (variant) onSelect(variant);
    }} className="ml-2 border p-2">
      {variants.map(variant => <option key={variant.id} value={variant.id} disabled={variant.stock < 1}>
        {variant.size || variant.shade || variant.sku} – {variant.price}{variant.stock < 1 ? ' (out of stock)' : ''}
      </option>)}
    </select>
  </div>;
}
