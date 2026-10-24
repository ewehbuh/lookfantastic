'use client';
import { useEffect, useId, useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { suggestions, type Suggestion } from '../api/suggestions';
export default function SearchBox() {
  const router = useRouter(); const id = useId();
  const [value, setValue] = useState(''); const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [resource, setResource] = useState<{query: string; choices: Suggestion[]; failed: boolean} | null>(null);
  const query = value.trim();
  useEffect(() => {
    if (query.length < 2 || query.length > 200 || query.split(/\s+/).length > 10) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      suggestions(query, controller.signal).then(data => {if (!controller.signal.aborted) setResource({query, choices: data.suggestions, failed: false});})
        .catch(() => {if (!controller.signal.aborted) setResource({query, choices: [], failed: true});});
    }, 250);
    return () => {clearTimeout(timer); controller.abort();};
  }, [query]);
  const current = open && resource?.query === query ? resource : null;
  return <div className="relative w-full max-w-md"><form role="search" aria-label="Product search" className="flex gap-2" onSubmit={event => {
    event.preventDefault(); setError('');
    if (!query || query.length > 200 || query.split(/\s+/).length > 10) {setError('Enter up to 200 characters and ten search terms.'); return;}
    setOpen(false); router.push(`/search?q=${encodeURIComponent(query)}`);
  }}>
    <label htmlFor={id} className="sr-only">Search products</label>
    <input id={id} name="q" type="search" maxLength={200} autoComplete="off" value={value} className="border p-2 min-w-0 w-full" onFocus={() => setOpen(true)} onKeyDown={event => {if (event.key === 'Escape') setOpen(false);}} onChange={event => {setValue(event.target.value); setOpen(true); setError('');}} />
    <button className="border p-2">Search</button>
  </form>{error && <p role="alert">{error}</p>}
    {current && current.choices.length > 0 && <ul aria-label="Search suggestions" className="absolute z-50 w-full bg-brand-paper border shadow-lg">{current.choices.map(choice => <li key={`${choice.type}-${choice.slug}`}>
      <Link className="block p-3 hover:underline" onClick={() => setOpen(false)} href={choice.type === 'product' ? `/product/${encodeURIComponent(choice.slug)}` : `/products?brand=${encodeURIComponent(choice.slug)}`}>{choice.label} · {choice.type === 'brand' ? 'Brand' : 'Product'}</Link>
    </li>)}</ul>}
    {current?.failed && <p role="status">Suggestions unavailable. You can still submit your search.</p>}
  </div>;
}
