import { describe, expect, it } from 'vitest';

import { digitsOnly, formatCOP, parseCOP } from '../src/utils/amount';

describe('COP formatting helpers', () => {
  it('digitsOnly removes non-digits and leading zeros', () => {
    expect(digitsOnly('00-1.234.500')).toBe('1234500');
    expect(digitsOnly('000')).toBe('0');
    expect(digitsOnly('')).toBe('');
  });

  it('formatCOP adds thousands separators', () => {
    expect(formatCOP('1000000')).toBe('1.000.000');
    expect(formatCOP('1234')).toBe('1.234');
    expect(formatCOP('')).toBe('');
  });

  it('parseCOP returns numeric value', () => {
    expect(parseCOP('1.000.000')).toBe(1000000);
    expect(parseCOP('000120')).toBe(120);
    expect(parseCOP('')).toBe(0);
  });
});
