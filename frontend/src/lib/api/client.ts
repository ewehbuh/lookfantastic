import 'client-only';
import axios, { type InternalAxiosRequestConfig } from 'axios';

const options = {
  timeout: 10000, withCredentials: true,
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000',
  xsrfCookieName: 'csrftoken', xsrfHeaderName: 'X-CSRFToken', withXSRFToken: true,
};
const apiClient = axios.create(options);
// Separate transport prevents refresh recursion and stale bearer headers.
export const sessionClient = axios.create(options);
let version = 0;
const expiredListeners = new Set<() => void>();
let refreshPromise: Promise<string> | null = null;
export const sessionVersion = () => version;
export function onSessionExpired(listener: () => void) {
  expiredListeners.add(listener);
  return () => {expiredListeners.delete(listener);};
}
export function setAccessToken(token: string | null) {
  if (token) apiClient.defaults.headers.common.Authorization = `Bearer ${token}`;
  else delete apiClient.defaults.headers.common.Authorization;
}
export function clearLegacyTokens() {
  try {localStorage.removeItem('accessToken'); localStorage.removeItem('refreshToken');} catch { /* Storage may be disabled. */ }
}
export function invalidateSession() {
  version += 1;
  setAccessToken(null);
  clearLegacyTokens();
}
export function acceptSession(access: string) {
  invalidateSession();
  setAccessToken(access);
}
export function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    const started = version;
    refreshPromise = sessionClient.post<{access: string}>('/api/accounts/token/refresh/', {})
      .then(({data}) => {
        if (started !== version) throw new Error('Session changed.');
        if (!data.access) throw new Error('Refresh response did not contain an access token.');
        setAccessToken(data.access);
        return data.access;
      }).catch(error => {
        if (started === version && axios.isAxiosError(error) && [401, 403].includes(error.response?.status ?? 0)) {
          invalidateSession();
          expiredListeners.forEach(listener => listener());
        }
        throw error;
      }).finally(() => {refreshPromise = null;});
  }
  return refreshPromise;
}
function publicAuth(url?: string) {
  const path = new URL(url || '/', options.baseURL).pathname;
  return ['/api/accounts/login/', '/api/accounts/register/', '/api/accounts/logout/',
    '/api/accounts/password-reset/', '/api/accounts/password-reset/confirm/',
    '/api/accounts/verify-email/', '/api/accounts/token/refresh/',
    '/api/accounts/auth/providers/', '/api/accounts/google/start/', '/api/accounts/google/'].includes(path);
}
apiClient.interceptors.request.use(config => {
  if (publicAuth(config.url)) delete config.headers.Authorization;
  return config;
});
apiClient.interceptors.response.use(response => response, async error => {
  const config = error.config as (InternalAxiosRequestConfig & {_retried?: boolean}) | undefined;
  if (error.response?.status !== 401 || !config || publicAuth(config.url)) throw error;
  if (config._retried) {
    invalidateSession(); expiredListeners.forEach(listener => listener()); throw error;
  }
  config._retried = true;
  const started = version;
  const access = await refreshAccessToken();
  if (started !== version) throw error;
  config.headers.Authorization = `Bearer ${access}`;
  return apiClient.request(config);
});
export default apiClient;
