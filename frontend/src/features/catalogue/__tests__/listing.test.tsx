import { render, screen } from '@testing-library/react';
import type { AnchorHTMLAttributes } from 'react';
import { describe, expect, it, vi } from 'vitest';
import ProductListing from '../components/ProductListing';
import { page } from './fixtures';
const {products} = vi.hoisted(() => ({products: vi.fn()}));
vi.mock('../api/server', () => ({catalogue: {products}}));
vi.mock('@/i18n/navigation', () => ({Link: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} />}));

describe('catalogue browsing', () => {
  it('uses backend facets and navigates locally while retaining filters', async () => {
    products.mockResolvedValueOnce(page);
    render(await ProductListing({category: 'skin/day', searchParams: {brand: 'beauty', min_price: '5'}}));
    expect(products.mock.calls[0][0].get('category')).toBe('skin/day');
    expect(screen.getByRole('heading', {name: 'Daily Cream'})).toBeInTheDocument();
    const next = screen.getByRole('link', {name: 'Next'});
    expect(next.getAttribute('href')).toContain('/category/skin/day?');
    expect(next.getAttribute('href')).toContain('brand=beauty');
    expect(next.getAttribute('href')).toContain('page=2');
    expect(next.getAttribute('href')).not.toContain('backend.invalid');
  });
  it('distinguishes an empty catalogue from a failed request', async () => {
    products.mockResolvedValueOnce({...page, results: [], count: 0, next: null});
    render(await ProductListing({searchParams: {}}));
    expect(screen.getByText('No products match these filters.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('provides a retry path after failed requests', async () => {
    products.mockRejectedValueOnce(new Error('offline'));
    render(await ProductListing({searchParams: {}}));
    expect(screen.getByRole('alert')).toHaveTextContent('could not load');
    expect(screen.getByRole('link', {name: 'Reset filters and try again'})).toHaveAttribute('href', '/products');
  });
});
