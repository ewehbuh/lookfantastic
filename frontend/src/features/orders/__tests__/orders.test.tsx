import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { StrictMode, type AnchorHTMLAttributes } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeStore } from '@/store/store';
import apiClient, {sessionClient} from '@/lib/api/client';
import { fetchUser, restoreSession, sessionExpired } from '@/features/auth/state/auth-slice';
import OrderStatus from '../components/OrderStatus';
import GuestAccessPage from '../screens/guest-access-page';
import AccountOrdersPage from '../screens/account-orders-page';
import OrderSummary from '../components/OrderSummary';
import CheckoutSuccessPage from '@/features/checkout/screens/checkout-success-page';
import type { Order } from '../types/order';
const {query} = vi.hoisted(() => ({query: {value: ''}}));
vi.mock('next/navigation', () => ({useSearchParams: () => new URLSearchParams(query.value)}));
vi.mock('@/i18n/navigation', () => ({Link: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} />}));
const order: Order = {
  id: 1, order_number: 'ORDER1', status: 'pending', shipping_name: 'Customer', shipping_address: 'Street', shipping_city: 'City', shipping_postcode: 'ABC', shipping_country: 'GB',
  subtotal: '20', discount_amount: '2', refunded_amount: '0', shipping_cost: '3.99', total: '21.99', currency: 'gbp', base_currency: 'gbp', exchange_rate: '1', exchange_rate_at: null, created_at: '2026-10-23T00:00:00Z', payment_method: 'bank',
  items: [{id: 1, sku: 'cream', product_name: 'Cream', size: '', shade: '', quantity: 2, unit_price: '10', line_total: '20', promotion_discount: '0'}], shipments: [], returns: [], refunds: [],
};
const token = 'test-guest-capability-at-least-20-chars';
function signedIn() {
  const store = makeStore(); store.dispatch(restoreSession({accessToken: 'access', refreshToken: null}));
  store.dispatch(fetchUser.fulfilled({id: 1, email: 'customer@example.com'}, 'user')); return store;
}
beforeEach(() => {query.value = ''; window.history.replaceState(null, '', '/en/checkout/success');});

