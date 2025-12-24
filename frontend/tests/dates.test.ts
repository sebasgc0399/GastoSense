import { describe, expect, it } from 'vitest';

import { monthRangeIso } from '../src/utils/dates';

describe('monthRangeIso', () => {
  it('returns the full month range for non-current months', () => {
    expect(monthRangeIso('2025-11', '2025-12-18')).toEqual({
      startDate: '2025-11-01',
      endDate: '2025-11-30',
    });
  });

  it('uses nowIso as the end date for the current month', () => {
    expect(monthRangeIso('2025-12', '2025-12-18')).toEqual({
      startDate: '2025-12-01',
      endDate: '2025-12-18',
    });
  });
});

