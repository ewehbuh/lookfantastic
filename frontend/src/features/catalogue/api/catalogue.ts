import { isAxiosError, type AxiosInstance } from 'axios';
import type { Homepage, ProductDetail, ProductPage } from '../types/catalogue';

// The transport is injected so server and browser requests keep separate credentials.
export function createCatalogueApi(client: AxiosInstance) {
  return {
    async products(params = new URLSearchParams()): Promise<ProductPage> {
      return (await client.get<ProductPage>('/api/products/', {params})).data;
    },
    async product(slug: string): Promise<ProductDetail | null> {
      const list = (await client.get<ProductPage>('/api/products/', {params: {slug}})).data;
      const summary = list.results[0];
      if (!summary) return null;
      try {
        return (await client.get<ProductDetail>(`/api/products/${summary.id}/`)).data;
      } catch (error) {
        if (isAxiosError(error) && error.response?.status === 404) return null;
        throw error;
      }
    },
    async homepage(): Promise<Homepage> {
      return (await client.get<Homepage>('/api/products/homepage/')).data;
    },
  };
}
