import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import apiClient from '@/lib/api/client';

export interface CurrencyRate {currency: string; rate: string; as_of: string | null}
export interface CurrencyResponse {base_currency: string; currencies: CurrencyRate[]; max_age_seconds: number}
interface CurrencyState {base: string; selected: string; rates: CurrencyRate[]; ready: boolean; error: string | null}
const initialState: CurrencyState = {base: 'gbp', selected: 'gbp', rates: [], ready: false, error: null};

export const loadCurrencies = createAsyncThunk('currency/load', async () => {
  const {data} = await apiClient.get<CurrencyResponse>('/api/currencies/');
  let stored: string | null = null;
  try { stored = localStorage.getItem('currency'); } catch { /* Storage may be disabled. */ }
  return {...data, selected: data.currencies.some(rate => rate.currency === stored) ? stored! : data.base_currency};
});
const slice = createSlice({
  name: 'currency', initialState,
  reducers: {
    selectCurrency(state, action: PayloadAction<string>) {
      if (state.rates.some(rate => rate.currency === action.payload)) state.selected = action.payload;
    },
  },
  extraReducers: builder => builder
    .addCase(loadCurrencies.pending, state => {state.error = null;})
    .addCase(loadCurrencies.fulfilled, (state, {payload}) => {
      state.base = payload.base_currency; state.rates = payload.currencies;
      state.selected = payload.selected; state.ready = true; state.error = null;
    })
    .addCase(loadCurrencies.rejected, state => {state.error = 'Currency rates are unavailable. Please try again.'; state.ready = false;}),
});
export const {selectCurrency} = slice.actions;
export default slice.reducer;
