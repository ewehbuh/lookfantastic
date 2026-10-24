import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import type { AnchorHTMLAttributes } from 'react';
import { describe, expect, it, vi } from 'vitest';
import apiClient from '@/lib/api/client';
import { makeStore } from '@/store/store';
import SearchBox from '../components/SearchBox';
import ProductListing from '@/features/catalogue/components/ProductListing';
import { page } from '@/features/catalogue/__tests__/fixtures';
const {router, search} = vi.hoisted(() => ({router: {push: vi.fn()}, search: vi.fn()}));
vi.mock('@/i18n/navigation', () => ({Link: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} />, useRouter: () => router}));
vi.mock('@/features/catalogue/api/server', () => ({catalogue: {search}}));

describe('search discovery', () => {
  it('submits encoded search queries through locale-preserving navigation', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({data: {suggestions: []}});
    render(<SearchBox />); const user = userEvent.setup();
    await user.type(screen.getByRole('searchbox'), 'cream & serum');
    await user.click(screen.getByRole('button', {name: 'Search'}));
    expect(router.push).toHaveBeenCalledWith('/search?q=cream%20%26%20serum');
  });
  it('rejects empty queries without navigating', async () => {
    render(<SearchBox />); await userEvent.setup().click(screen.getByRole('button', {name: 'Search'}));
    expect(screen.getByRole('alert')).toHaveTextContent('ten search terms'); expect(router.push).not.toHaveBeenCalled();
  });
  it('debounces suggestions and links products and brands to valid routes', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({data: {query: 'cream', suggestions: [{type: 'product', label: 'Cream', slug: 'cream'}, {type: 'brand', label: 'Beauty', slug: 'beauty'}]}});
    render(<SearchBox />); await userEvent.setup().type(screen.getByRole('searchbox'), 'cream');
    expect(await screen.findByRole('link', {name: 'Cream · Product'})).toHaveAttribute('href', '/product/cream');
    expect(screen.getByRole('link', {name: 'Beauty · Brand'})).toHaveAttribute('href', '/products?brand=beauty');
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('/api/search/suggestions/', expect.objectContaining({params: {q: 'cream', limit: 8}}));
  });
  it('does not display results from an older suggestion response', async () => {
    let resolveOld!: (value: {data: {suggestions: {type: string; label: string; slug: string}[]}}) => void;
    const get = vi.spyOn(apiClient, 'get').mockReturnValueOnce(new Promise(resolve => {resolveOld = resolve;}))
      .mockResolvedValue({data: {suggestions: [{type: 'product', label: 'New product', slug: 'new'}]}});
    render(<SearchBox />); const user = userEvent.setup();
    await user.type(screen.getByRole('searchbox'), 'old'); await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    await user.clear(screen.getByRole('searchbox')); await user.type(screen.getByRole('searchbox'), 'new');
    await screen.findByRole('link', {name: 'New product · Product'});
    resolveOld({data: {suggestions: [{type: 'product', label: 'Old product', slug: 'old'}]}});
    await waitFor(() => expect(screen.queryByRole('link', {name: 'Old product · Product'})).not.toBeInTheDocument());
  });
  it('keeps search usable when suggestions fail', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('offline'));
    render(<SearchBox />); const user = userEvent.setup(); await user.type(screen.getByRole('searchbox'), 'cream');
    expect(await screen.findByRole('status')).toHaveTextContent('still submit');
    await user.click(screen.getByRole('button', {name: 'Search'})); expect(router.push).toHaveBeenCalledWith('/search?q=cream');
  });
  it('renders backend typo corrections and retains filters in the original-query option', async () => {
    search.mockResolvedValue({...page, query: 'creem', corrected_query: 'cream', correction_applied: true});
    render(<Provider store={makeStore()}>{await ProductListing({searchTerm: 'creem', searchParams: {brand: ['beauty', 'other'], min_price: '5'}})}</Provider>);
    expect(search.mock.calls[0][0].get('q')).toBe('creem');
    const original = new URL(screen.getByRole('link', {name: 'Search original wording'}).getAttribute('href')!, 'https://shop.example');
    expect(original.searchParams.getAll('brand')).toEqual(['beauty', 'other']);
    expect(original.searchParams.get('typo_correction')).toBe('false'); expect(original.searchParams.get('q')).toBe('creem');
    expect(screen.getByRole('option', {name: 'Relevance'})).toBeInTheDocument();
    const next = new URL(screen.getByRole('link', {name: 'Next'}).getAttribute('href')!, 'https://shop.example');
    expect(next.pathname).toBe('/search'); expect(next.searchParams.get('q')).toBe('creem');
  });
});
