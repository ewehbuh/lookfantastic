import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import apiClient from '@/lib/api/client';
import { makeStore } from '@/store/store';
import { restoreSession, fetchUser } from '@/features/auth/state/auth-slice';
import WishlistPage from '../screens/account-wishlist-page';
import PointsPage from '../screens/account-points-page';
import WishlistButton from '../components/WishlistButton';
import { summary } from '@/features/catalogue/__tests__/fixtures';
vi.mock('@/i18n/navigation', () => ({Link: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} />}));
const saved = {id: 77, product: summary, added_at: ''};
const wishlist = {results: [saved], count: 1, next: null, previous: null};
function show(child: ReactNode, signedIn = true) {
  const store = makeStore(); store.dispatch(restoreSession({accessToken: signedIn ? 'access' : null, refreshToken: null}));
  if (signedIn) store.dispatch(fetchUser.fulfilled({id: 1}, 'user'));
  render(<Provider store={store}>{child}</Provider>); return userEvent.setup();
}

describe('wishlist and points', () => {
  it('reads paginated wishlist items and removes by wishlist record id', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({data: wishlist}).mockResolvedValue({data: {...wishlist, results: []}});
    const remove = vi.spyOn(apiClient, 'delete').mockResolvedValue({});
    const user = show(<WishlistPage />);
    await user.click(await screen.findByRole('button', {name: 'Remove Daily Cream from wishlist'}));
    expect(remove).toHaveBeenCalledWith('/api/accounts/wishlist/77/');
    expect(await screen.findByText(/Your wishlist is empty/)).toBeInTheDocument();
  });
  it('keeps items visible after a failed removal', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({data: wishlist});
    vi.spyOn(apiClient, 'delete').mockRejectedValue(new Error('offline'));
    const user = show(<WishlistPage />);
    await user.click(await screen.findByRole('button', {name: 'Remove Daily Cream from wishlist'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to remove');
    expect(screen.getByRole('heading', {name: 'Daily Cream'})).toBeInTheDocument();
  });
  it('uses local page parameters rather than following wishlist next hosts', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValueOnce({data: {...wishlist, next: 'https://backend.invalid/page2'}}).mockResolvedValue({data: {...wishlist, results: []}});
    const user = show(<WishlistPage />);
    await user.click(await screen.findByRole('button', {name: 'Next wishlist page'}));
    await screen.findByText(/Your wishlist is empty/);
    expect(get).toHaveBeenLastCalledWith('/api/accounts/wishlist/', expect.objectContaining({params: {page: 2}}));
  });
  it('adds a product through product_id and only shows success after the API succeeds', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({data: saved});
    const user = show(<WishlistButton productId={summary.id} />);
    await user.click(screen.getByRole('button', {name: 'Save to wishlist'}));
    expect(post).toHaveBeenCalledWith('/api/accounts/wishlist/', {product_id: summary.id});
    expect(await screen.findByRole('button', {name: 'Saved to wishlist'})).toBeDisabled();
    expect(screen.getByRole('link', {name: 'View wishlist'})).toHaveAttribute('href', '/account/wishlist');
  });
  it('shows backend duplicate errors without inventing a successful save', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValue({isAxiosError: true, response: {data: {product_id: ['Already in wishlist.']}}});
    const user = show(<WishlistButton productId={summary.id} />);
    await user.click(screen.getByRole('button', {name: 'Save to wishlist'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('Already in wishlist');
    expect(screen.queryByText('Product saved.')).not.toBeInTheDocument();
  });
  it('directs guests to sign in before saving', () => {
    const post = vi.spyOn(apiClient, 'post'); show(<WishlistButton productId={1} />, false);
    expect(screen.getByRole('link', {name: 'Sign in to save this product'})).toHaveAttribute('href', '/login');
    expect(post).not.toHaveBeenCalled();
  });
  it('loads the actual balance and paginated earn/spend history without staff user overrides', async () => {
    const get = vi.spyOn(apiClient, 'get').mockImplementation(async path => ({data: path === '/api/accounts/points/balance/' ? {total_points: 420} : {results: [{id: 1, points: 10, type: 'earn', description: 'Earned from order'}, {id: 2, points: 3, type: 'spend', description: 'Redeemed'}], count: 2, next: null, previous: null}}));
    show(<PointsPage />);
    expect(await screen.findByText('Balance: 420 points')).toBeInTheDocument();
    expect(screen.getByText('+10 points · Earned')).toBeInTheDocument();
    expect(screen.getByText('−3 points · Spent')).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('/api/accounts/points/', expect.objectContaining({params: {page: 1}}));
    expect(get).toHaveBeenCalledWith('/api/accounts/points/balance/', expect.objectContaining({signal: expect.any(AbortSignal)}));
  });
  it('does not display a false zero balance on loading failure', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('offline')); show(<PointsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load your points');
    expect(screen.queryByText('Balance: 0 points')).not.toBeInTheDocument();
  });
});
