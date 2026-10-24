'use client';
import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import ProductCard from '@/features/catalogue/components/ProductCard';
import { customerTools } from '../api/customer-tools';
import { useAccountPage } from '../hooks/use-account-page';
import { apiError } from '@/lib/api/errors';

export default function WishlistPage() {
  const {page, current, setPage, refresh} = useAccountPage(customerTools.wishlist, 'Unable to load your wishlist. Please try again.');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <section className="max-w-5xl mx-auto p-4 py-10"><h1 className="text-2xl font-bold mb-6">Wishlist</h1>
    {!current && <p role="status">Loading wishlist…</p>}
    {(error || current?.error) && <p role="alert">{error || current?.error}</p>}
    {current?.data?.results.length === 0 && <p>Your wishlist is empty. <Link href="/products" className="underline">Browse products</Link></p>}
    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">{current?.data?.results.map(item => <article key={item.id}>
      <ProductCard product={item.product} />
      <button disabled={busy} className="underline mt-3" onClick={async () => {
        setBusy(true); setError('');
        try {await customerTools.removeWishlist(item.id); if (page > 1 && current.data?.results.length === 1) setPage(value => value-1); else refresh();}
        catch (error) {setError(apiError(error, 'Unable to remove this wishlist item. Please try again.'));}
        finally {setBusy(false);}
      }}>Remove {item.product.name} from wishlist</button>
    </article>)}</div>
    <nav aria-label="Wishlist pagination" className="flex gap-4 my-6">
      {current?.data?.previous && <button disabled={busy} onClick={() => {setPage(value => value-1); setError('');}}>Previous wishlist page</button>}
      {current?.data?.next && <button disabled={busy} onClick={() => {setPage(value => value+1); setError('');}}>Next wishlist page</button>}
    </nav>
    <button disabled={!current || busy} className="underline" onClick={() => {setError(''); refresh();}}>Reload wishlist</button>
  </section>;
}
