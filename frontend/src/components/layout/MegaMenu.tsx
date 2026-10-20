'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import apiClient from '@/lib/api-client';

interface ApiCategory {
  id: number;
  name: string;
  slug: string;
  children: ApiCategory[];
}

interface SubItem {
  name: string;
  slug: string; // full path e.g. "skincare/moisturisers/day-creams"
}

interface Column {
  heading: string;
  headingSlug: string; // full path to this subcategory
  items: SubItem[];
}

interface MenuCategory {
  name: string;
  slug: string;
  columns: Column[];
}

export default function MegaMenu() {
  const [menuData, setMenuData] = useState<MenuCategory[]>([]);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get('/api/categories/')
      .then((res) => {
        const roots: ApiCategory[] = res.data;
        // Convert the nested tree into the menu format
        const menus: MenuCategory[] = roots.map((root) => {
          const columns: Column[] = root.children.map((child) => {
            // child is a second-level category (e.g. Moisturisers)
            const headingSlug = `${root.slug}/${child.slug}`; // e.g. skincare/moisturisers

            // items are third-level categories (e.g. Day Creams)
            const items: SubItem[] = (child.children || []).map((grandchild) => ({
              name: grandchild.name,
              slug: `${headingSlug}/${grandchild.slug}`, // e.g. skincare/moisturisers/day-creams
            }));

            return {
              heading: child.name,
              headingSlug,
              items,
            };
          });

          return {
            name: root.name,
            slug: root.slug,
            columns,
          };
        });

        setMenuData(menus);
      })
      .catch(console.error);
  }, []);

  return (
    <nav className="hidden md:flex space-x-6">
      {menuData.map((category) => (
        <div
          key={category.slug}
          className="relative"
          onMouseEnter={() => setActiveMenu(category.slug)}
          onMouseLeave={() => setActiveMenu(null)}
        >
          <Link
            href={`/category/${category.slug}`}
            className="py-2 px-3 text-sm font-medium hover:underline block"
          >
            {category.name}
          </Link>

          {activeMenu === category.slug && (
            <div className="absolute top-full left-0 bg-white text-black shadow-xl rounded-md p-6 w-max z-50">
              <div className="flex gap-8">
                {category.columns.map((column) => (
                  <div key={column.heading} className="min-w-[160px]">
                    <Link
                      href={`/category/${column.headingSlug}`}
                      className="block text-sm font-semibold border-b border-gray-400 pb-1 mb-2 hover:underline"
                    >
                      {column.heading}
                    </Link>
                    <ul className="space-y-1">
                      {column.items.length > 0 ? (
                        column.items.map((item) => (
                          <li key={item.slug}>
                            <Link
                              href={`/category/${item.slug}`}
                              className="text-sm text-gray-700 hover:text-black hover:underline"
                            >
                              {item.name}
                            </Link>
                          </li>
                        ))
                      ) : (
                        <li>
                          <Link
                            href={`/category/${column.headingSlug}`}
                            className="text-sm text-gray-700 hover:text-black hover:underline"
                          >
                            View all
                          </Link>
                        </li>
                      )}
                    </ul>
                  </div>
                ))}
              </div>
              <Link
                href={`/category/${category.slug}`}
                className="block mt-4 text-center text-xs font-bold text-gray-600 hover:underline"
              >
                Shop All {category.name}
              </Link>
            </div>
          )}
        </div>
      ))}

      {/* Always show these links even if menu is empty */}
      <Link href="/blog" className="py-2 px-3 text-sm font-medium hover:underline">
        The Edit
      </Link>
      <Link href="/subscriptions" className="py-2 px-3 text-sm font-medium hover:underline">
        Beauty Box
      </Link>
    </nav>
  );
}
