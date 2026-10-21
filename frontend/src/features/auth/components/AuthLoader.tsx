'use client';
import { useEffect } from 'react';
import { useAppDispatch } from '@/store/hooks';
import { bootstrapSession, sessionExpired } from '../state/auth-slice';
import { onSessionExpired } from '@/lib/api/client';

export default function AuthLoader() {
  const dispatch = useAppDispatch();
  useEffect(() => {
    const unsubscribe = onSessionExpired(() => dispatch(sessionExpired()));
    void dispatch(bootstrapSession());
    return unsubscribe;
  }, [dispatch]);
  return null;
}
