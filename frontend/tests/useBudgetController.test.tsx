import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getBudget, saveBudgetPerCategory, saveBudgetTotal } from '../src/services/budgets';
import { useBudgetController } from '../src/hooks/useBudgetController';
import type { Budget } from '../src/types';

vi.mock('../src/services/budgets', () => ({
  getBudget: vi.fn(),
  saveBudgetTotal: vi.fn(),
  saveBudgetPerCategory: vi.fn(),
}));

describe('useBudgetController', () => {
  const getBudgetMock = vi.mocked(getBudget);
  const saveBudgetTotalMock = vi.mocked(saveBudgetTotal);
  const saveBudgetPerCategoryMock = vi.mocked(saveBudgetPerCategory);

  beforeEach(() => {
    getBudgetMock.mockReset();
    saveBudgetTotalMock.mockReset();
    saveBudgetPerCategoryMock.mockReset();
  });

  it('handleSaveBudget saves total and refreshes budget, toggling budgetSaving', async () => {
    const initial: Budget = { month: '2025-12', total: 10 };
    const updated: Budget = { month: '2025-12', total: 123 };
    getBudgetMock.mockResolvedValueOnce(initial).mockResolvedValueOnce(updated);
    saveBudgetTotalMock.mockResolvedValue(undefined);

    const { result } = renderHook(() => useBudgetController({ userId: 'u1', currentMonth: '2025-12' }));

    await waitFor(() => expect(result.current.budget).toEqual(initial));

    let promise: Promise<void>;
    act(() => {
      promise = result.current.handleSaveBudget(123);
    });

    expect(result.current.budgetSaving).toBe(true);

    await act(async () => {
      await promise;
    });

    expect(saveBudgetTotalMock).toHaveBeenCalledWith({ uid: 'u1', month: '2025-12', total: 123 });
    expect(getBudgetMock).toHaveBeenCalledTimes(2);
    expect(result.current.budget).toEqual(updated);
    expect(result.current.budgetSaving).toBe(false);
  });

  it('handleSaveCategoryBudgets saves perCategory with existing total and refreshes budget', async () => {
    const initial: Budget = { month: '2025-12', total: 500 };
    const updated: Budget = { month: '2025-12', total: 500, perCategory: { Food: 200 } };
    getBudgetMock.mockResolvedValueOnce(initial).mockResolvedValueOnce(updated);
    saveBudgetPerCategoryMock.mockResolvedValue(undefined);

    const { result } = renderHook(() => useBudgetController({ userId: 'u1', currentMonth: '2025-12' }));

    await waitFor(() => expect(result.current.budget).toEqual(initial));

    let promise: Promise<void>;
    act(() => {
      promise = result.current.handleSaveCategoryBudgets({ Food: 200 });
    });

    expect(result.current.budgetSaving).toBe(true);

    await act(async () => {
      await promise;
    });

    expect(saveBudgetPerCategoryMock).toHaveBeenCalledWith({
      uid: 'u1',
      month: '2025-12',
      perCategory: { Food: 200 },
    });
    expect(getBudgetMock).toHaveBeenCalledTimes(2);
    expect(result.current.budget).toEqual(updated);
    expect(result.current.budgetSaving).toBe(false);
  });
});
