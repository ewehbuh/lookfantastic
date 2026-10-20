'use client';

import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { fetchUser, restoreSession } from '@/features/auth/state/auth-slice';

import { setAccessToken } from '@/lib/api/client';

export default function AuthLoader() {
  const dispatch = useAppDispatch();
  const { accessToken, user } = useAppSelector((s) => s.auth);

  useEffect(() => {
    const accessToken = localStorage.getItem('accessToken');
    const refreshToken = localStorage.getItem('refreshToken');
    setAccessToken(accessToken);
    dispatch(restoreSession({accessToken, refreshToken}));
  }, [dispatch]);

  useEffect(() => {
    if (accessToken && !user) {
      dispatch(fetchUser());
    }
  }, [accessToken, user, dispatch]);

  return null; // no UI needed
}
