import apiClient from '@/lib/api/client';
export interface Review {id: number; product: number; rating: number; title: string; body: string; is_approved: boolean; is_owner: boolean; verified_purchase: boolean; created_at: string}
export interface ReviewInput {rating: number; title: string; body: string}
export interface ReviewPage {results: Review[]; count: number; next: string | null; previous: string | null}
export const reviewsApi = {
  async list(product: number, page: number, mine: boolean, signal: AbortSignal) {
    return (await apiClient.get<ReviewPage>('/api/reviews/', {params: {product, page, ...(mine ? {mine: true} : {})}, signal})).data;
  },
  async create(product: number, input: ReviewInput) {return (await apiClient.post<Review>('/api/reviews/', {product, ...input})).data;},
  async edit(id: number, input: ReviewInput) {return (await apiClient.patch<Review>(`/api/reviews/${id}/`, input)).data;},
  async remove(id: number) {await apiClient.delete(`/api/reviews/${id}/`);},
};