describe('verified order status', () => {
  it('does not infer success from the payment redirect and can refresh pending status', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({data: order}).mockResolvedValue({data: {...order, status: 'paid'}});
    render(<Provider store={signedIn()}><OrderStatus number="ORDER1" /></Provider>);
    expect(screen.queryByText('Payment confirmed')).not.toBeInTheDocument();
    expect(await screen.findByText('Payment pending')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', {name: 'Refresh order status'}));
    expect(await screen.findByText('Payment confirmed')).toBeInTheDocument();
  });
  it('looks up guest capabilities only in POST bodies and stores verified access in this tab', async () => {
    const post = vi.spyOn(sessionClient, 'post').mockResolvedValue({data: order});
    render(<Provider store={makeStore()}><OrderStatus number="ORDER1" token={token} guestOnly /></Provider>);
    expect(await screen.findByText('Payment pending')).toBeInTheDocument();
    expect(post).toHaveBeenCalledWith('/api/orders/guest-status/', {order_number: 'ORDER1', token}, expect.any(Object));
    expect(post.mock.calls[0][0]).not.toContain(token);
    expect(sessionStorage.getItem('order-access:ORDER1')).toBe(token);
    expect(screen.queryByRole('link', {name: 'Sign in'})).not.toBeInTheDocument();
  });
  it('offers recovery without fetching a private order for anonymous visitors', () => {
    const store = makeStore(); store.dispatch(restoreSession({accessToken: null, refreshToken: null}));
    const get = vi.spyOn(apiClient, 'get');
    render(<Provider store={store}><OrderStatus number="ORDER1" /></Provider>);
    expect(screen.getByRole('link', {name: 'Request guest access'})).toHaveAttribute('href', '/orders/access?order_number=ORDER1');
    expect(get).not.toHaveBeenCalled();
  });
  it('does not show a stale private order after session expiry', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({data: order}); const store = signedIn();
    render(<Provider store={store}><OrderStatus number="ORDER1" /></Provider>);
    await screen.findByText('Order ORDER1');
    act(() => store.dispatch(sessionExpired()));
    expect(screen.queryByText('Street')).not.toBeInTheDocument();
    expect(screen.getByRole('link', {name: 'Sign in'})).toBeInTheDocument();
  });
  it('shows access failures without claiming payment success', async () => {
    vi.spyOn(sessionClient, 'post').mockRejectedValue({isAxiosError: true, response: {data: {detail: 'Order access is invalid or expired.'}}});
    render(<Provider store={makeStore()}><OrderStatus number="ORDER1" token={token} /></Provider>);
    expect(await screen.findByRole('alert')).toHaveTextContent('invalid or expired');
    expect(screen.queryByText('Payment confirmed')).not.toBeInTheDocument();
  });
  it('reads a guest checkout capability from sessionStorage on payment return', async () => {
    query.value = 'order=ORDER1'; sessionStorage.setItem('order-access:ORDER1', token);
    const post = vi.spyOn(sessionClient, 'post').mockResolvedValue({data: order});
    render(<Provider store={makeStore()}><CheckoutSuccessPage /></Provider>);
    await screen.findByText('Payment pending');
    expect(post).toHaveBeenCalledWith('/api/orders/guest-status/', {order_number: 'ORDER1', token}, expect.any(Object));
  });
  it('removes emailed capabilities from history even under StrictMode', async () => {
    window.history.replaceState(null, '', `/en/orders/access?order_number=ORDER1&token=${token}`);
    vi.spyOn(sessionClient, 'post').mockResolvedValue({data: order});
    render(<StrictMode><Provider store={makeStore()}><GuestAccessPage /></Provider></StrictMode>);
    expect(await screen.findByText('Payment pending')).toBeInTheDocument();
    expect(window.location.search).toBe('');
    await userEvent.setup().click(screen.getByRole('button', {name: 'Forget access on this page'}));
    expect(sessionStorage.getItem('order-access:ORDER1')).toBeNull();
    expect(screen.queryByText('Order ORDER1')).not.toBeInTheDocument();
  });
  it('shows the same recovery acknowledgement without exposing whether details match', async () => {
    const post = vi.spyOn(sessionClient, 'post').mockResolvedValue({status: 202});
    render(<Provider store={makeStore()}><GuestAccessPage /></Provider>); const user = userEvent.setup();
    await user.type(screen.getByLabelText('Order number'), 'ORDER1'); await user.type(screen.getByLabelText('Email'), 'guest@example.com');
    await user.click(screen.getByRole('button', {name: 'Send access link'}));
    expect(await screen.findByRole('status')).toHaveTextContent('If the details match a guest order');
    expect(post).toHaveBeenCalledWith('/api/orders/guest-access/', {order_number: 'ORDER1', email: 'guest@example.com'});
  });
  it('paginates account order history using local API paths', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValueOnce({data: {results: [order], count: 2, next: 'https://backend.invalid/page2', previous: null}})
      .mockResolvedValue({data: {results: [], count: 2, next: null, previous: '/page1'}});
    render(<AccountOrdersPage />);
    await userEvent.setup().click(await screen.findByRole('button', {name: 'Next orders'}));
    expect(await screen.findByText('No orders yet.')).toBeInTheDocument();
    expect(get).toHaveBeenLastCalledWith('/api/orders/', expect.objectContaining({params: {page: 2}}));
  });
  it('shows safe tracking links and refund states in the original order currency', () => {
    render(<OrderSummary order={{...order, status: 'refunded', refunded_amount: '21.99', shipments: [{id: 1, carrier: 'Carrier', tracking_number: 'TRACK', status: 'delivered', tracking_url: 'javascript:alert(1)', events: []}], refunds: [{id: 1, amount: '21.99', currency: 'gbp', status: 'succeeded', created_at: ''}]}} />);
    expect(screen.getByText('Order refunded')).toBeInTheDocument();
    expect(screen.queryByRole('link', {name: 'Track shipment'})).not.toBeInTheDocument();
    expect(screen.getByText('£21.99 · succeeded')).toBeInTheDocument();
  });
});
