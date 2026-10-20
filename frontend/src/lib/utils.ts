export function formatCurrency(amount: number | string | null | undefined, currency = 'GBP') {
  const numeric = typeof amount === 'string'
    ? (amount.trim() ? Number(amount) : NaN)
    : amount;
  if (numeric == null || !Number.isFinite(numeric)) {
    return '—';          // fallback for missing/invalid amounts
  }
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(numeric);
}

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}
