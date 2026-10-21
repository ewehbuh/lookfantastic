import { afterEach, describe, expect, it, vi } from 'vitest';
import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import apiClient, {acceptSession, invalidateSession, onSessionExpired, refreshAccessToken, sessionClient} from '@/lib/api/client';
import { makeStore } from '@/store/store';
import { bootstrapSession, login, logout } from '../state/auth-slice';
import { fetchCart } from '@/features/cart/state/cart-slice';

const unauthorized = (config: InternalAxiosRequestConfig) => new AxiosError('Unauthenticated', 'ERR_BAD_REQUEST', config, undefined, {status: 401, statusText: 'Unauthorized', headers: {}, config, data: {detail: 'Expired'}});
afterEach(() => invalidateSession());

describe('cookie session refresh', () => {
  it('shares one refresh for concurrent expired requests and retries each with the new bearer', async () => {
    acceptSession('expired');
    const refresh = vi.spyOn(sessionClient, 'post').mockResolvedValue({data: {access: 'fresh'}});
    const adapter = vi.fn<AxiosAdapter>().mockImplementation(async config => {
      if (config.headers.Authorization !== 'Bearer fresh') throw unauthorized(config);
      return {data: 'ok', status: 200, statusText: 'OK', headers: {}, config};
    });
    const responses = await Promise.all([apiClient.get('/api/orders/', {adapter}), apiClient.get('/api/cart/', {adapter})]);
    expect(responses.map(response => response.data)).toEqual(['ok', 'ok']);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith('/api/accounts/token/refresh/', {});
    expect(localStorage.getItem('refreshToken')).toBeNull();
  });
  it('stops after one retry and announces an invalid session', async () => {
    const expired = vi.fn(); const unsubscribe = onSessionExpired(expired);
    vi.spyOn(sessionClient, 'post').mockResolvedValue({data: {access: 'still-invalid'}});
    const adapter = vi.fn<AxiosAdapter>().mockImplementation(async config => {throw unauthorized(config);});
    try {
      await expect(apiClient.get('/api/orders/', {adapter})).rejects.toBeInstanceOf(AxiosError);
      expect(adapter).toHaveBeenCalledTimes(2);
      expect(expired).toHaveBeenCalledTimes(1);
      expect(apiClient.defaults.headers.common.Authorization).toBeUndefined();
    } finally {unsubscribe();}
  });
  it('does not clear a session when the refresh service has a temporary network failure', async () => {
    acceptSession('expired');
    const expired = vi.fn(); const unsubscribe = onSessionExpired(expired);
    vi.spyOn(sessionClient, 'post').mockRejectedValue(new AxiosError('Offline', 'ERR_NETWORK'));
    try {
      await expect(refreshAccessToken()).rejects.toThrow('Offline');
      expect(expired).not.toHaveBeenCalled();
      expect(apiClient.defaults.headers.common.Authorization).toBe('Bearer expired');
    } finally {unsubscribe();}
  });
  it('does not let a refresh response restore a session after logout', async () => {
    let finish!: (value: {data: {access: string}}) => void;
    vi.spyOn(sessionClient, 'post').mockReturnValue(new Promise(resolve => {finish = resolve;}));
    const refresh = refreshAccessToken();
    invalidateSession();
    finish({data: {access: 'too-late'}});
    await expect(refresh).rejects.toThrow('Session changed');
    expect(apiClient.defaults.headers.common.Authorization).toBeUndefined();
  });
  it('restores the cookie session without reading legacy tokens from storage', async () => {
    localStorage.setItem('accessToken', 'legacy'); localStorage.setItem('refreshToken', 'legacy-refresh');
    const post = vi.spyOn(sessionClient, 'post').mockResolvedValue({data: {access: 'cookie-access'}});
    vi.spyOn(apiClient, 'get').mockResolvedValue({data: {id: 4, email: 'cookie@example.com'}});
    const store = makeStore();
    await store.dispatch(bootstrapSession());
    expect(post).toHaveBeenCalledWith('/api/accounts/token/refresh/', {});
    expect(store.getState().auth).toMatchObject({initialized: true, accessToken: 'cookie-access', user: {id: 4}});
    expect(localStorage.getItem('accessToken')).toBeNull(); expect(localStorage.getItem('refreshToken')).toBeNull();
  });
  it('does not let anonymous bootstrap failure cancel a new login', async () => {
    let failRefresh!: (reason: unknown) => void;
    let finishLogin!: (value: {data: {access: string; user: {id: number}}}) => void;
    vi.spyOn(sessionClient, 'post').mockReturnValue(new Promise((_, reject) => {failRefresh = reject;}));
    vi.spyOn(apiClient, 'post').mockReturnValue(new Promise(resolve => {finishLogin = resolve;}));
    const refresh = refreshAccessToken().catch(() => null);
    const store = makeStore();
    const signingIn = store.dispatch(login({email: 'user@example.com', password: 'password'}));
    failRefresh({isAxiosError: true, response: {status: 401}});
    await refresh;
    finishLogin({data: {access: 'new-login', user: {id: 9}}});
    await signingIn;
    expect(store.getState().auth.user?.id).toBe(9);
    expect(apiClient.defaults.headers.common.Authorization).toBe('Bearer new-login');
  });
  it('clears private basket and identity on logout even if the server is unreachable', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({data: {access: 'access', user: {id: 1}}}).mockRejectedValueOnce(new Error('offline'));
    const store = makeStore();
    await store.dispatch(login({email: 'test@example.com', password: 'password'}));
    store.dispatch(fetchCart.fulfilled({items: [{id: 1, variant: null, quantity: 1, line_total: '10'}]}, 'basket'));
    await store.dispatch(logout());
    expect(store.getState().auth.user).toBeNull();
    expect(store.getState().auth.logoutError).toContain('server logout could not be confirmed');
    expect(store.getState().cart.items).toEqual([]);
    expect(apiClient.post).toHaveBeenLastCalledWith('/api/accounts/logout/', {});
  });
});
