import { describe, expect, it } from 'vitest';

import { isResourceExhausted, mapAiError } from '../src/utils/aiErrors';
import type { IaQuota } from '../src/types';

describe('utils/aiErrors', () => {
  it('isResourceExhausted detects resource-exhausted string code', () => {
    expect(isResourceExhausted({ code: 'resource-exhausted' })).toBe(true);
  });

  it('isResourceExhausted handles numeric codes consistently (no match)', () => {
    // getErrorCode() stringifies numbers, so numeric codes won't match "resource-exhausted" by default.
    expect(isResourceExhausted({ code: 8 })).toBe(false);
  });

  it('mapAiError includes parse quota counters for resource-exhausted', () => {
    const quota: IaQuota = {
      role: 'paid_byok',
      parseUsed: 3,
      parseLimit: 10,
      analyzeUsed: 0,
      analyzeLimit: 10,
    };
    const msg = mapAiError({ code: 'resource-exhausted' }, 'parse', quota);
    expect(msg).toContain('l\u00edmite');
    expect(msg).toContain('(3/10)');
  });

  it('mapAiError includes analyze quota counters for resource-exhausted', () => {
    const quota: IaQuota = {
      role: 'paid_byok',
      parseUsed: 0,
      parseLimit: 10,
      analyzeUsed: 7,
      analyzeLimit: 20,
    };
    const msg = mapAiError({ code: 'resource-exhausted' }, 'analyze', quota);
    expect(msg).toContain('l\u00edmite');
    expect(msg).toContain('(7/20)');
  });

  it('mapAiError returns permission message for permission-denied', () => {
    const msg = mapAiError({ code: 'permission-denied' }, 'parse', null);
    expect(msg).toContain('Configura tu API key');
  });
});
