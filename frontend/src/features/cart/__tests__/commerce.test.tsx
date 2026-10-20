import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import type { AnchorHTMLAttributes } from 'react';
import { describe, expect, it, vi } from 'vitest';
import apiClient from '@/lib/api/client';
import { makeStore } from '@/store/store';
import { restoreSession } from '@/features/auth/state/auth-slice';
import { loadCurrencies, selectCurrency } from '@/features/currency/state/currency-slice';
import { applyVoucher, fetchCart, fetchQuote, updateCartItem } from '../state/cart-slice';
import CartPage from '../screens/cart-page';

vi.mock('@/i18n/navigation', () => ({Link: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} />}));
export const basket = {items: [{id: 1, variant: {id: 2, sku: 'CREAM', product_name: 'Cream', stock: 10, price: '10.00'}, quantity: 3, line_total: '20.00', promotion_discount: '10.00'}], total_price: '20.00', voucher: {code: 'SAVE', valid: true, discount_amount: '2.00'}, warnings: [{variant_id: 2, detail: 'Merged quantity was limited to available stock.'}]};
const quote = {currency: 'usd', base_currency: 'gbp', exchange_rate: '1.25', exchange_rate_at: null, subtotal: '25.00', discount_amount: '2.50', shipping_cost: '4.99', total: '27.49', items: [{id: 1, unit_price: '12.50', line_total: '25.00'}]};
const metadata = {base_currency: 'gbp', selected: 'usd', currencies: [{currency: 'gbp', rate: '1', as_of: null}, {currency: 'usd', rate: '1.25', as_of: null}], max_age_seconds: 345600};

function readyStore() {
  const store = makeStore();
  store.dispatch(restoreSession({accessToken: null, refreshToken: null}));
  store.dispatch(loadCurrencies.fulfilled(metadata, 'metadata'));
  return store;
}

describe('basket commerce', () => {
  it('keeps voucher, promotion and merge warnings from the backend', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({data: basket});
    const store = readyStore();
    await store.dispatch(fetchCart());
    expect(store.getState().cart.voucher?.code).toBe('SAVE');
    expect(store.getState().cart.warnings[0].detail).toContain('Merged quantity');
    expect(store.getState().cart.items[0].promotion_discount).toBe('10.00');
    expect(store.getState().cart.totalPrice).toBe(20);
  });
  it('ignores an older quote that arrives after a newer request', () => {
    const store = readyStore();
    store.dispatch(fetchQuote.pending('old', 'gbp'));
    store.dispatch(fetchQuote.pending('new', 'usd'));
    store.dispatch(fetchQuote.fulfilled(quote, 'new', 'usd'));
    store.dispatch(fetchQuote.fulfilled({...quote, currency: 'gbp'}, 'old', 'gbp'));
    expect(store.getState().cart.quote?.currency).toBe('usd');
  });
  it('invalidates quote responses after basket or currency changes', () => {
    const store = readyStore();
    store.dispatch(fetchQuote.pending('old', 'usd'));
    store.dispatch(updateCartItem.pending('change', {item_id: 1, quantity: 2}));
    store.dispatch(fetchQuote.fulfilled(quote, 'old', 'usd'));
    expect(store.getState().cart.quote).toBeNull();
    store.dispatch(fetchQuote.pending('other', 'usd'));
    store.dispatch(selectCurrency('gbp'));
    store.dispatch(fetchQuote.fulfilled(quote, 'other', 'usd'));
    expect(store.getState().cart.quote).toBeNull();
  });
  it('uses voucher endpoints and preserves existing basket after invalid codes', async () => {
    const post = vi.spyOn(apiClient, 'post').mockRejectedValue({isAxiosError: true, response: {data: {code: ['Invalid voucher.']}}});
    const remove = vi.spyOn(apiClient, 'delete').mockResolvedValue({data: {...basket, voucher: null}});
    const store = readyStore();
    store.dispatch(fetchCart.fulfilled(basket, 'seed'));
    await store.dispatch(applyVoucher('BAD'));
    expect(post).toHaveBeenCalledWith('/api/cart/voucher/', {code: 'BAD'});
    expect(store.getState().cart.error).toBe('Invalid voucher.');
    expect(store.getState().cart.voucher?.code).toBe('SAVE');
    await store.dispatch(applyVoucher(null));
    expect(remove).toHaveBeenCalledWith('/api/cart/voucher/');
    expect(store.getState().cart.voucher).toBeNull();
  });
  it('renders authoritative shipping, discount and total in the selected currency', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async path => ({data: path === '/api/cart/' ? basket : quote}));
    render(<Provider store={readyStore()}><CartPage /></Provider>);
    expect(await screen.findByText('Total: US$27.49')).toBeInTheDocument();
    expect(screen.getByText('Shipping: US$4.99')).toBeInTheDocument();
    expect(screen.getByRole('link', {name: 'Proceed to checkout'})).toHaveAttribute('href', '/checkout?currency=usd');
    expect(screen.getByText(/Merged quantity was limited/)).toBeInTheDocument();
  });
  it('blocks checkout after stale rate rejection', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async path => {
      if (path === '/api/cart/') return {data: basket};
      throw {isAxiosError: true, response: {data: {currency: ['A current exchange rate is unavailable.']}}};
    });
    render(<Provider store={readyStore()}><CartPage /></Provider>);
    expect(await screen.findByRole('alert')).toHaveTextContent('current exchange rate');
    expect(screen.queryByRole('link', {name: 'Proceed to checkout'})).not.toBeInTheDocument();
  });
  it('shows reload rather than presenting fetch failure as an empty basket', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('offline'));
    render(<Provider store={readyStore()}><CartPage /></Provider>);
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load');
    expect(screen.queryByText('Your basket is empty.')).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', {name: 'Reload basket'}));
    expect(apiClient.get).toHaveBeenCalledTimes(2);
  });
});
