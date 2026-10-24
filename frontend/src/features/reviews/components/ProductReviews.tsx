'use client';
import { useEffect, useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { useAppSelector } from '@/store/hooks';
import { reviewsApi, type Review, type ReviewInput, type ReviewPage } from '../api/reviews';
import { apiError } from '@/lib/api/errors';
const blank: ReviewInput = {rating: 5, title: '', body: ''};
export default function ProductReviews({productId}: {productId: number}) {
  const auth = useAppSelector(state => state.auth);
  if (!auth.initialized || auth.loading) return <p role="status">Loading reviews…</p>;
  if (auth.logoutError) return <p>Confirm logout before loading reviews.</p>;
  return <ReviewsPanel key={`${auth.user?.id ?? 'guest'}-${productId}`} productId={productId} signedIn={Boolean(auth.user)} />;
}
function ReviewsPanel({productId, signedIn}: {productId: number; signedIn: boolean}) {
  const router = useRouter();
  const [page, setPage] = useState(1); const [revision, setRevision] = useState(0);
  const [resource, setResource] = useState<{page: number; revision: number; list: ReviewPage | null; own: Review | null; error: string} | null>(null);
  const [form, setForm] = useState<ReviewInput>({...blank}); const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false); const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(''); const [message, setMessage] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([reviewsApi.list(productId, page, false, controller.signal), signedIn ? reviewsApi.list(productId, 1, true, controller.signal) : Promise.resolve(null)])
      .then(([list, own]) => {if (!controller.signal.aborted) setResource({page, revision, list, own: own?.results[0] ?? null, error: ''});})
      .catch(error => {if (!controller.signal.aborted) setResource({page, revision, list: null, own: null, error: apiError(error, 'Unable to load reviews. Please try again.')});});
    return () => controller.abort();
  }, [productId, page, signedIn, revision]);
  const current = resource?.page === page && resource.revision === revision ? resource : null;
  const own = current?.own?.is_owner ? current.own : null;
  const reload = () => {setPage(1); setRevision(value => value+1); router.refresh();};
  return <section className="mt-8 border-t pt-6"><h2 className="text-xl font-bold">Customer reviews</h2>
    {!current && <p role="status">Loading reviews…</p>}
    {(error || current?.error) && <p role="alert">{error || current?.error}</p>}{message && <p role="status">{message}</p>}
    {current?.list?.results.filter(review => review.is_approved || signedIn && review.is_owner).map(review => <article key={review.id} className="border-b py-4">
      <h3 className="font-semibold">{review.title}</h3><p>{review.rating} / 5{review.verified_purchase ? ' · Verified purchase' : ''}</p>
      {!review.is_approved && <p>Pending moderation · visible only to you</p>}<p className="whitespace-pre-line">{review.body}</p>
    </article>)}
    {current?.list?.results.length === 0 && <p>No reviews yet.</p>}
    <nav aria-label="Review pagination" className="flex gap-4 my-4">{current?.list?.previous && <button disabled={busy} onClick={() => setPage(value => value-1)}>Previous reviews</button>}{current?.list?.next && <button disabled={busy} onClick={() => setPage(value => value+1)}>Next reviews</button>}</nav>
    <button disabled={!current || busy} onClick={() => setRevision(value => value+1)} className="underline">Reload reviews</button>
    {!signedIn && <p className="mt-4"><Link className="underline" href="/login">Sign in to write a review</Link></p>}
    {signedIn && current?.list && <div className="mt-6">
      {own && !editing && <div><p>Your review: {own.is_approved ? 'Approved' : 'Pending moderation'}</p>
        <button disabled={busy} className="underline mr-4" onClick={() => {setForm({rating: own.rating, title: own.title, body: own.body}); setEditing(true); setMessage(''); setError('');}}>Edit your review</button>
        <button disabled={busy} className="underline" onClick={() => setDeleting(true)}>Delete your review</button>
      </div>}
      {deleting && own && <div className="my-4"><p>Delete your review?</p><button disabled={busy} onClick={async () => {
        setBusy(true); setError(''); setMessage('');
        try {await reviewsApi.remove(own.id); setDeleting(false); setEditing(false); setForm({...blank}); setMessage('Review deleted.'); reload();}
        catch (error) {setError(apiError(error, 'Unable to delete your review.'));}
        finally {setBusy(false);}
      }} className="border p-2">Confirm review deletion</button><button disabled={busy} onClick={() => setDeleting(false)} className="underline ml-3">Cancel deletion</button></div>}
      {(!own || editing) && <form className="space-y-3 mt-4" onSubmit={async event => {
        event.preventDefault(); if (busy) return; setBusy(true); setError(''); setMessage('');
        try {
          const input = {rating: form.rating, title: form.title.trim(), body: form.body.trim()};
          if (own && editing) await reviewsApi.edit(own.id, input); else await reviewsApi.create(productId, input);
          setForm({...blank}); setEditing(false); setMessage('Your review is awaiting moderation. It is not public until approved.'); reload();
        } catch (error) {setError(apiError(error, 'Unable to save your review. Please try again.'));}
        finally {setBusy(false);}
      }}>
        <h3 className="font-bold">{editing ? 'Edit review' : 'Write a review'}</h3>
        <label className="block">Rating<select className="block border p-2" disabled={busy} value={form.rating} onChange={event => setForm({...form, rating: Number(event.target.value)})}>{[5,4,3,2,1].map(value => <option key={value} value={value}>{value} / 5</option>)}</select></label>
        <label className="block">Review title<input className="w-full border p-2" required maxLength={200} disabled={busy} value={form.title} onChange={event => setForm({...form, title: event.target.value})} /></label>
        <label className="block">Review text<textarea className="w-full border p-2" required maxLength={5000} disabled={busy} value={form.body} onChange={event => setForm({...form, body: event.target.value})} /></label>
        <p className="text-sm">One review per product. Editing a review sends it back for moderation.</p>
        <button disabled={busy} className="bg-brand-ink text-brand-paper p-3">{busy ? 'Saving…' : 'Submit review'}</button>
        {editing && <button type="button" disabled={busy} className="ml-4 underline" onClick={() => setEditing(false)}>Cancel editing</button>}
      </form>}
    </div>}
  </section>;
}
