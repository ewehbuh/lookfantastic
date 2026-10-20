'use client';

import { useState } from 'react';
import { Provider } from 'react-redux';
import { makeStore, type AppStore } from '@/store/store';
import AuthLoader from '@/features/auth/components/AuthLoader';

export function Providers({children}: {children: React.ReactNode}) {
  const [store] = useState<AppStore>(makeStore);
  return <Provider store={store}>
    <AuthLoader />
    {children}
  </Provider>;
}
