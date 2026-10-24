import apiClient from '@/lib/api/client';
import type { ProductSummary } from '@/features/catalogue/types/catalogue';
export interface Page<T> {results: T[]; count: number; next: string | null; previous: string | null}
export interface WishlistItem {id: number; product: ProductSummary; added_at: string}
export interface PointTransaction {id: number; points: number; type: 'earn' | 'spend'; description: string; created_at: string}
export const customerTools = {
  async wishlist(page: number, signal: AbortSignal) {
    return (await apiClient.get<Page<WishlistItem>>('/api/accounts/wishlist/', {params: {page}, signal})).data;
  },
  async addWishlist(productId: number) {return (await apiClient.post<WishlistItem>('/api/accounts/wishlist/', {product_id: productId})).data;},
  async removeWishlist(id: number) {await apiClient.delete(`/api/accounts/wishlist/${id}/`);},
  async points(page: number, signal: AbortSignal) {
    const [history, balance] = await Promise.all([
      apiClient.get<Page<PointTransaction>>('/api/accounts/points/', {params: {page}, signal}),
      apiClient.get<{total_points: number}>('/api/accounts/points/balance/', {signal}),
    ]);
    return {...history.data, balance: balance.data.total_points};
  },
};
