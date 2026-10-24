import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import type { AnchorHTMLAttributes } from 'react';
import { describe, expect, it, vi } from 'vitest';
import apiClient from '@/lib/api/client';
import { makeStore } from '@/store/store';
import { restoreSession, fetchUser } from '@/features/auth/state/auth-slice';
import ProductReviews from '../components/ProductReviews';
const {router} = vi.hoisted(() => ({router: {refresh: vi.fn()}}));
vi.mock('@/i18n/navigation', () => ({Link: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} />, useRouter: () => router}));
const review = {id: 8, product: 1, rating: 4, title: 'Good cream', body: 'Useful', is_approved: true, is_owner: false, verified_purchase: true, created_at: ''};
const empty = {results: [], count: 0, next: null, previous: null};
function show(signedIn = false) {
  const store = makeStore(); store.dispatch(restoreSession({accessToken: signedIn ? 'access' : null, refreshToken: null}));
  if (signedIn) store.dispatch(fetchUser.fulfilled({id: 1}, 'user'));
  render(<Provider store={store}><ProductReviews productId={1} /></Provider>); return userEvent.setup();
}

describe('product review lifecycle', () => {
  it('shows approved public reviews and verified-purchase labels, and asks guests to sign in', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({data: {...empty, results: [review], count: 1}}); show();
    expect(await screen.findByText('Good cream')).toBeInTheDocument();
    expect(screen.getByText('4 / 5 · Verified purchase')).toBeInTheDocument();
    expect(screen.getByRole('link', {name: 'Sign in to write a review'})).toHaveAttribute('href', '/login');
    expect(screen.queryByRole('button', {name: 'Edit your review'})).not.toBeInTheDocument();
  });
  it('submits a new review without approval/ownership/purchase flags and explains moderation', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({data: empty});
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({data: {...review, is_approved: false, is_owner: true}});
    const user = show(true);
    await user.type(await screen.findByLabelText('Review title'), 'Good cream'); await user.type(screen.getByLabelText('Review text'), 'Useful');
    await user.selectOptions(screen.getByLabelText('Rating'), '4'); await user.click(screen.getByRole('button', {name: 'Submit review'}));
    expect(post).toHaveBeenCalledWith('/api/reviews/', {product: 1, rating: 4, title: 'Good cream', body: 'Useful'});
    expect(await screen.findByText(/Your review is awaiting moderation/)).toBeInTheDocument(); expect(router.refresh).toHaveBeenCalled();
  });
  it('loads the owned review separately so editing works even when it is not on the public page', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (_path, config) => ({data: (config?.params as {mine?: boolean})?.mine ? {...empty, results: [{...review, is_owner: true}], count: 1} : empty}));
    const patch = vi.spyOn(apiClient, 'patch').mockResolvedValue({data: {...review, is_owner: true, is_approved: false}});
    const user = show(true); await user.click(await screen.findByRole('button', {name: 'Edit your review'}));
    await user.clear(screen.getByLabelText('Review text')); await user.type(screen.getByLabelText('Review text'), 'Updated');
    await user.click(screen.getByRole('button', {name: 'Submit review'}));
    expect(patch).toHaveBeenCalledWith('/api/reviews/8/', {rating: 4, title: 'Good cream', body: 'Updated'});
    expect(await screen.findByText(/awaiting moderation/)).toBeInTheDocument();
  });
  it('requires explicit confirmation before deleting an owned review', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({data: {...empty, results: [{...review, is_owner: true}], count: 1}});
    const remove = vi.spyOn(apiClient, 'delete').mockResolvedValue({}); const user = show(true);
    await user.click(await screen.findByRole('button', {name: 'Delete your review'})); expect(remove).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', {name: 'Confirm review deletion'}));
    expect(remove).toHaveBeenCalledWith('/api/reviews/8/'); expect(await screen.findByText('Review deleted.')).toBeInTheDocument();
  });
  it('keeps rejected input and shows backend validation errors', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({data: empty});
    vi.spyOn(apiClient, 'post').mockRejectedValue({isAxiosError: true, response: {data: {product: ['You have already reviewed this product.']}}});
    const user = show(true); await user.type(await screen.findByLabelText('Review title'), 'My review'); await user.type(screen.getByLabelText('Review text'), 'Useful');
    await user.click(screen.getByRole('button', {name: 'Submit review'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('already reviewed'); expect(screen.getByLabelText('Review title')).toHaveValue('My review');
  });
  it('renders review text without interpreting markup and never labels unapproved reviews public', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({data: {...empty, results: [{...review, body: '<script>bad()</script>', is_approved: false, is_owner: true}], count: 1}});
    show(true); expect(await screen.findByText('<script>bad()</script>')).toBeInTheDocument();
    expect(screen.getByText('Pending moderation · visible only to you')).toBeInTheDocument(); expect(document.querySelector('script')).toBeNull();
  });
});
