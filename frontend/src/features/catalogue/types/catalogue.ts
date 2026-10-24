export interface Brand { id: number; name: string; slug: string; logo: string | null; description: string }
export interface Category { id: number; name: string; slug: string; description: string; image: string | null; children: Category[] }
export interface Variant {
  id: number; sku: string; size: string; shade: string; price: string;
  compare_at_price: string | null; stock: number; image: string | null;
}
export interface ProductSummary {
  id: number; name: string; slug: string; brand: Brand; price: string | null;
  compare_at_price: string | null; default_variant: Variant | null; image: string | null;
  on_offer: boolean; featured: boolean; rating_average: number | null; review_count: number;
}
export interface ProductImage { id: number; image: string; alt_text: string; order: number }
export interface Offer {
  id: number; name: string; slug: string; offer_type: string; value: string;
  valid_from: string; valid_to: string; buy_quantity: number; free_quantity: number;
}
export interface ProductDetail {
  id: number; name: string; slug: string; brand: Brand;
  category: Pick<Category, 'id' | 'name' | 'slug'> | null;
  description: string; how_to_use: string; ingredients: string;
  variants: Variant[]; default_variant: Variant | null; images: ProductImage[]; offers: Offer[];
  rating_average: number | null; review_count: number; featured: boolean;
  meta_title: string; meta_description: string;
}
export interface ProductPage {
  results: ProductSummary[]; count: number; next: string | null; previous: string | null;
  facets: {
    total_count: number;
    price_range: {min_price: number | null; max_price: number | null};
    brands: {brand__name: string; brand__slug: string; count: number}[];
    categories: {category__name: string | null; category__slug: string | null; count: number}[];
  };
}
export interface Homepage {
  hero_categories: Category[]; new_in: ProductSummary[];
  bestsellers: ProductSummary[]; featured_brands: Brand[];
}
export type CatalogueSearchParams = Record<string, string | string[] | undefined>;

export interface SearchResults extends ProductPage {query: string; corrected_query: string | null; correction_applied: boolean}
