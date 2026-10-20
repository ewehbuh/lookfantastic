import apiClient from './api-client';

export async function fetchHomepage() {
  try {
    const res = await apiClient.get('/api/products/homepage/');
    // Check if the response has at least one non-empty section
    const data = res.data;
    if (
      data?.new_in?.length > 0 ||
      data?.bestsellers?.length > 0 ||
      data?.featured_brands?.length > 0
    ) {
      return data;
    }
    // Otherwise, fall through to fallback
  } catch {
    // Homepage endpoint not available – use fallback
  }

  // Fallback: fetch 8 recent products and use them as new_in
  try {
    const fallbackRes = await apiClient.get('/api/products/?ordering=-created_at&page_size=8');
    const products = fallbackRes.data.results || fallbackRes.data || [];
    return {
      new_in: products,
      bestsellers: [],
      featured_brands: [],
    };
  } catch {
    return null;
  }
}