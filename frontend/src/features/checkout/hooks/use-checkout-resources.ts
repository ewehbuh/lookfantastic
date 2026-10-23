'use client';
import { useEffect, useState } from 'react';
import { useAppSelector } from '@/store/hooks';
import { addressesApi } from '@/features/account/api/addresses';
import type { Address } from '@/features/account/types/address';
import { paymentAvailability, type PaymentAvailability } from '../api/checkout';
import { apiError } from '@/lib/api/errors';

export function useCheckoutResources() {
  const auth = useAppSelector(state => state.auth);
  const owner = auth.initialized && !auth.loading && !auth.logoutError ? auth.user?.id ?? 'guest' : null;
  const [revision, setRevision] = useState(0);
  const [payments, setPayments] = useState<{owner: typeof owner; data: PaymentAvailability | null; error: string}>({owner: null, data: null, error: ''});
  const [addresses, setAddresses] = useState<{owner: typeof owner; items: Address[]; error: string; nextPage: number | null}>({owner: null, items: [], error: '', nextPage: null});
  const [moreBusy, setMoreBusy] = useState(false);
  useEffect(() => {
    if (owner === null) return;
    const controller = new AbortController();
    paymentAvailability(controller.signal).then(data => {if (!controller.signal.aborted) setPayments({owner, data, error: ''});})
      .catch(error => {if (!controller.signal.aborted) setPayments({owner, data: null, error: apiError(error, 'Unable to load payment methods. Please retry.')});});
    if (owner !== 'guest') addressesApi.list(1, controller.signal).then(data => {
      if (!controller.signal.aborted) setAddresses({owner, items: data.results, error: '', nextPage: data.next ? 2 : null});
    }).catch(error => {if (!controller.signal.aborted) setAddresses({owner, items: [], nextPage: null, error: apiError(error, 'Unable to load saved addresses. Enter shipping details manually or retry.')});});
    return () => controller.abort();
  }, [owner, revision]);
  const methods = owner !== null && payments.owner === owner ? payments : null;
  const book = owner !== null && owner !== 'guest' && addresses.owner === owner ? addresses : null;
  // Pagination uses local API URLs rather than following backend-provided hosts.
  const loadMore = async () => {
    if (!book?.nextPage || moreBusy) return;
    setMoreBusy(true);
    const capturedOwner = owner;
    try {
      const data = await addressesApi.list(book.nextPage);
      setAddresses(current => current.owner !== capturedOwner ? current : {...current,
        items: [...current.items, ...data.results.filter(item => !current.items.some(old => old.id === item.id))],
        nextPage: data.next ? book.nextPage!+1 : null, error: ''});
    } catch (error) {setAddresses(current => current.owner !== capturedOwner ? current : {...current, error: apiError(error, 'Unable to load more addresses. Please retry.')});}
    finally {setMoreBusy(false);}
  };
  return {owner, methods, book, moreBusy, loadMore, retry: () => {setPayments({owner: null, data: null, error: ''}); setAddresses({owner: null, items: [], error: '', nextPage: null}); setRevision(value => value+1);}};
}
