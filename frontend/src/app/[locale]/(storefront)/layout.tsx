import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import PromoBanner from '@/components/layout/PromoBanner';
import CartDrawer from '@/features/cart/components/CartDrawer';

export default function StorefrontLayout({children}: {children: React.ReactNode}) {
  return <>
    <PromoBanner />
    <Header />
    <main className="min-h-screen">{children}</main>
    <Footer />
    <CartDrawer />
  </>;
}
