import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import apiClient from '@/lib/api-client';

// ---------- Types ----------
interface CartItem {
  id: number;
  variant: {
    id: number;
    sku: string;
    size?: string;
    shade?: string;
    price: string;
    compare_at_price?: string;
    stock: number;
    image?: string | null;
    product_name?: string;
  } | null;
  quantity: number;
  line_total: number;             // guaranteed number
}

interface CartState {
  items: CartItem[];
  totalPrice: number;
  totalItems: number;
  loading: boolean;
}

const initialState: CartState = {
  items: [],
  totalPrice: 0,
  totalItems: 0,
  loading: false,
};

// ---------- Helpers ----------
function normaliseCartItem(item: any): CartItem {
  const variant = item.variant || null;
  const quantity = Number(item.quantity) || 0;

  // Use line_total from API, or calculate from variant price
  let line_total = Number(item.line_total);
  if (isNaN(line_total) && variant?.price) {
    line_total = Number(variant.price) * quantity;
  }

  // Ensure product_name is available for display
  if (variant && !variant.product_name) {
    variant.product_name = variant.sku || 'Product';
  }

  return {
    id: item.id,
    variant,
    quantity,
    line_total: line_total || 0,
  };
}

// ---------- Thunks ----------
export const fetchCart = createAsyncThunk('cart/fetch', async () => {
  const res = await apiClient.get('/api/cart/');
  return res.data;
});

export const addToCart = createAsyncThunk(
  'cart/add',
  async ({ variant_id, quantity = 1 }: { variant_id: number; quantity?: number }) => {
    const res = await apiClient.post('/api/cart/add/', { variant_id, quantity });
    return res.data;
  }
);

export const updateCartItem = createAsyncThunk(
  'cart/update',
  async ({ item_id, quantity }: { item_id: number; quantity: number }) => {
    const res = await apiClient.patch('/api/cart/update-item/', { item_id, quantity });
    return res.data;
  }
);

export const removeFromCart = createAsyncThunk(
  'cart/remove',
  async (item_id: number) => {
    const res = await apiClient.delete('/api/cart/remove/', { data: { item_id } });
    return res.data;
  }
);

// ---------- Slice ----------
const cartSlice = createSlice({
  name: 'cart',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    const updateCart = (state: CartState, action: any) => {
      const data = action.payload;
      const items = (data.items || []).map(normaliseCartItem);

      // Derive totals from the normalised items
      const totalItems = items.reduce((sum: number, item: CartItem) => sum + item.quantity, 0);
      const totalPrice = items.reduce((sum: number, item: CartItem) => sum + item.line_total, 0);

      state.items = items;
      state.totalItems = totalItems;
      state.totalPrice = totalPrice;
      state.loading = false;
    };

    builder
      .addCase(fetchCart.pending, (state) => { state.loading = true; })
      .addCase(fetchCart.fulfilled, updateCart)
      .addCase(addToCart.fulfilled, updateCart)
      .addCase(updateCartItem.fulfilled, updateCart)
      .addCase(removeFromCart.fulfilled, updateCart)
      .addCase(fetchCart.rejected, (state) => { state.loading = false; })
      .addCase(addToCart.rejected, (state) => { state.loading = false; })
      .addCase(updateCartItem.rejected, (state) => { state.loading = false; })
      .addCase(removeFromCart.rejected, (state) => { state.loading = false; });
  },
});

export default cartSlice.reducer;
