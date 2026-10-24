import apiClient from '@/lib/api/client';
export interface Suggestion {type: 'product' | 'brand'; label: string; slug: string}
export async function suggestions(q: string, signal: AbortSignal) {
  return (await apiClient.get<{query: string; suggestions: Suggestion[]}>('/api/search/suggestions/', {params: {q, limit: 8}, signal})).data;
}
