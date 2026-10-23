export interface Order {
  id: number; order_number: string; status: 'pending' | 'paid' | 'processing' | 'shipped' | 'cancelled' | 'refunded';
  shipping_name: string; shipping_address: string; shipping_city: string; shipping_postcode: string; shipping_country: string;
  subtotal: string; discount_amount: string; refunded_amount: string; shipping_cost: string; total: string;
  currency: string; base_currency: string; exchange_rate: string; exchange_rate_at: string | null; created_at: string; payment_method: string;
  items: {id: number; sku: string; product_name: string; size: string; shade: string; quantity: number; unit_price: string; line_total: string; promotion_discount: string}[];
  shipments: {id: number; carrier: string; tracking_number: string; tracking_url: string; status: string; events: {status: string; occurred_at: string}[]}[];
  returns: {id: number; item: number; quantity: number; reason: string; status: string}[];
  refunds: {id: number; amount: string; currency: string; status: string; created_at: string}[];
}
export interface OrderPage {results: Order[]; count: number; next: string | null; previous: string | null}
