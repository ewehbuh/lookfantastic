import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';
import apiClient from '@/lib/api/client';
import { makeStore } from '@/store/store';
import { loadCurrencies } from '../state/currency-slice';
import CurrencySelector from '../components/CurrencySelector';
import Price from '../components/Price';
const response = {base_currency: 'gbp', max_age_seconds: 345600, currencies: [{currency: 'gbp', rate: '1', as_of: null}, {currency: 'usd', rate: '1.25', as_of: null}]};

describe('currency preferences', () => {
  it('restores an available preference and falls back when its rate expires', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({data: response});
    localStorage.setItem('currency', 'usd');
    const store = makeStore();
    await store.dispatch(loadCurrencies());
    expect(store.getState().currency.selected).toBe('usd');
    localStorage.setItem('currency', 'eur');
    await store.dispatch(loadCurrencies());
    expect(store.getState().currency.selected).toBe('gbp');
  });
  it('offers only backend-enabled currencies and remembers manual selection', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({data: response});
    const store = makeStore();
    render(<Provider store={store}><CurrencySelector /><Price amount="10.00" /></Provider>);
    await screen.findByRole('option', {name: 'USD'});
    expect(screen.queryByRole('option', {name: 'EUR'})).not.toBeInTheDocument();
    await userEvent.setup().selectOptions(screen.getByLabelText('Currency'), 'usd');
    expect(localStorage.getItem('currency')).toBe('usd');
    expect(screen.getByText('US$12.50')).toBeInTheDocument();
  });
  it('does not invent converted prices if rates cannot be loaded', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('offline'));
    render(<Provider store={makeStore()}><CurrencySelector /><Price amount="10.00" /></Provider>);
    expect(await screen.findByRole('button', {name: 'Retry currencies'})).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
