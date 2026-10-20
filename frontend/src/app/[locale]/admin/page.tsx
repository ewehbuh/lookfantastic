'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import apiClient from '@/lib/api-client';

interface Stats {
  products: number;
  users: number;
  categories: number;
  brands: number;
  articles: number;
  plans: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats>({
    products: 0,
    users: 0,
    categories: 0,
    brands: 0,
    articles: 0,
    plans: 0,
  });
  const [statsLoaded, setStatsLoaded] = useState(false);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [productsRes, usersRes, categoriesRes, brandsRes, articlesRes, plansRes] =
          await Promise.all([
            apiClient.get('/api/admin/products/').catch(() => ({ data: { count: 0 } })),
            apiClient.get('/api/accounts/admin/users/').catch(() => ({ data: { count: 0 } })),
            apiClient.get('/api/admin/categories/').catch(() => ({ data: { count: 0 } })),
            apiClient.get('/api/admin/brands/').catch(() => ({ data: { count: 0 } })),
            apiClient.get('/api/admin/articles/').catch(() => ({ data: { count: 0 } })),
            apiClient.get('/api/admin/plans/').catch(() => ({ data: { count: 0 } })),
          ]);

        setStats({
          products: productsRes.data.count ?? productsRes.data.length ?? 0,
          users: usersRes.data.count ?? usersRes.data.length ?? 0,
          categories: categoriesRes.data.count ?? categoriesRes.data.length ?? 0,
          brands: brandsRes.data.count ?? brandsRes.data.length ?? 0,
          articles: articlesRes.data.count ?? articlesRes.data.length ?? 0,
          plans: plansRes.data.count ?? plansRes.data.length ?? 0,
        });
      } catch (err) {
        console.error('Failed to load dashboard stats', err);
      } finally {
        setStatsLoaded(true);
      }
    };

    fetchStats();
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Admin Dashboard</h1>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-10">
        <StatCard label="Products" value={stats.products} loaded={statsLoaded} />
        <StatCard label="Users" value={stats.users} loaded={statsLoaded} />
        <StatCard label="Categories" value={stats.categories} loaded={statsLoaded} />
        <StatCard label="Brands" value={stats.brands} loaded={statsLoaded} />
        <StatCard label="Articles" value={stats.articles} loaded={statsLoaded} />
        <StatCard label="Plans" value={stats.plans} loaded={statsLoaded} />
      </div>

      {/* Management Sections */}
      <h2 className="text-lg font-semibold mb-4">Management</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <DashboardCard
          href="/admin/users"
          emoji="👥"
          title="User Management"
          description="View and edit user accounts, set roles, ban users."
        />
        <DashboardCard
          href="/admin/products"
          emoji="📦"
          title="Products"
          description="Manage products, variants, images and offers."
        />
        <DashboardCard
          href="/admin/categories"
          emoji="📁"
          title="Categories"
          description="Build and organise the category tree."
        />
        <DashboardCard
          href="/admin/brands"
          emoji="🏷️"
          title="Brands"
          description="Add / edit brands and logos."
        />
        <DashboardCard
          href="/admin/blog"
          emoji="✍️"
          title="Blog Articles"
          description="Write and publish editorial content."
        />
        <DashboardCard
          href="/admin/subscriptions"
          emoji="📬"
          title="Subscription Plans"
          description="Manage Beauty Box plans and pricing."
        />
        <DashboardCard
          href="/admin/offers"
          emoji="🎁"
          title="Offers"
          description="Create discounts and promotions."
        />
      </div>
    </div>
  );
}

// Small reusable stat card
function StatCard({
  label,
  value,
  loaded,
}: {
  label: string;
  value: number;
  loaded: boolean;
}) {
  return (
    <div className="bg-white border rounded-lg p-4 shadow-sm">
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-bold">
        {loaded ? value : '—'}
      </p>
    </div>
  );
}

// Reusable management card
function DashboardCard({
  href,
  emoji,
  title,
  description,
}: {
  href: string;
  emoji: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="border p-5 rounded-lg hover:shadow-md transition flex gap-4 items-start"
    >
      <span className="text-2xl">{emoji}</span>
      <div>
        <h2 className="font-semibold">{title}</h2>
        <p className="text-sm text-gray-600 mt-1">{description}</p>
      </div>
    </Link>
  );
}