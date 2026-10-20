'use client';
import { useAppSelector } from '@/store/hooks';
import { formatCurrency } from '@/lib/utils';

export default function Price({amount}: {amount: string | number | null | undefined}) {
  const {selected, rates, ready} = useAppSelector(state => state.currency);
  const rate = rates.find(rate => rate.currency === selected);
  const value = amount == null || String(amount).trim() === '' ? NaN : Number(amount);
  if (!ready || !rate || !Number.isFinite(value)) return <>—</>;
  return <span title="Indicative price. Confirmed totals are calculated in your basket.">{formatCurrency(value * Number(rate.rate), selected)}</span>;
}
