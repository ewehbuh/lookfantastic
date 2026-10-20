'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import apiClient from '@/lib/api-client';

interface Category {
  id: number;
  name: string;
  slug: string;
  fullSlug: string;
  is_active: boolean;
  parent: number | null;
  children: Category[];
}

function CategoryRow({
  category,
  depth,
  onDelete,
}: {
  category: Category;
  depth: number;
  onDelete: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = category.children && category.children.length > 0;

  return (
    <div>
      <div className="flex items-center py-1 border-b hover:bg-gray-50" style={{ paddingLeft: depth * 20 }}>
        {hasChildren && (
          <button onClick={() => setExpanded(!expanded)} className="mr-2 w-4 text-center leading-none">
            {expanded ? '▼' : '▶'}
          </button>
        )}
        {!hasChildren && <span className="mr-2 w-4" />}
        <Link href={`/admin/categories/${category.id}`} className="flex-1 hover:underline">
          {category.name}
        </Link>
        <span className="text-xs text-gray-500 mr-4">{category.fullSlug}</span>
        <span className="text-xs mr-4">{category.is_active ? '✅' : '❌'}</span>
        <Link href={`/admin/categories/${category.id}`} className="text-blue-600 text-sm underline mr-2">
          Edit
        </Link>
        <button onClick={() => onDelete(category.id)} className="text-red-600 text-sm underline">
          Delete
        </button>
      </div>
      {expanded && hasChildren && (
        <div>
          {category.children.map((child) => (
            <CategoryRow key={child.id} category={child} depth={depth + 1} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminCategories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCategories = () => {
    apiClient
      .get('/api/admin/categories/')
      .then((res) => {
        const flat: any[] = res.data.results || res.data;

        const map = new Map<number, Category>();
        const roots: Category[] = [];

        // First pass: create nodes
        flat.forEach((cat: any) => {
          map.set(cat.id, {
            id: cat.id,
            name: cat.name,
            slug: cat.slug,
            fullSlug: cat.slug,
            is_active: cat.is_active,
            parent: cat.parent,
            children: [],
          });
        });

        // Second pass: assign children and compute full slug
        flat.forEach((cat: any) => {
          const node = map.get(cat.id)!;
          const parentId = cat.parent;

          if (parentId && map.has(parentId)) {
            const parent = map.get(parentId)!;
            parent.children.push(node);
            node.fullSlug = parent.fullSlug + '/' + node.slug;
          } else {
            roots.push(node);
          }
        });

        setCategories(roots);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this category? Child categories will become root nodes if they exist.')) return;
    try {
      await apiClient.delete(`/api/admin/categories/${id}/`);
      fetchCategories(); // refresh the tree
    } catch (err) {
      alert('Delete failed. Make sure the category is not referenced by products.');
    }
  };

  if (loading) return <p>Loading categories...</p>;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Categories</h1>
        <Link href="/admin/categories/new" className="bg-brand-ink text-brand-paper px-4 py-2 rounded hover:bg-brand-hover">
          Add Category
        </Link>
      </div>
      <div className="bg-white rounded border">
        {categories.map((cat) => (
          <CategoryRow key={cat.id} category={cat} depth={0} onDelete={handleDelete} />
        ))}
      </div>
    </div>
  );
}