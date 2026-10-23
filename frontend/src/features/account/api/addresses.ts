import apiClient from '@/lib/api/client';
import type { Address, AddressInput, AddressPage } from '../types/address';

export const addressesApi = {
  async list(page = 1, signal?: AbortSignal) {
    return (await apiClient.get<AddressPage>('/api/accounts/addresses/', {params: {page}, signal})).data;
  },
  async create(input: AddressInput) {return (await apiClient.post<Address>('/api/accounts/addresses/', input)).data;},
  async update(id: number, input: Partial<AddressInput>) {return (await apiClient.patch<Address>(`/api/accounts/addresses/${id}/`, input)).data;},
  async remove(id: number) {await apiClient.delete(`/api/accounts/addresses/${id}/`);},
};
