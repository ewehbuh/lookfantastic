'use client';

import { Provider } from 'react-redux';
import { store } from '@/store/store';
import AuthLoader from '@/components/account/AuthLoader';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <Provider store={store}>
      <AuthLoader />
      {children}
    </Provider>
  );
}