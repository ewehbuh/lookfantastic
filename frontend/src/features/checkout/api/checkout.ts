import apiClient from '@/lib/api/client';
export type PaymentMethod = 'stripe' | 'bank' | 'crypto';
export interface PaymentAvailability {methods: Record<PaymentMethod, boolean>; currency: string}
export interface CheckoutOrder {order_number: string; currency: string; total: string; payment_url: string; guest_access_token?: string}
export const paymentLabels: Record<PaymentMethod, string> = {stripe: 'Card with Stripe', bank: 'Bank payment with Stripe', crypto: 'Cryptocurrency'};
export async function paymentAvailability(signal?: AbortSignal) {
  return (await apiClient.get<PaymentAvailability>('/api/payments/methods/', {signal})).data;
}
