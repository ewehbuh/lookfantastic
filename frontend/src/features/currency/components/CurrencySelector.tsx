'use client';
import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { loadCurrencies, selectCurrency } from '../state/currency-slice';

export default function CurrencySelector() {
  const dispatch = useAppDispatch();
  const {rates, selected, ready, error} = useAppSelector(state => state.currency);
  useEffect(() => {void dispatch(loadCurrencies());}, [dispatch]);
  if (error) return <button onClick={() => void dispatch(loadCurrencies())} className="text-sm underline">Retry currencies</button>;
  return <label className="text-sm">Currency
    <select aria-label="Currency" className="ml-2 border p-1" disabled={!ready} value={ready ? selected : ''} onChange={event => {
      dispatch(selectCurrency(event.target.value));
      try {localStorage.setItem('currency', event.target.value);} catch { /* Preference remains in memory. */ }
    }}>
      {!ready && <option value="">Loading…</option>}
      {rates.map(rate => <option key={rate.currency} value={rate.currency}>{rate.currency.toUpperCase()}</option>)}
    </select>
  </label>;
}
