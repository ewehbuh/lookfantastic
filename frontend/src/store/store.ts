import { configureStore } from '@reduxjs/toolkit';
import cartReducer from '@/features/cart/state/cart-slice';
import authReducer from '@/features/auth/state/auth-slice';

// Each provider owns a store; server requests never share customer state.
export const makeStore = () => configureStore({
  reducer: {cart: cartReducer, auth: authReducer},
});

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];
