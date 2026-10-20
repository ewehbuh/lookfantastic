'use client';

import { useEffect, useState } from 'react';
import apiClient from '@/lib/api-client';

interface Category {
  id: number;
  name: string;
  slug: string;
  children: Category[];
}

interface FlatCategory {
  id: number;
  name: string;
  depth: number;
}

function flattenCategories(categories: Category[], depth = 0): FlatCategory[] {
  let flat: FlatCategory[] = [];
  for (const cat of categories) {
    flat.push({ id: cat.id, name: cat.name, depth });
    if (cat.children && cat.children.length > 0) {
      flat = flat.concat(flattenCategories(cat.children, depth + 1));
    }
  }
  return flat;
}

export default function CategoryTreeSelect({
  value,
  onChange,
  admin = false,
  excludeId,
}: {
  value: string;
  onChange: (value: string) => void;
  admin?: boolean;
  excludeId?: number;
}) {
  const [categories, setCategories] = useState<FlatCategory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const url = admin ? '/api/admin/categories/' : '/api/categories/';
    apiClient
      .get(url)
      .then((res) => {
        // Extract the array – handle both paginated and non‑paginated responses
        const dataArray = Array.isArray(res.data)
          ? res.data
          : res.data.results || [];

        let flat: FlatCategory[] = [];

        if (admin) {
          // dataArray is a flat list of categories with 'parent' field
          const map = new Map<number, Category>();
          const roots: Category[] = [];

          // First pass: create nodes
          dataArray.forEach((cat: any) => {
            map.set(cat.id, { id: cat.id, name: cat.name, slug: cat.slug, children: [] });
          });

          // Second pass: assign children
          dataArray.forEach((cat: any) => {
            const node = map.get(cat.id)!;
            if (cat.parent && map.has(cat.parent)) {
              map.get(cat.parent)!.children.push(node);
            } else {
              roots.push(node);
            }
          });

          flat = flattenCategories(roots);
        } else {
          // dataArray is already nested (public endpoint)
          flat = flattenCategories(dataArray);
        }

        // Exclude the specified ID (e.g. when editing a category to avoid self‑parent)
        if (excludeId !== undefined) {
          flat = flat.filter((cat) => cat.id !== excludeId);
        }

        setCategories(flat);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [admin, excludeId]);

  if (loading) return <select disabled><option>Loading...</option></select>;

  return (
    <select
      className="w-full border p-2"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">-- None --</option>
      {categories.map((cat) => (
        <option key={cat.id} value={cat.id.toString()}>
          {'\u00A0\u00A0'.repeat(cat.depth)}{cat.name}
        </option>
      ))}
    </select>
  );
}
