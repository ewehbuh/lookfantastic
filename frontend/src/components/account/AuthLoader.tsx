'use client';

import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { fetchUser } from '@/store/authSlice';

export default function AuthLoader() {
  const dispatch = useAppDispatch();
  const { accessToken, user } = useAppSelector((s) => s.auth);

  useEffect(() => {
    if (accessToken && !user) {
      dispatch(fetchUser());
    }
  }, [accessToken, user, dispatch]);

  return null; // no UI needed
}
