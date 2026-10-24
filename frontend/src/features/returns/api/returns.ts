import apiClient, {sessionClient} from '@/lib/api/client';
export interface ReturnInput {order_number: string; item_id: number; quantity: number; reason: string; token?: string}
export async function requestReturn(input: ReturnInput) {
  return (await (input.token ? sessionClient : apiClient).post('/api/returns/', input)).data;
}
