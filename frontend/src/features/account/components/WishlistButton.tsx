'use client';
import { useState } from 'react';
import { useAppSelector } from '@/store/hooks';
import { Link } from '@/i18n/navigation';
import { apiError } from '@/lib/api/errors';
import { customerTools } from '../api/customer-tools';

function SaveButton({productId}: {productId: number}) {
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  return <div className="mt-4"><button disabled={busy || saved} className="border p-3" onClick={async () => {
    setBusy(true); setError('');
    try {await customerTools.addWishlist(productId); setSaved(true);}
    catch (error) {setError(apiError(error, 'Unable to save this product. Please try again.'));}
    finally {setBusy(false);}
  }}>{busy ? 'Saving…' : saved ? 'Saved to wishlist' : 'Save to wishlist'}</button>
    {error && <p role="alert">{error}</p>}{saved && <p role="status">Product saved.</p>}
    <Link href="/account/wishlist" className="ml-3 underline">View wishlist</Link>
  </div>;
}
export default function WishlistButton({productId}: {productId: number}) {
  const auth = useAppSelector(state => state.auth);
  if (!auth.initialized || auth.loading) return null;
  if (!auth.user || auth.logoutError) return <Link href="/login" className="block underline mt-4">Sign in to save this product</Link>;
  return <SaveButton key={`${auth.user.id}-${productId}`} productId={productId} />;
}
