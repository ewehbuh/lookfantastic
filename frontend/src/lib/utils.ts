export function formatCurrency(amount: number | string | null | undefined, currency = 'GBP') {
  const numeric = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (numeric == null || Number.isNaN(numeric)) {
    return '—';          // fallback for missing/invalid amounts
  }
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(numeric);
}

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}