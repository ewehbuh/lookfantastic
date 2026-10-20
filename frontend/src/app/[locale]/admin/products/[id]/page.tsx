'use client';

import { useEffect, useState, use } from 'react';
import { useRouter, useParams } from 'next/navigation';
import apiClient from '@/lib/api-client';
import CategoryTreeSelect from '@/components/admin/CategoryTreeSelect';

interface VariantForm {
  id?: number;
  sku: string;
  size: string;
  shade: string;
  price: string;
  compare_at_price: string;
  stock: string;
  is_active: boolean;
}

interface ProductForm {
  name: string;
  slug: string;
  brand: string;
  category: string;
  description: string;
  how_to_use: string;
  ingredients: string;
  is_active: boolean;
  featured: boolean;          // ← new
  meta_title: string;
  meta_description: string;
  variants: VariantForm[];
  images: File[];
  existingImages: { id: number; image: string; alt_text: string }[];
}

interface BrandOption {
  id: number;
  name: string;
}

export default function EditProduct() {
  const params = useParams();
  const productId = params.id as string;
  const isNew = productId === 'new';
  const router = useRouter();

  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [form, setForm] = useState<ProductForm>({
    name: '',
    slug: '',
    brand: '',
    category: '',
    description: '',
    how_to_use: '',
    ingredients: '',
    is_active: true,
    featured: false,          // ← new
    meta_title: '',
    meta_description: '',
    variants: [
      {
        sku: '',
        size: '',
        shade: '',
        price: '',
        compare_at_price: '',
        stock: '0',
        is_active: true,
      },
    ],
    images: [],
    existingImages: [],
  });
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [removedImageIds, setRemovedImageIds] = useState<number[]>([]);

  // Fetch brands
  useEffect(() => {
    apiClient
      .get('/api/brands/')
      .then((res) => setBrands(res.data.results || res.data))
      .catch(console.error);
  }, []);

  // Load existing product data
  useEffect(() => {
    if (!isNew) {
      apiClient
        .get(`/api/admin/products/${productId}/`)
        .then((res) => {
          const data = res.data;
          setForm({
            name: data.name,
            slug: data.slug,
            brand: data.brand?.id?.toString() || '',
            category: data.category?.id?.toString() || '',
            description: data.description || '',
            how_to_use: data.how_to_use || '',
            ingredients: data.ingredients || '',
            is_active: data.is_active,
            featured: data.featured,          // ← load featured state
            meta_title: data.meta_title || '',
            meta_description: data.meta_description || '',
            variants:
              data.variants?.map((v: any) => ({
                id: v.id,
                sku: v.sku,
                size: v.size,
                shade: v.shade,
                price: v.price.toString(),
                compare_at_price: v.compare_at_price?.toString() || '',
                stock: v.stock.toString(),
                is_active: v.is_active,
              })) || [],
            images: [],
            existingImages:
              data.images?.map((img: any) => ({
                id: img.id,
                image: img.image,
                alt_text: img.alt_text,
              })) || [],
          });
        })
        .catch(() => setError('Failed to load product'))
        .finally(() => setLoading(false));
    }
  }, [isNew, productId]);

  // Variant helpers
  const addVariant = () => {
    setForm((prev) => ({
      ...prev,
      variants: [
        ...prev.variants,
        { sku: '', size: '', shade: '', price: '', compare_at_price: '', stock: '0', is_active: true },
      ],
    }));
  };

  const removeVariant = (index: number) => {
    setForm((prev) => ({
      ...prev,
      variants: prev.variants.filter((_, i) => i !== index),
    }));
  };

  const updateVariant = (index: number, field: keyof VariantForm, value: any) => {
    setForm((prev) => {
      const updated = [...prev.variants];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, variants: updated };
    });
  };

  // Image helpers
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setForm((prev) => ({
        ...prev,
        images: [...prev.images, ...Array.from(e.target.files!)],
      }));
    }
  };

  const removeNewImage = (index: number) => {
    setForm((prev) => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index),
    }));
  };

  const removeExistingImage = (imageId: number) => {
    setRemovedImageIds((prev) => [...prev, imageId]);
    setForm((prev) => ({
      ...prev,
      existingImages: prev.existingImages.filter((img) => img.id !== imageId),
    }));
  };

  // Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    if (!form.name || !form.slug) {
      setError('Name and slug are required.');
      setSaving(false);
      return;
    }
    if (!form.brand) {
      setError('Please select a brand.');
      setSaving(false);
      return;
    }

    try {
      // 1. Product payload
      const productPayload = {
        name: form.name,
        slug: form.slug,
        brand: parseInt(form.brand),
        category: form.category ? parseInt(form.category) : null,
        description: form.description,
        how_to_use: form.how_to_use,
        ingredients: form.ingredients,
        is_active: form.is_active,
        featured: form.featured,       // ← include featured
        meta_title: form.meta_title,
        meta_description: form.meta_description,
      };

      let productIdRes: number | null = isNew ? null : parseInt(productId);

      if (isNew) {
        const res = await apiClient.post('/api/admin/products/', productPayload);
        productIdRes = res.data.id;
      } else {
        await apiClient.patch(`/api/admin/products/${productId}/`, productPayload);
      }

      if (!productIdRes) {
        setError('Product creation failed. No ID returned.');
        setSaving(false);
        return;
      }

      // 2. Save variants
      const variantIdsToKeep: number[] = [];
      for (const variant of form.variants) {
        const variantPayload = {
          product: productIdRes,
          sku: variant.sku,
          size: variant.size,
          shade: variant.shade,
          price: parseFloat(variant.price),
          compare_at_price: variant.compare_at_price ? parseFloat(variant.compare_at_price) : null,
          stock: parseInt(variant.stock) || 0,
          is_active: variant.is_active,
        };

        if (variant.id) {
          await apiClient.patch(`/api/admin/variants/${variant.id}/`, variantPayload);
          variantIdsToKeep.push(variant.id);
        } else {
          const vRes = await apiClient.post('/api/admin/variants/', variantPayload);
          variantIdsToKeep.push(vRes.data.id);
        }
      }

      if (!isNew) {
        const existingVariants = (await apiClient.get(`/api/admin/variants/?product=${productIdRes}`)).data
          .results || [];
        for (const v of existingVariants) {
          if (!variantIdsToKeep.includes(v.id)) {
            await apiClient.delete(`/api/admin/variants/${v.id}/`);
          }
        }
      }

      // 3. Delete removed images
      if (removedImageIds.length > 0) {
        await Promise.all(
          removedImageIds.map((id) =>
            apiClient.delete(`/api/admin/images/${id}/`).catch((err) =>
              console.error('Failed to delete image', id, err)
            )
          )
        );
      }

      // 4. Upload new images
      if (form.images.length > 0 && productIdRes) {
        const uploadPromises = form.images.map((file, idx) => {
          const formData = new FormData();
          formData.append('product', productIdRes!.toString());
          formData.append('image', file);
          formData.append('alt_text', file.name);
          formData.append('order', idx.toString());
          return apiClient.post('/api/admin/images/', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
        });
        await Promise.all(uploadPromises);
      }

      router.push('/admin/products');
    } catch (err: any) {
      const data = err.response?.data;
      const message =
        data?.name?.[0] ||
        data?.slug?.[0] ||
        data?.brand?.[0] ||
        data?.detail ||
        'Save failed. Please check your input.';
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="p-6">Loading product...</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">{isNew ? 'New Product' : 'Edit Product'}</h1>

      {error && <p className="bg-red-100 text-red-700 p-3 rounded mb-4">{error}</p>}

      <form onSubmit={handleSubmit} className="max-w-3xl bg-white p-6 rounded shadow space-y-6">
        {/* Basic fields */}
        <div className="grid grid-cols-2 gap-4">
          <input className="border p-2" placeholder="Name" value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <input className="border p-2" placeholder="Slug" value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })} required />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Brand *</label>
            <select className="w-full border p-2" value={form.brand}
              onChange={(e) => setForm({ ...form, brand: e.target.value })} required>
              <option value="">-- Select Brand --</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id.toString()}>{b.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Category</label>
            <CategoryTreeSelect value={form.category}
              onChange={(val) => setForm({ ...form, category: val })} />
          </div>
        </div>

        <textarea className="w-full border p-2" rows={4} placeholder="Description" value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })} />

        <div className="grid grid-cols-2 gap-4">
          <textarea className="border p-2" placeholder="How to Use" value={form.how_to_use}
            onChange={(e) => setForm({ ...form, how_to_use: e.target.value })} />
          <textarea className="border p-2" placeholder="Ingredients" value={form.ingredients}
            onChange={(e) => setForm({ ...form, ingredients: e.target.value })} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <input className="border p-2" placeholder="Meta Title" value={form.meta_title}
            onChange={(e) => setForm({ ...form, meta_title: e.target.value })} />
          <input className="border p-2" placeholder="Meta Description" value={form.meta_description}
            onChange={(e) => setForm({ ...form, meta_description: e.target.value })} />
        </div>

        {/* Active & Featured checkboxes side by side */}
        <div className="flex gap-8">
          <label className="flex items-center space-x-2">
            <input type="checkbox" checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
            <span>Active</span>
          </label>
          <label className="flex items-center space-x-2">
            <input type="checkbox" checked={form.featured}
              onChange={(e) => setForm({ ...form, featured: e.target.checked })} />
            <span>⭐ Featured</span>
          </label>
        </div>

        {/* Variants */}
        <div>
          <h2 className="font-bold text-lg mb-2">Variants</h2>
          {form.variants.map((variant, idx) => (
            <div key={idx} className="border p-3 mb-3 rounded space-y-2">
              <div className="grid grid-cols-3 gap-2">
                <input className="border p-1" placeholder="SKU" value={variant.sku}
                  onChange={(e) => updateVariant(idx, 'sku', e.target.value)} required />
                <input className="border p-1" placeholder="Size" value={variant.size}
                  onChange={(e) => updateVariant(idx, 'size', e.target.value)} />
                <input className="border p-1" placeholder="Shade" value={variant.shade}
                  onChange={(e) => updateVariant(idx, 'shade', e.target.value)} />
                <input className="border p-1" type="number" step="0.01" placeholder="Price" value={variant.price}
                  onChange={(e) => updateVariant(idx, 'price', e.target.value)} required />
                <input className="border p-1" type="number" step="0.01" placeholder="Compare at price"
                  value={variant.compare_at_price}
                  onChange={(e) => updateVariant(idx, 'compare_at_price', e.target.value)} />
                <input className="border p-1" type="number" placeholder="Stock" value={variant.stock}
                  onChange={(e) => updateVariant(idx, 'stock', e.target.value)} />
              </div>
              <label className="flex items-center space-x-2">
                <input type="checkbox" checked={variant.is_active}
                  onChange={(e) => updateVariant(idx, 'is_active', e.target.checked)} />
                <span>Active</span>
              </label>
              <button type="button" onClick={() => removeVariant(idx)}
                className="text-red-600 text-sm">Remove variant</button>
            </div>
          ))}
          <button type="button" onClick={addVariant}
            className="bg-gray-200 px-3 py-1 rounded">+ Add variant</button>
        </div>

        {/* Images */}
        <div>
          <h2 className="font-bold text-lg mb-2">Images</h2>
          {form.existingImages.length > 0 && (
            <div className="flex gap-2 mb-2 flex-wrap">
              {form.existingImages.map((img) => (
                <div key={img.id} className="relative w-24 h-24 border">
                  <img src={img.image} alt="" className="w-full h-full object-cover" />
                  <button type="button" onClick={() => removeExistingImage(img.id)}
                    className="absolute top-0 right-0 bg-red-500 text-brand-paper text-xs p-1">X</button>
                </div>
              ))}
            </div>
          )}
          {form.images.map((file, idx) => (
            <div key={idx} className="flex items-center gap-2 mb-1">
              <span className="text-sm">{file.name}</span>
              <button type="button" onClick={() => removeNewImage(idx)} className="text-red-600 text-xs">Remove</button>
            </div>
          ))}
          <input type="file" multiple onChange={handleImageChange} className="mt-2" />
        </div>

        <button type="submit" disabled={saving}
          className="bg-brand-ink text-brand-paper px-6 py-2 rounded hover:bg-brand-hover">
          {saving ? 'Saving...' : 'Save Product'}
        </button>
      </form>
    </div>
  );
}