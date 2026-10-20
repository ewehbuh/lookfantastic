import { describe, expect, it, vi } from 'vitest';
import apiClient from '@/lib/api/client';
import { makeStore } from '@/store/store';
import { addToCart, fetchCart, removeFromCart, updateCartItem } from '../state/cart-slice';
import { restoreSession } from '@/features/auth/state/auth-slice';

const basket = {
  items: [{id: 1, variant: Object.freeze({id: 7, sku: 'CREAM', price: '10.00', stock: 10}), quantity: 3, line_total: '20.00'}],
  total_price: '20.00', total_items: 3,
};

describe('basket API and state', () => {
  it('uses discounted server line totals instead of quantity times unit price', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({data: basket});
    const store = makeStore();
    await store.dispatch(fetchCart()).unwrap();
    expect(store.getState().cart.totalPrice).toBe(20);
    expect(store.getState().cart.totalItems).toBe(3);
  });
  it('normalizes without mutating cached/frozen API responses', async () => {
    const variant = Object.freeze({...basket.items[0].variant});
    vi.spyOn(apiClient, 'get').mockResolvedValue({data: {...basket, items: [{...basket.items[0], variant}]}});
    const store = makeStore();
    await store.dispatch(fetchCart()).unwrap();
    expect(variant).not.toHaveProperty('product_name');
    expect(store.getState().cart.items[0].variant?.product_name).toBe('CREAM');
  });
  it('retains the basket after a failed stock update', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({data: basket});
    vi.spyOn(apiClient, 'patch').mockRejectedValue(new Error('Insufficient stock'));
    const store = makeStore();
    await store.dispatch(fetchCart());
    await expect(store.dispatch(updateCartItem({item_id: 1, quantity: 100})).unwrap()).rejects.toBe('Unable to update quantity. Check available stock.');
    expect(store.getState().cart.totalPrice).toBe(20);
    expect(store.getState().cart.loading).toBe(false);
  });
  it('sends the expected add/update/remove requests and consumes server baskets', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({data: basket});
    const patch = vi.spyOn(apiClient, 'patch').mockResolvedValue({data: basket});
    const remove = vi.spyOn(apiClient, 'delete').mockResolvedValue({data: {items: [], total_price: '0', total_items: 0}});
    const store = makeStore();
    await store.dispatch(addToCart({variant_id: 7}));
    await store.dispatch(updateCartItem({item_id: 1, quantity: 3}));
    await store.dispatch(removeFromCart(1));
    expect(post).toHaveBeenCalledWith('/api/cart/add/', {variant_id: 7, quantity: 1});
    expect(patch).toHaveBeenCalledWith('/api/cart/update-item/', {item_id: 1, quantity: 3});
    expect(remove).toHaveBeenCalledWith('/api/cart/remove/', {data: {item_id: 1}});
    expect(store.getState().cart.totalItems).toBe(0);
  });
  it('does not share customer state between provider/store instances', () => {
    const first = makeStore();
    first.dispatch(fetchCart.fulfilled(basket, 'first'));
    first.dispatch(restoreSession({accessToken: 'first-user', refreshToken: null}));
    const second = makeStore();
    expect(second.getState().cart.items).toEqual([]);
    expect(second.getState().auth.accessToken).toBeNull();
  });
});
