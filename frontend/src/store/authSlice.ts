import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import apiClient, { setAccessToken } from '@/lib/api-client';

interface AuthState {
  user: any | null;
  accessToken: string | null;
  refreshToken: string | null;
  loading: boolean;
  error: string | null;
}

const getToken = (key: string) =>
  typeof window !== 'undefined' ? localStorage.getItem(key) : null;

const initialState: AuthState = {
  user: null,
  accessToken: getToken('accessToken'),
  refreshToken: getToken('refreshToken'),
  loading: false,
  error: null,
};

export const login = createAsyncThunk(
  'auth/login',
  async (credentials: { email: string; password: string }) => {
    const res = await apiClient.post('/api/accounts/login/', credentials);
    return res.data;
  }
);

export const register = createAsyncThunk(
  'auth/register',
  async (userData: any) => {
    const res = await apiClient.post('/api/accounts/register/', userData);
    return res.data;
  }
);

// New: fetch current user details using the stored token
export const fetchUser = createAsyncThunk(
  'auth/fetchUser',
  async (_, { getState }) => {
    // The token is already set in apiClient defaults, so just call the endpoint
    const res = await apiClient.get('/api/accounts/me/');
    return res.data;
  }
);

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    logout(state) {
      state.user = null;
      state.accessToken = null;
      state.refreshToken = null;
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      setAccessToken(null);
    },
    setUser(state, action) {
      state.user = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(login.pending, (s) => {
        s.loading = true;
        s.error = null;
      })
      .addCase(login.fulfilled, (s, action) => {
        const payload = action.payload;

        // user data can be in `payload.user` (from USER_DETAILS_SERIALIZER)
        // or directly at top level (if backend added extra fields)
        const userData = payload.user || payload;
        const user = {
          id: userData.id ?? userData.pk,
          email: userData.email,
          first_name: userData.first_name || '',
          last_name: userData.last_name || '',
          is_staff: userData.is_staff ?? false,
          is_superuser: userData.is_superuser ?? false,
          profile: userData.profile || null,
        };

        s.accessToken = payload.access;
        s.refreshToken = payload.refresh;
        s.user = user;
        s.loading = false;

        localStorage.setItem('accessToken', payload.access);
        localStorage.setItem('refreshToken', payload.refresh);
        setAccessToken(payload.access);
      })
      .addCase(login.rejected, (s, action) => {
        s.error = action.error.message ?? 'Login failed';
        s.loading = false;
      })
      .addCase(register.pending, (s) => {
        s.loading = true;
        s.error = null;
      })
      .addCase(register.fulfilled, (s) => {
        s.loading = false;
      })
      .addCase(register.rejected, (s, action) => {
        s.error = action.error.message ?? 'Registration failed';
        s.loading = false;
      })
      // fetchUser
      .addCase(fetchUser.pending, (s) => {
        s.loading = true;
      })
      .addCase(fetchUser.fulfilled, (s, action) => {
        const userData = action.payload;
        const user = {
          id: userData.id ?? userData.pk,
          email: userData.email,
          first_name: userData.first_name || '',
          last_name: userData.last_name || '',
          is_staff: userData.is_staff ?? false,
          is_superuser: userData.is_superuser ?? false,
          profile: userData.profile || null,
        };
        s.user = user;
        s.loading = false;
      })
      .addCase(fetchUser.rejected, (s, action) => {
        // token invalid or expired – force logout
        s.error = action.error.message ?? 'Session expired';
        s.user = null;
        s.accessToken = null;
        s.refreshToken = null;
        s.loading = false;
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        setAccessToken(null);
      });
  },
});

export const { logout, setUser } = authSlice.actions;
export default authSlice.reducer;