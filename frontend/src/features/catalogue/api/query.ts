import type { CatalogueSearchParams } from '../types/catalogue';

export function catalogueQuery(input: CatalogueSearchParams, category?: string) {
  const query = new URLSearchParams();
  for (const key of ['brand', 'min_price', 'max_price', 'on_offer', 'ordering', 'page', 'search']) {
    const value = input[key];
    for (const entry of Array.isArray(value) ? value : value ? [value] : []) {
      if (entry.trim()) query.append(key, entry);
    }
  }
  if (category) query.set('category', category);
  return query;
}

export function pageHref(path: string, query: URLSearchParams, page: number) {
  const next = new URLSearchParams(query);
  next.set('page', String(page));
  return `${path}?${next}`;
}
