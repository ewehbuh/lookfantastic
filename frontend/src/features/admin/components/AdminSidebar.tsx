import { Link } from '@/i18n/navigation';

export default function AdminSidebar() {
  return (
    <aside className="w-64 bg-gray-900 text-brand-paper min-h-screen p-4">
      <h2 className="text-xl font-bold mb-6">Admin Panel</h2>
      <nav className="space-y-2">
        <Link href="/admin" className="block py-1 px-2 hover:bg-gray-700 rounded">
          Dashboard
        </Link>
        <Link href="/admin/users" className="block py-1 px-2 hover:bg-gray-700 rounded">
          Users
        </Link>
        <Link href="/admin/products" className="block py-1 px-2 hover:bg-gray-700 rounded">
          Products
        </Link>
        <Link href="/admin/categories" className="block py-1 px-2 hover:bg-gray-700 rounded">
          Categories
        </Link>
        <Link href="/admin/brands" className="block py-1 px-2 hover:bg-gray-700 rounded">
          Brands
        </Link>
        <Link href="/admin/blog" className="block py-1 px-2 hover:bg-gray-700 rounded">
          Blog Articles
        </Link>
        <Link href="/admin/subscriptions" className="block py-1 px-2 hover:bg-gray-700 rounded">
          Subscription Plans
        </Link>
        <Link href="/admin/offers" className="block py-1 px-2 hover:bg-gray-700 rounded">
  Offers
</Link>
      </nav>
    </aside>
  );
}
