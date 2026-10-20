import { isAxiosError } from 'axios';

export function apiError(error: unknown, fallback: string): string {
  if (!isAxiosError(error)) return fallback;
  const extract = (value: unknown): string[] => {
    if (typeof value === 'string') return [value];
    if (Array.isArray(value)) return value.flatMap(extract);
    if (value && typeof value === 'object') return Object.values(value).flatMap(extract);
    return [];
  };
  return extract(error.response?.data).join(' ').slice(0, 500) || fallback;
}
