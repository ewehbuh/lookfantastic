import { afterEach, describe, expect, it } from 'vitest';
import apiClient, { setAccessToken } from '../api/client';

const capture = () => apiClient.get('/api/accounts/me/', {
  adapter: async (config) => ({data: config.headers.Authorization, status: 200, statusText: 'OK', headers: {}, config}),
});

afterEach(() => setAccessToken(null));

describe('browser API authentication', () => {
  it('sends the current bearer token and clears it on logout', async () => {
    setAccessToken('test-access');
    expect((await capture()).data).toBe('Bearer test-access');
    setAccessToken(null);
    expect((await capture()).data).toBeUndefined();
  });
  it.each(['/api/accounts/login/', '/api/accounts/register/', '/api/accounts/password-reset/'])('does not send stale authorization to %s', async (url) => {
    setAccessToken('stale-token');
    const response = await apiClient.post(url, {}, {
      adapter: async (config) => ({data: config.headers.Authorization, status: 200, statusText: 'OK', headers: {}, config}),
    });
    expect(response.data).toBeUndefined();
    expect((await capture()).data).toBe('Bearer stale-token');
  });
  it('includes cookies for guest baskets and HttpOnly refresh sessions', async () => {
    const response = await apiClient.get('/api/cart/', {
      adapter: async (config) => ({data: config.withCredentials, status: 200, statusText: 'OK', headers: {}, config}),
    });
    expect(response.data).toBe(true);
  });
});
