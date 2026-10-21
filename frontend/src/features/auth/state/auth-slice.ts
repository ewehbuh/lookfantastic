import { createSlice, createAsyncThunk, isAnyOf, type PayloadAction } from '@reduxjs/toolkit';
import { isAxiosError } from 'axios';
import apiClient, {acceptSession, clearLegacyTokens, invalidateSession, refreshAccessToken, sessionVersion} from '@/lib/api/client';
import { apiError } from '@/lib/api/errors';
import type { AccountUser, AuthResponse, Registration } from '../types/auth';

interface AuthState {
  initialized: boolean; user: AccountUser | null; accessToken: string | null;
  refreshToken: null; loading: boolean; error: string | null; logoutError: string | null; activeRequest: string | null;
}
const initialState: AuthState = {initialized: false, user: null, accessToken: null, refreshToken: null, loading: false, error: null, logoutError: null, activeRequest: null};
const normalize = (user: AccountUser): AccountUser => ({...user, id: user.id ?? user.pk});
async function establish(path: string, payload: unknown) {
  invalidateSession();
  const started = sessionVersion();
  const {data} = await apiClient.post<AuthResponse>(path, payload);
  if (started !== sessionVersion()) throw new Error('Session changed. Sign in again.');
  if (!data.access) throw new Error('Sign-in response did not contain an access token.');
  acceptSession(data.access);
  return {access: data.access, user: normalize(data.user)};
}
export const login = createAsyncThunk('auth/login', async (credentials: {email: string; password: string}, {rejectWithValue}) => {
  try {return await establish('/api/accounts/login/', credentials);}
  catch (error) {return rejectWithValue(apiError(error, 'Unable to sign in. Check your details and try again.'));}
});
export const googleLogin = createAsyncThunk('auth/google', async (credentials: {code: string; state: string}, {rejectWithValue}) => {
  try {return await establish('/api/accounts/google/', credentials);}
  catch (error) {return rejectWithValue(apiError(error, 'Google sign-in failed. Please start again.'));}
});
export const register = createAsyncThunk('auth/register', async (data: Registration, {rejectWithValue}) => {
  try {return (await apiClient.post('/api/accounts/register/', data)).data;}
  catch (error) {return rejectWithValue(apiError(error, 'Unable to create your account. Please try again.'));}
});
export const bootstrapSession = createAsyncThunk('auth/bootstrap', async (_, {rejectWithValue}) => {
  clearLegacyTokens();
  const started = sessionVersion();
  try {
    const access = await refreshAccessToken();
    const {data} = await apiClient.get<AccountUser>('/api/accounts/me/');
    if (started !== sessionVersion()) throw new Error('Session changed.');
    return {access, user: normalize(data)};
  } catch (error) {
    if (isAxiosError(error) && [401, 403].includes(error.response?.status ?? 0)) return null;
    return rejectWithValue('Unable to restore your session. Please sign in or try again.');
  }
});
export const fetchUser = createAsyncThunk('auth/fetchUser', async () => {
  try {return (await apiClient.get<AccountUser>('/api/accounts/me/')).data;}
  catch (error) {
    if (isAxiosError(error) && [401, 403].includes(error.response?.status ?? 0)) invalidateSession();
    throw error;
  }
});
export const logout = createAsyncThunk('auth/logout', async (_, {rejectWithValue}) => {
  invalidateSession();
  try {await apiClient.post('/api/accounts/logout/', {});}
  catch {return rejectWithValue('Signed out locally, but server logout could not be confirmed. Retry logout before leaving a shared device.');}
});
const slice = createSlice({name: 'auth', initialState, reducers: {
  sessionExpired: () => ({...initialState, initialized: true}),
  clearAuthError(state) {state.error = null;},
  // Used to initialize state in isolated component tests; production restores the cookie session.
  restoreSession(state, {payload}: PayloadAction<{accessToken: string | null; refreshToken: string | null}>) {
    state.accessToken = payload.accessToken; state.initialized = true; state.loading = Boolean(payload.accessToken);
  },
  setUser(state, {payload}: PayloadAction<AccountUser>) {state.user = payload;},
}, extraReducers: builder => {
  builder.addCase(logout.pending, () => ({...initialState, initialized: true, loading: true}))
    .addCase(logout.fulfilled, () => ({...initialState, initialized: true}))
    .addCase(logout.rejected, (state, action) => {state.loading = false; state.logoutError = String(action.payload);})
    .addCase(register.pending, state => {state.loading = true; state.error = null;})
    .addCase(register.fulfilled, state => {state.loading = false;})
    .addCase(register.rejected, (state, action) => {state.loading = false; state.error = String(action.payload);})
    .addCase(fetchUser.pending, state => {state.loading = true;})
    .addCase(fetchUser.fulfilled, (state, action) => {state.user = normalize(action.payload); state.loading = false;})
    .addCase(fetchUser.rejected, state => {state.user = null; state.accessToken = null; state.loading = false;})
    .addMatcher(isAnyOf(login.pending, googleLogin.pending, bootstrapSession.pending), (state, action) => {
      state.activeRequest = action.meta.requestId; state.loading = true; state.error = null;
    })
    .addMatcher(isAnyOf(login.fulfilled, googleLogin.fulfilled, bootstrapSession.fulfilled), (state, action) => {
      if (state.activeRequest !== action.meta.requestId) return;
      state.user = action.payload?.user ?? null; state.accessToken = action.payload?.access ?? null;
      state.initialized = true; state.loading = false; state.activeRequest = null;
    })
    .addMatcher(isAnyOf(login.rejected, googleLogin.rejected, bootstrapSession.rejected), (state, action) => {
      if (state.activeRequest !== action.meta.requestId) return;
      state.initialized = true; state.loading = false; state.activeRequest = null; state.error = String(action.payload);
    });
}});
export const {sessionExpired, clearAuthError, restoreSession, setUser} = slice.actions;
export default slice.reducer;
