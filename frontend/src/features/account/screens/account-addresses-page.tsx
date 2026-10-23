'use client';
import { useEffect, useState } from 'react';
import { addressesApi } from '../api/addresses';
import { emptyAddress, type Address, type AddressInput, type AddressPage } from '../types/address';
import { apiError } from '@/lib/api/errors';

export default function AccountAddressesPage() {
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [resource, setResource] = useState<{page: number; data: AddressPage | null; error: string}>({page: 0, data: null, error: ''});
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<AddressInput>({...emptyAddress});
  const [editing, setEditing] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    addressesApi.list(page, controller.signal).then(data => {
      if (!controller.signal.aborted) setResource({page, data, error: ''});
    }).catch(error => {
      if (!controller.signal.aborted) setResource({page, data: null, error: apiError(error, 'Unable to load addresses. Please try again.')});
    });
    return () => controller.abort();
  }, [page, revision]);
  const loading = resource.page !== page;
  const reload = () => {setResource({page: 0, data: null, error: ''}); setPage(1); setRevision(value => value+1);};
  const mutate = async (operation: () => Promise<unknown>, success: string) => {
    setBusy(true); setError(''); setMessage('');
    try {await operation(); setMessage(success); reload(); return true;}
    catch (error) {setError(apiError(error, 'Unable to save this change. Please try again.')); return false;}
    finally {setBusy(false);}
  };
  const edit = (address: Address) => {
    const {id, ...input} = address;
    setEditing(id); setForm(input); setError(''); setMessage('');
  };
  return <section className="max-w-3xl mx-auto p-4 py-10">
    <h1 className="text-2xl font-bold mb-6">Address book</h1>
    {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
    {loading && <p role="status">Loading addresses…</p>}
    {resource.error && <div role="alert">{resource.error} <button className="underline" onClick={reload}>Retry addresses</button></div>}
    {!loading && resource.data?.results.length === 0 && <p>No saved addresses yet.</p>}
    {!loading && resource.data?.results.map(address => <article key={address.id} className="border p-4 my-3">
      <h2 className="font-bold">{address.label || address.full_name}{address.is_default ? ' · Default' : ''}</h2>
      <p>{address.full_name}</p><p>{address.line1} {address.line2}</p><p>{address.city}, {address.postcode}, {address.country}</p><p>{address.phone}</p>
      <div className="flex flex-wrap gap-4 mt-3">
        <button disabled={busy} className="underline" onClick={() => edit(address)}>Edit {address.label || address.full_name}</button>
        {!address.is_default && <button disabled={busy} className="underline" onClick={() => void mutate(() => addressesApi.update(address.id, {is_default: true}), 'Default address updated.')}>Make {address.label || address.full_name} default</button>}
        <button disabled={busy} className="underline" onClick={() => setDeleting(address.id)}>Delete {address.label || address.full_name}</button>
      </div>
      {deleting === address.id && <div className="mt-3"><p>Delete this saved address?</p>
        <button disabled={busy} className="border p-2 mr-3" onClick={async () => {if (await mutate(() => addressesApi.remove(address.id), 'Address deleted.')) {
          setDeleting(null); if (editing === address.id) {setEditing(null); setForm({...emptyAddress});}
        }}}>Confirm delete</button><button disabled={busy} onClick={() => setDeleting(null)}>Cancel delete</button></div>}
    </article>)}
    {!loading && resource.data && <nav aria-label="Address pagination" className="flex gap-4 my-6">
      {resource.data.previous && <button disabled={busy} onClick={() => setPage(value => value-1)}>Previous addresses</button>}
      {resource.data.next && <button disabled={busy} onClick={() => setPage(value => value+1)}>Next addresses</button>}
    </nav>}
    <h2 className="text-xl font-bold mt-8 mb-4">{editing ? 'Edit address' : 'Add address'}</h2>
    <form className="space-y-3" onSubmit={async event => {
      event.preventDefault();
      const payload = {...form, country: form.country.toUpperCase()};
      if (await mutate(() => editing ? addressesApi.update(editing, payload) : addressesApi.create(payload), editing ? 'Address updated.' : 'Address added.')) {
        setEditing(null); setForm({...emptyAddress});
      }
    }}>
      {([
        ['label', 'Label', 80, false], ['full_name', 'Full name', 100, true], ['line1', 'Address line 1', 150, true],
        ['line2', 'Address line 2', 100, false], ['city', 'City', 100, true], ['postcode', 'Postcode', 20, true],
        ['country', 'Country code', 2, true], ['phone', 'Phone', 30, false],
      ] as const).map(([key, label, maxLength, required]) => <label key={key} className="block">{label}
        <input className="w-full border p-2" disabled={busy} value={form[key]} required={required} maxLength={maxLength}
          pattern={key === 'country' ? '[A-Za-z]{2}' : undefined} onChange={event => setForm({...form, [key]: event.target.value})} />
      </label>)}
      <label className="block"><input type="checkbox" checked={form.is_default} disabled={busy} onChange={event => setForm({...form, is_default: event.target.checked})} /> Use as default address</label>
      <button disabled={busy} className="bg-brand-ink text-brand-paper p-3">{busy ? 'Saving…' : editing ? 'Save address' : 'Add address'}</button>
      {editing && <button type="button" disabled={busy} className="ml-4 underline" onClick={() => {setEditing(null); setForm({...emptyAddress});}}>Cancel editing</button>}
    </form>
  </section>;
}
