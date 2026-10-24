'use client';
import { useEffect, useState } from 'react';
import { apiError } from '@/lib/api/errors';

export function useAccountPage<T>(load: (page: number, signal: AbortSignal) => Promise<T>, fallback: string) {
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [resource, setResource] = useState<{page: number; revision: number; data: T | null; error: string} | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    load(page, controller.signal).then(data => {if (!controller.signal.aborted) setResource({page, revision, data, error: ''});})
      .catch(error => {if (!controller.signal.aborted) setResource({page, revision, data: null, error: apiError(error, fallback)});});
    return () => controller.abort();
  }, [page, revision, load, fallback]);
  const current = resource?.page === page && resource.revision === revision ? resource : null;
  return {page, setPage, current, refresh: () => setRevision(value => value+1)};
}
