export interface CartVariant {
  id: number; sku: string; price: string; stock: number;
  size?: string; shade?: string; compare_at_price?: string | null;
  image?: string | null; product_name?: string;
}
export interface BasketItem {id: number; variant: CartVariant | null; quantity: number; line_total: string | number; unit_price?: string; promotion_discount?: string}
export interface Voucher {code: string; valid: boolean; discount_amount: string; error?: string}
export interface Basket {items: BasketItem[]; total_price?: string; total_items?: number; voucher?: Voucher | null; warnings?: {variant_id: number; detail: string}[]}
export interface CartItem extends Omit<BasketItem, 'line_total'> {line_total: number}
export interface BasketQuote {
  currency: string; base_currency: string; exchange_rate: string; exchange_rate_at: string | null;
  subtotal: string | number; discount_amount: string | number; shipping_cost: string | number; total: string | number;
  items: {id: number; unit_price: string | number; line_total: string | number}[];
}
