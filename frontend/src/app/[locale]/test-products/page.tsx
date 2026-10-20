import apiClient from '@/lib/api-client';

export default async function TestProducts() {
  let products: any[] = [];
  try {
    const res = await apiClient.get('/api/products/');
    products = res.data.results || [];
  } catch (e) {
    return <p>Error fetching products</p>;
  }
  return (
    <div className="p-8">
      <h1 className="text-xl font-bold">All Products</h1>
      <ul>
        {products.map((p: any) => (
          <li key={p.id}>{p.name} – active: {String(p.is_active)}</li>
        ))}
      </ul>
    </div>
  );
}