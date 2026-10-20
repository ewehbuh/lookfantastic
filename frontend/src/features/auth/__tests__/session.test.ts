import { afterEach, describe, expect, it, vi } from 'vitest';
import apiClient, { setAccessToken } from '@/lib/api/client';
import { makeStore } from '@/store/store';
import { fetchUser, login } from '../state/auth-slice';

afterEach(() => setAccessToken(null));

describe('authentication session state', () => {
  it('uses login results for account display and subsequent API requests', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({data: {
      access: 'access-test', refresh: 'refresh-test',
      user: {pk: 3, email: 'shopper@example.com', is_staff: false},
    }});
    const store = makeStore();
    await store.dispatch(login({email: 'shopper@example.com', password: 'example-password'})).unwrap();
    expect(post).toHaveBeenCalledWith('/api/accounts/login/', {email: 'shopper@example.com', password: 'example-password'});
    expect(store.getState().auth.user).toMatchObject({id: 3, email: 'shopper@example.com', is_staff: false});
    expect(localStorage.getItem('accessToken')).toBe('access-test');
    expect(apiClient.defaults.headers.common.Authorization).toBe('Bearer access-test');
  });
  it('clears stale identity and tokens after backend session rejection', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValue({data: {access: 'expired', refresh: 'expired-refresh', user: {id: 1}}});
    vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('Session expired'));
    const store = makeStore();
    await store.dispatch(login({email: 'shopper@example.com', password: 'password'}));
    await store.dispatch(fetchUser());
    expect(store.getState().auth).toMatchObject({user: null, accessToken: null, refreshToken: null, loading: false});
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
    expect(apiClient.defaults.headers.common.Authorization).toBeUndefined();
  });
});
