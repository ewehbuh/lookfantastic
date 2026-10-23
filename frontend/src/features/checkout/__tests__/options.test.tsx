import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import type { AnchorHTMLAttributes } from 'react';
import { describe, expect, it, vi } from 'vitest';
import apiClient from '@/lib/api/client';
import { makeStore } from '@/store/store';
import { restoreSession, fetchUser } from '@/features/auth/state/auth-slice';
import { loadCurrencies } from '@/features/currency/state/currency-slice';
import { fetchQuote } from '@/features/cart/state/cart-slice';
import CheckoutPage from '../screens/checkout-page';
vi.mock('@/i18n/navigation', () => ({Link: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} />}));
const home = {id: 25, label: 'Home', full_name: 'Customer', line1: 'First Street', line2: '', city: 'City', postcode: 'ABC', country: 'GB', phone: '', is_default: true};
const methods = {methods: {stripe: true, bank: true, crypto: true}, currency: 'gbp'};
const book = {count: 1, next: null, previous: null, results: [home]};
function show(signedIn = false) {
  const store = makeStore();
  store.dispatch(restoreSession({accessToken: signedIn ? 'access' : null, refreshToken: null}));
  if (signedIn) store.dispatch(fetchUser.fulfilled({id: 1, email: 'customer@example.com'}, 'user'));
  store.dispatch(loadCurrencies.fulfilled({base_currency: 'gbp', selected: 'gbp', currencies: [{currency: 'gbp', rate: '1', as_of: null}], max_age_seconds: 100}, 'rates'));
  store.dispatch(fetchQuote.pending('quote', 'gbp'));
  store.dispatch(fetchQuote.fulfilled({currency: 'gbp', base_currency: 'gbp', exchange_rate: '1', exchange_rate_at: null, subtotal: '25', discount_amount: '0', shipping_cost: '0', total: '25', items: []}, 'quote', 'gbp'));
  render(<Provider store={store}><CheckoutPage /></Provider>);
  return userEvent.setup();
}
async function fillManual(user: ReturnType<typeof userEvent.setup>, guest = true) {
  if (guest) await user.type(screen.getByLabelText('Email'), 'guest@example.com');
  for (const [label, value] of [['Full Name', 'Customer'], ['Address', 'Street'], ['City', 'City'], ['Postcode', 'ABC']]) await user.type(screen.getByLabelText(label), value);
}
function mockResources(availability = methods, addresses = book) {
  return vi.spyOn(apiClient, 'get').mockImplementation(async path => ({data: path === '/api/payments/methods/' ? availability : path === '/api/accounts/addresses/' ? addresses : {items: []}}));
}
const order = {order_number: 'ORDER', total: '25.00', currency: 'gbp', payment_url: 'https://checkout.stripe.com/pay'};

describe('checkout addresses and payment methods', () => {
  it('does not request private addresses for guests and sends the chosen crypto method', async () => {
    const get = mockResources(); const post = vi.spyOn(apiClient, 'post').mockResolvedValue({data: order});
    const user = show(); await fillManual(user);
    await user.click(await screen.findByRole('radio', {name: 'Cryptocurrency'}));
    await user.click(screen.getByRole('button', {name: 'Place Order'}));
    expect(post).toHaveBeenCalledWith('/api/cart/checkout/', expect.objectContaining({payment_method: 'crypto', shipping_name: 'Customer'}));
    expect(get.mock.calls.some(([path]) => path === '/api/accounts/addresses/')).toBe(false);
  });
  it('selects the default address and sends address_id without shipping fields', async () => {
    mockResources(); const post = vi.spyOn(apiClient, 'post').mockResolvedValue({data: order});
    const user = show(true);
    expect(await screen.findByLabelText('Shipping address')).toHaveValue('25');
    expect(screen.queryByLabelText('Full Name')).not.toBeInTheDocument();
    await user.click(await screen.findByRole('radio', {name: 'Bank payment with Stripe'}));
    await user.click(screen.getByRole('button', {name: 'Place Order'}));
    expect(post).toHaveBeenCalledWith('/api/cart/checkout/', expect.objectContaining({address_id: 25, email: 'customer@example.com', payment_method: 'bank'}));
    expect(post.mock.calls[0][1]).not.toHaveProperty('shipping_name');
  });
  it('can switch from a saved address to manual shipping details', async () => {
    mockResources(); const post = vi.spyOn(apiClient, 'post').mockResolvedValue({data: order});
    const user = show(true);
    await user.selectOptions(await screen.findByLabelText('Shipping address'), 'new');
    await fillManual(user, false);
    await user.click(screen.getByRole('button', {name: 'Place Order'}));
    expect(post.mock.calls[0][1]).not.toHaveProperty('address_id');
    expect(post.mock.calls[0][1]).toMatchObject({shipping_address: 'Street', shipping_country: 'GB'});
  });
  it('hides disabled providers and prevents ordering when none are configured', async () => {
    mockResources({methods: {stripe: false, bank: false, crypto: false}, currency: 'gbp'});
    const post = vi.spyOn(apiClient, 'post'); show();
    expect(await screen.findByText(/No payment methods are currently configured/)).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Place Order'})).toBeDisabled(); expect(post).not.toHaveBeenCalled();
  });
  it('blocks ordering on metadata failure and supports retry', async () => {
    const get = vi.spyOn(apiClient, 'get').mockRejectedValueOnce(new Error('offline')).mockResolvedValue({data: methods});
    const user = show();
    await user.click(await screen.findByRole('button', {name: 'Retry payment methods'}));
    expect(await screen.findByRole('radio', {name: 'Card with Stripe'})).toBeInTheDocument();
    expect(get).toHaveBeenCalledTimes(2);
  });
  it('allows manual shipping if the address book cannot be loaded', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async path => {
      if (path === '/api/accounts/addresses/') throw new Error('offline');
      return {data: methods};
    });
    show(true);
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter shipping details manually');
    expect(screen.getByLabelText('Full Name')).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Place Order'})).toBeEnabled();
  });
  it('loads additional address pages without following remote next URLs', async () => {
    const extra = {...home, id: 26, label: 'Office', is_default: false};
    const get = vi.spyOn(apiClient, 'get').mockImplementation(async (path, config) => ({data: path === '/api/payments/methods/' ? methods : (config?.params as {page?: number} | undefined)?.page === 2 ? {...book, results: [extra]} : {...book, next: 'https://backend.invalid/page2'}}));
    const user = show(true);
    await user.click(await screen.findByRole('button', {name: 'Load more addresses'}));
    await user.selectOptions(screen.getByLabelText('Shipping address'), '26');
    expect(screen.getByLabelText('Shipping address')).toHaveValue('26');
    expect(get).toHaveBeenCalledWith('/api/accounts/addresses/', expect.objectContaining({params: {page: 2}}));
  });
  it('keeps a created order visible if its payment URL is invalid, without offering a duplicate submission', async () => {
    mockResources(); const post = vi.spyOn(apiClient, 'post').mockResolvedValue({data: {...order, payment_url: 'javascript:alert(1)'}});
    const user = show(); await fillManual(user);
    await user.click(screen.getByRole('button', {name: 'Place Order'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your order was created');
    expect(screen.queryByRole('button', {name: 'Place Order'})).not.toBeInTheDocument();
    expect(screen.queryByRole('link', {name: 'Continue to secure payment'})).not.toBeInTheDocument();
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
  });
});
