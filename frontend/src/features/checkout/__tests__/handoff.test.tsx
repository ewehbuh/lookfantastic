import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import type { AnchorHTMLAttributes } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { makeStore } from '@/store/store';
import apiClient from '@/lib/api/client';
import { fetchQuote } from '@/features/cart/state/cart-slice';
import { loadCurrencies } from '@/features/currency/state/currency-slice';
import { restoreSession } from '@/features/auth/state/auth-slice';
import CheckoutPage from '../screens/checkout-page';
vi.mock('@/i18n/navigation', () => ({Link: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} />}));

describe('quoted checkout handoff', () => {
  it('requires a fresh basket quote when opening checkout directly', () => {
    render(<Provider store={makeStore()}><CheckoutPage /></Provider>);
    expect(screen.getByRole('link', {name: 'Get a current total'})).toHaveAttribute('href', '/cart');
    expect(screen.queryByRole('button', {name: 'Place Order'})).not.toBeInTheDocument();
  });
  it('sends quoted currency and presents the final amount before hosted payment', async () => {
    const store = makeStore();
    store.dispatch(restoreSession({accessToken: null, refreshToken: null}));
    store.dispatch(loadCurrencies.fulfilled({base_currency: 'gbp', selected: 'usd', currencies: [{currency: 'usd', rate: '1.25', as_of: null}], max_age_seconds: 100}, 'rates'));
    store.dispatch(fetchQuote.pending('quote', 'usd'));
    store.dispatch(fetchQuote.fulfilled({currency: 'usd', base_currency: 'gbp', exchange_rate: '1.25', exchange_rate_at: null, subtotal: '25', discount_amount: '0', shipping_cost: '0', total: '25', items: []}, 'quote', 'usd'));
    vi.spyOn(apiClient, 'get').mockImplementation(async path => ({data: path === '/api/payments/methods/' ? {methods: {stripe: true, bank: false, crypto: false}, currency: 'gbp'} : {items: [], total_price: '0'}}));
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({data: {order_number: 'ORDER', currency: 'usd', total: '25.10', payment_url: 'https://checkout.stripe.com/test', guest_access_token: 'guest-capability'}});
    render(<Provider store={store}><CheckoutPage /></Provider>);
    const user = userEvent.setup();
    for (const [label, value] of [['Email', 'guest@example.com'], ['Full Name', 'Guest'], ['Address', 'Street'], ['City', 'City'], ['Postcode', 'ABC']]) {
      await user.type(screen.getByLabelText(label), value);
    }
    await user.click(screen.getByRole('button', {name: 'Place Order'}));
    expect(post).toHaveBeenCalledWith('/api/cart/checkout/', expect.objectContaining({currency: 'usd', shipping_country: 'GB'}));
    expect(await screen.findByRole('heading', {name: 'Confirm payment'})).toBeInTheDocument();
    expect(screen.getByText('Order ORDER: US$25.10')).toBeInTheDocument();
    expect(screen.getByRole('link', {name: 'Continue to secure payment'})).toHaveAttribute('href', 'https://checkout.stripe.com/test');
    expect(sessionStorage.getItem('order-access:ORDER')).toBe('guest-capability');
    expect(screen.getByText(/Payment is still pending/)).toBeInTheDocument();
  });
});
