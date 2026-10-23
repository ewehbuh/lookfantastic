import OrderStatus from '../components/OrderStatus';
export default async function AccountOrderPage({params}: {params: Promise<{number: string}>}) {
  return <section className="max-w-3xl mx-auto p-4 py-10"><h1 className="text-2xl font-bold mb-6">Order details</h1><OrderStatus number={(await params).number} /></section>;
}
