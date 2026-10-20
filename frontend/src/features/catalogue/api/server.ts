import 'server-only';
import serverApiClient from '@/lib/api/server';
import { createCatalogueApi } from './catalogue';

export const catalogue = createCatalogueApi(serverApiClient);
