'use client';
import { useAppSelector } from '@/store/hooks';

export default function BaseCurrencyLabel() {
  const {base, ready} = useAppSelector(state => state.currency);
  return <>{ready ? base.toUpperCase() : 'base currency'}</>;
}
