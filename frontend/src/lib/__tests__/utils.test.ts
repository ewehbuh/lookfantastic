import { describe, expect, it } from 'vitest';
import { formatCurrency } from '../utils';

describe('price display', () => {
  it.each([undefined, null, '', ' ', '12oops', 'Infinity', Infinity, NaN])('shows a placeholder for invalid amount %s', (amount) => {
    expect(formatCurrency(amount)).toBe('—');
  });
  it('formats backend decimal strings, zero, and the selected currency', () => {
    expect(formatCurrency('12.50')).toBe('£12.50');
    expect(formatCurrency(0)).toBe('£0.00');
    expect(formatCurrency('12.50', 'USD')).toBe('US$12.50');
  });
});
