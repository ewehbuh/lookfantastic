import 'server-only';
import axios from 'axios';

// Public catalogue requests only. Never forward browser tokens through this client.
const serverApiClient = axios.create({
  baseURL: process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000',
  timeout: 10000,
});

export default serverApiClient;
