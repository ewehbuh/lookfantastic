import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';
import { makeStore } from '@/store/store';
import apiClient from '@/lib/api/client';
import ProductDetailClient from '../components/ProductDetailClient';
import type { ProductDetail } from '../types/catalogue';
import { product, variant } from './fixtures';

function show(data: ProductDetail = product) {
  render(<Provider store={makeStore()}><ProductDetailClient product={data} /></Provider>);
  return userEvent.setup();
}

describe('product purchase controls', () => {
  it('disables purchases without an available SKU', () => {
    show({...product, variants: [], default_variant: null});
    expect(screen.getByRole('button', {name: 'Out of stock'})).toBeDisabled();
  });
  it('selects an available SKU even if the cheapest default is sold out', () => {
    const soldOut = {...variant, id: 8, stock: 0};
    show({...product, variants: [soldOut, variant], default_variant: soldOut});
    expect(screen.getByRole('combobox')).toHaveValue('7');
    expect(screen.getByRole('button', {name: 'Add to Cart'})).toBeEnabled();
  });
  it('caps quantity by stock and sends the selected SKU to the basket', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({data: {items: []}});
    const user = show();
    const quantity = screen.getByRole('spinbutton', {name: 'Qty:'});
    await user.clear(quantity);
    await user.type(quantity, '99');
    expect(quantity).toHaveValue(3);
    await user.click(screen.getByRole('button', {name: 'Add to Cart'}));
    expect(post).toHaveBeenCalledWith('/api/cart/add/', {variant_id: 7, quantity: 3});
    expect(await screen.findByRole('status')).toHaveTextContent('Item added');
  });
  it('shows a recoverable error instead of claiming the basket changed', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValue(new Error('Insufficient stock'));
    const user = show();
    await user.click(screen.getByRole('button', {name: 'Add to Cart'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to add');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Add to Cart'})).toBeEnabled();
  });
  it('renders product descriptions as text rather than executing embedded markup', () => {
    const {container} = render(<Provider store={makeStore()}><ProductDetailClient product={{...product, description: '<img src=x onerror=alert(1)>'}} /></Provider>);
    expect(container.querySelector('img[onerror]')).toBeNull();
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
  });
});
