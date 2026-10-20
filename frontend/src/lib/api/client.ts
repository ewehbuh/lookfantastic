import 'client-only';
import axios from 'axios';

const apiClient = axios.create({
  timeout: 10000,
  withCredentials: true,
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000',
});

/**
 * Call this after login to attach the JWT to every request.
 */
export function setAccessToken(token: string | null) {
  if (token) {
    apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete apiClient.defaults.headers.common['Authorization'];
  }
}

/**
 * Request interceptor – remove the token for public auth endpoints
 * so we never send an expired/invalid token to login/register.
 */
apiClient.interceptors.request.use((config) => {
  // Public endpoints that should never receive an Authorization header
  const publicEndpoints = [
    '/api/accounts/login/',
    '/api/accounts/register/',
    '/api/accounts/password-reset/',
    '/api/accounts/password-reset-confirm/',
  ];

  const isPublic = publicEndpoints.some((endpoint) =>
    config.url?.includes(endpoint)
  );

  if (isPublic) {
    // Remove any stale token from the request
    delete config.headers.Authorization;
  }

  return config;
});

export default apiClient;
