import { createSlice, createAsyncThunk, isAnyOf } from '@reduxjs/toolkit';
import apiClient from '@/lib/api/client';
import { apiError } from '@/lib/api/errors';
import { selectCurrency } from '@/features/currency/state/currency-slice';
import type { Basket, CartItem, BasketQuote, Voucher } from '../types/cart';

interface CartState {
  items: CartItem[]; totalPrice: number; totalItems: number; loading: boolean; loaded: boolean;
  error: string | null; voucher: Voucher | null; warnings: {variant_id: number; detail: string}[];
  revision: number; quote: BasketQuote | null; quoteLoading: boolean; quoteError: string | null; quoteRequest: string | null;
}
const initialState: CartState = {items: [], totalPrice: 0, totalItems: 0, loading: false, loaded: false,
  error: null, voucher: null, warnings: [], revision: 0, quote: null, quoteLoading: false, quoteError: null, quoteRequest: null};

export const fetchCart = createAsyncThunk('cart/fetch', async (_, {rejectWithValue}) => {
  try {return (await apiClient.get<Basket>('/api/cart/')).data;}
  catch (error) {return rejectWithValue(apiError(error, 'Unable to load your basket. Please try again.'));}
});
export const addToCart = createAsyncThunk('cart/add', async ({variant_id, quantity = 1}: {variant_id: number; quantity?: number}) =>
  (await apiClient.post<Basket>('/api/cart/add/', {variant_id, quantity})).data);
export const updateCartItem = createAsyncThunk('cart/update', async ({item_id, quantity}: {item_id: number; quantity: number}, {rejectWithValue}) => {
  try {return (await apiClient.patch<Basket>('/api/cart/update-item/', {item_id, quantity})).data;}
  catch (error) {return rejectWithValue(apiError(error, 'Unable to update quantity. Check available stock.'));}
});
export const removeFromCart = createAsyncThunk('cart/remove', async (item_id: number, {rejectWithValue}) => {
  try {return (await apiClient.delete<Basket>('/api/cart/remove/', {data: {item_id}})).data;}
  catch (error) {return rejectWithValue(apiError(error, 'Unable to remove this item. Please try again.'));}
});
export const applyVoucher = createAsyncThunk('cart/voucher', async (code: string | null, {rejectWithValue}) => {
  try {return code === null ? (await apiClient.delete<Basket>('/api/cart/voucher/')).data :
    (await apiClient.post<Basket>('/api/cart/voucher/', {code})).data;}
  catch (error) {return rejectWithValue(apiError(error, 'Voucher could not be applied. Check its code and conditions.'));}
});
export const fetchQuote = createAsyncThunk('cart/quote', async (currency: string, {rejectWithValue}) => {
  try {return (await apiClient.get<BasketQuote>('/api/cart/quote/', {params: {currency}})).data;}
  catch (error) {return rejectWithValue(apiError(error, 'A current total is unavailable. Check your voucher or refresh currency rates.'));}
});
const mutations = [fetchCart, addToCart, updateCartItem, removeFromCart, applyVoucher] as const;
const slice = createSlice({
  name: 'cart', initialState, reducers: {},
  extraReducers: builder => {
    builder.addCase(selectCurrency, state => {state.quote = null; state.quoteRequest = null; state.quoteLoading = false;})
      .addCase(fetchQuote.pending, (state, action) => {state.quote = null; state.quoteError = null; state.quoteLoading = true; state.quoteRequest = action.meta.requestId;})
      .addCase(fetchQuote.fulfilled, (state, action) => {
        if (state.quoteRequest !== action.meta.requestId) return;
        state.quote = action.payload; state.quoteLoading = false;
      })
      .addCase(fetchQuote.rejected, (state, action) => {
        if (state.quoteRequest !== action.meta.requestId) return;
        state.quoteError = String(action.payload ?? 'Unable to calculate total.'); state.quoteLoading = false;
      })
      .addMatcher(isAnyOf(...mutations.map(thunk => thunk.pending)), state => {
        state.loading = true; state.error = null; state.quote = null; state.quoteRequest = null; state.quoteLoading = false;
      })
      .addMatcher(isAnyOf(...mutations.map(thunk => thunk.fulfilled)), (state, action) => {
        const data = action.payload;
        state.items = data.items.map(item => ({...item, variant: item.variant ? {...item.variant, product_name: item.variant.product_name || item.variant.sku} : null, line_total: Number(item.line_total)}));
        state.totalPrice = data.total_price !== undefined ? Number(data.total_price) : state.items.reduce((sum, item) => sum + item.line_total, 0);
        state.totalItems = state.items.reduce((sum, item) => sum + item.quantity, 0);
        state.voucher = data.voucher ?? null;
        state.warnings = data.warnings?.length ? data.warnings : state.warnings;
        state.loading = false; state.loaded = true; state.revision += 1;
      })
      .addMatcher(isAnyOf(...mutations.map(thunk => thunk.rejected)), (state, action) => {
        state.loading = false; state.error = String(action.payload ?? action.error.message ?? 'Basket request failed.');
      });
  },
});
export default slice.reducer;
