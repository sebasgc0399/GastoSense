import { describe, expect, it } from 'vitest';

import { formatCurrency, formatDate, formatPesos, formatUsdApprox } from '../src/utils/format';

describe('utils/format', () => {
  it('formatPesos handles 0 and nullish', () => {
    expect(formatPesos(undefined)).toBe('--');
    expect(formatPesos(null)).toBe('--');
    expect(typeof formatPesos(0)).toBe('string');
    expect(formatPesos(0)).not.toBe('--');
  });

  it('formatCurrency handles 0 and nullish', () => {
    expect(formatCurrency(undefined)).toBe('--');
    expect(formatCurrency(null)).toBe('--');
    expect(typeof formatCurrency(0)).toBe('string');
    expect(formatCurrency(0)).not.toBe('--');
  });

  it('formatUsdApprox handles nullish and formats USD', () => {
    expect(formatUsdApprox(undefined)).toBe('');
    expect(formatUsdApprox(null)).toBe('');
    const formatted = formatUsdApprox(400000); // 4000 COP -> ≈ 1 USD
    expect(typeof formatted).toBe('string');
    expect(formatted.length).toBeGreaterThan(0);
    expect(formatted).toMatch(/USD|\$/);
  });

  it('formatDate returns YYYY-MM-DD or null', () => {
    const ts = Date.UTC(2025, 11, 25); // 2025-12-25
    expect(formatDate(ts)).toBe('2025-12-25');
    expect(formatDate(Number.NaN)).toBeNull();
  });
});

