import apiClient, {sessionClient} from '@/lib/api/client';
import type { Order, OrderPage } from '../types/order';
export const ordersApi = {
  async list(page: number, signal?: AbortSignal) {return (await apiClient.get<OrderPage>('/api/orders/', {params: {page}, signal})).data;},
  async detail(number: string, signal?: AbortSignal) {return (await apiClient.get<Order>(`/api/orders/${encodeURIComponent(number)}/`, {signal})).data;},
  async guest(number: string, token: string, signal?: AbortSignal) {
    return (await sessionClient.post<Order>('/api/orders/guest-status/', {order_number: number, token}, {signal})).data;
  },
  async requestAccess(number: string, email: string) {await sessionClient.post('/api/orders/guest-access/', {order_number: number, email});},
};
