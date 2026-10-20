import axios, { AxiosError, type AxiosAdapter } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import { createCatalogueApi } from '../api/catalogue';
import { catalogueQuery, pageHref } from '../api/query';
import { page, product } from './fixtures';

function transport(payloads: unknown[]) {
  const adapter = vi.fn<AxiosAdapter>().mockImplementation(async config => {
    const data = payloads.shift();
    if (data instanceof Error) throw data;
    return {data, config, status: 200, statusText: 'OK', headers: {}};
  });
  return {adapter, api: createCatalogueApi(axios.create({adapter}))};
}

describe('catalogue backend contract', () => {
  it('loads exact slug first and retrieves the full detail by id', async () => {
    const {api, adapter} = transport([page, product]);
    expect(await api.product('cream & serum')).toEqual(product);
    expect(adapter.mock.calls[0][0].params).toEqual({slug: 'cream & serum'});
    expect(adapter.mock.calls[1][0].url).toBe('/api/products/1/');
  });
  it('returns not found only for missing products', async () => {
    const {api, adapter} = transport([{...page, results: []}]);
    expect(await api.product('missing')).toBeNull();
    expect(adapter).toHaveBeenCalledTimes(1);
  });
  it('does not turn provider/network failures into product 404s', async () => {
    const {api} = transport([new Error('offline')]);
    await expect(api.product('cream')).rejects.toThrow('offline');
    const detailFailure = transport([page, new AxiosError('failed', 'ERR_NETWORK')]);
    await expect(detailFailure.api.product('cream')).rejects.toThrow('failed');
  });
  it('uses the homepage endpoint even when every section is empty', async () => {
    const empty = {hero_categories: [], new_in: [], bestsellers: [], featured_brands: []};
    const {api, adapter} = transport([empty]);
    expect(await api.homepage()).toEqual(empty);
    expect(adapter).toHaveBeenCalledTimes(1);
    expect(adapter.mock.calls[0][0].url).toBe('/api/products/homepage/');
  });
  it('preserves repeated brands and safe filters across pagination', () => {
    const query = catalogueQuery({brand: ['beauty', 'other'], min_price: '5', page: '1', unknown: 'ignore'}, 'skin/day');
    expect(query.getAll('brand')).toEqual(['beauty', 'other']);
    expect(query.get('category')).toBe('skin/day');
    expect(query.has('unknown')).toBe(false);
    const next = new URL(pageHref('/products', query, 2), 'https://shop.example');
    expect(next.searchParams.getAll('brand')).toEqual(['beauty', 'other']);
    expect(next.searchParams.get('min_price')).toBe('5');
    expect(next.searchParams.get('page')).toBe('2');
    expect(query.get('page')).toBe('1');
  });
});
