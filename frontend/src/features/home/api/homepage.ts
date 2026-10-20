import { catalogue } from '@/features/catalogue/api/server';

export async function fetchHomepage() {
  try {
    return await catalogue.homepage();
  } catch {
    return null;
  }
}
