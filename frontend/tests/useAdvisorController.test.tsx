import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAdvisorController } from '../src/hooks/useAdvisorController';
import type { IaQuota } from '../src/types';
import { callAnalyzeSummary } from '../src/services/functions';
import { setUserAdvisorMode } from '../src/services/users';

vi.mock('../src/services/functions', () => ({
  callAnalyzeSummary: vi.fn(),
  callAnalyzeMonthlyDeep: vi.fn(),
}));

vi.mock('../src/services/transactions', () => ({
  fetchTransactionsRange: vi.fn(),
}));

vi.mock('../src/services/users', () => ({
  setUserAdvisorMode: vi.fn(),
}));

describe('useAdvisorController', () => {
  const callAnalyzeSummaryMock = vi.mocked(callAnalyzeSummary);
  const setUserAdvisorModeMock = vi.mocked(setUserAdvisorMode);

  const baseQuota: IaQuota = {
    role: 'paid_byok',
    parseUsed: 0,
    parseLimit: 10,
    analyzeUsed: 0,
    analyzeLimit: 10,
    week: '2025-W50',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('handleToneChange resets chat and persists localStorage', async () => {
    setUserAdvisorModeMock.mockResolvedValue('reganon');

    const { result } = renderHook(() =>
      useAdvisorController({
        userId: 'u1',
        profileAdvisorMode: undefined,
        userRole: 'paid_byok',
        iaQuota: baseQuota,
        currentMonth: '2025-12',
        monthlyExpense: 100,
        monthlyIncome: 50,
        topCategories: [{ category: 'Food', amount: 100 }],
        budgetTotal: null,
        budgetPerCategory: null,
        previousMonth: null,
        lastTransactions: [],
        openUpgrade: vi.fn(),
        triggerUpgradeOnce: vi.fn(),
        mapAiError: () => 'err',
        isResourceExhausted: () => false,
        refreshQuota: vi.fn().mockResolvedValue(undefined),
      }),
    );

    act(() => result.current.pushFeedItem({ from: 'ia', text: 'hola', kind: 'ia' }));
    expect(result.current.chatFeed).toHaveLength(1);

    await act(async () => {
      await result.current.handleToneChange('reganon');
    });

    expect(result.current.chatFeed).toHaveLength(0);
    expect(localStorage.getItem('advisorMode')).toBe('reganon');
    expect(setUserAdvisorModeMock).toHaveBeenCalledWith('reganon');
  });

  it('analyzeExhausted triggers openUpgrade and skips analyze', async () => {
    const openUpgrade = vi.fn();
    const refreshQuota = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useAdvisorController({
        userId: 'u1',
        profileAdvisorMode: undefined,
        userRole: 'paid_byok',
        iaQuota: { ...baseQuota, analyzeUsed: 10, analyzeLimit: 10 },
        currentMonth: '2025-12',
        monthlyExpense: 100,
        monthlyIncome: 50,
        topCategories: [{ category: 'Food', amount: 100 }],
        budgetTotal: null,
        budgetPerCategory: null,
        previousMonth: null,
        lastTransactions: [],
        openUpgrade,
        triggerUpgradeOnce: vi.fn(),
        mapAiError: () => 'err',
        isResourceExhausted: () => false,
        refreshQuota,
      }),
    );

    await act(async () => {
      await result.current.handleAdvisorAction('Resumen semanal');
    });

    expect(openUpgrade).toHaveBeenCalledWith('analyze_exhausted');
    expect(callAnalyzeSummaryMock).not.toHaveBeenCalled();
    expect(refreshQuota).not.toHaveBeenCalled();
  });

  it('sanitizes lastTransactions before calling callAnalyzeSummary', async () => {
    const refreshQuota = vi.fn().mockResolvedValue(undefined);
    callAnalyzeSummaryMock.mockResolvedValue({ data: { message: 'ok' } } as never);

    const { result } = renderHook(() =>
      useAdvisorController({
        userId: 'u1',
        profileAdvisorMode: undefined,
        userRole: 'paid_byok',
        iaQuota: baseQuota,
        currentMonth: '2025-12',
        monthlyExpense: 100,
        monthlyIncome: 50,
        topCategories: [{ category: 'Food', amount: 100 }],
        budgetTotal: 200,
        budgetPerCategory: null,
        previousMonth: { expense: 90, income: 40 },
        lastTransactions: [
          { amount: 10, category: 'Snack', type: 'expense', date: '2025-12-10', note: 'secret' } as never,
          { amount: 20, category: 'Taxi', type: 'expense', date: '2025-12-09', merchant: 'X' } as never,
          { amount: 30, category: 'Salary', type: 'income', date: '2025-12-08', rawText: 'nope' } as never,
          { amount: 40, category: 'Other', type: 'expense', date: '2025-12-07', extra: true } as never,
        ],
        openUpgrade: vi.fn(),
        triggerUpgradeOnce: vi.fn(),
        mapAiError: () => 'err',
        isResourceExhausted: () => false,
        refreshQuota,
      }),
    );

    await act(async () => {
      await result.current.handleAdvisorAction('Resumen semanal');
    });

    expect(callAnalyzeSummaryMock).toHaveBeenCalledTimes(1);

    const arg = callAnalyzeSummaryMock.mock.calls[0]?.[0] as {
      summary?: { lastTransactions?: Array<Record<string, unknown>> };
    };
    const last = arg.summary?.lastTransactions ?? [];

    expect(last).toHaveLength(3);
    last.forEach((tx) => {
      expect(Object.keys(tx).sort()).toEqual(['amount', 'category', 'date', 'type']);
    });
    expect(refreshQuota).toHaveBeenCalledTimes(1);
  });
});

