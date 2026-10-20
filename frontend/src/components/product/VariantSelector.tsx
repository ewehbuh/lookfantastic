export default function VariantSelector({ variants, onSelect }: { variants: any[]; onSelect: (v: any) => void }) {
  return (
    <div className="mt-4">
      <label className="text-sm font-medium">Size / Shade:</label>
      <select
        onChange={(e) => onSelect(variants.find((v) => v.id === Number(e.target.value)))}
        className="ml-2 border p-1 rounded"
      >
        {variants.map((v) => (
          <option key={v.id} value={v.id}>
            {v.size || v.shade || v.sku} – {v.price}
          </option>
        ))}
      </select>
    </div>
  );
}