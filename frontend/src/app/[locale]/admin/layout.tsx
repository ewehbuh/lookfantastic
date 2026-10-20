// import { redirect } from 'next/navigation';
// import { getServerSession } from 'next-auth'; // if using next‑auth, else use your own auth helper
// Alternative: fetch user from API on client side, but for layout we'll do a server check.
// Since we use simple JWT in Redux, we'll use a client component to guard.

import AdminGuard from '@/components/account/AdminGuard';
import AdminSidebar from './AdminSidebar';

export default function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  // We can't easily check auth on server without reading the cookie.
  // So we use a client component that checks Redux and redirects if not admin.
  return (
    <AdminGuard>
      <div className="min-h-screen flex">
        <AdminSidebar />
        <main className="flex-1 p-6 bg-gray-50">{children}</main>
      </div>
    </AdminGuard>
  );
}
