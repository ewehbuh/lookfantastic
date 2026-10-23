import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');
const nextConfig: NextConfig = {
  async headers() {
    return ['/orders/access', '/checkout/success', '/:locale/orders/access', '/:locale/checkout/success'].map(source => ({
      source,
      headers: [{key: 'Referrer-Policy', value: 'no-referrer'}],
    }));
  },
};
export default withNextIntl(nextConfig);
