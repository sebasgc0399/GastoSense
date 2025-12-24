import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getBudget, saveBudget } from '../src/services/budgets';
import { useBudgetController } from '../src/hooks/useBudgetController';
import type { Budget } from '../src/types';

vi.mock('../src/services/budgets', () => ({
  getBudget: vi.fn(),
  saveBudget: vi.fn(),
}));

describe('useBudgetController', () => {
  const getBudgetMock = vi.mocked(getBudget);
  const saveBudgetMock = vi.mocked(saveBudget);

  beforeEach(() => {
    getBudgetMock.mockReset();
    saveBudgetMock.mockReset();
  });

  it('handleSaveBudget saves total and refreshes budget, toggling budgetSaving', async () => {
    const initial: Budget = { month: '2025-12', total: 10 };
    const updated: Budget = { month: '2025-12', total: 123 };
    getBudgetMock.mockResolvedValueOnce(initial).mockResolvedValueOnce(updated);
    saveBudgetMock.mockResolvedValue(undefined);

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

    expect(saveBudgetMock).toHaveBeenCalledWith('u1', '2025-12', { total: 123 });
    expect(getBudgetMock).toHaveBeenCalledTimes(2);
    expect(result.current.budget).toEqual(updated);
    expect(result.current.budgetSaving).toBe(false);
  });

  it('handleSaveCategoryBudgets saves perCategory with existing total and refreshes budget', async () => {
    const initial: Budget = { month: '2025-12', total: 500 };
    const updated: Budget = { month: '2025-12', total: 500, perCategory: { Food: 200 } };
    getBudgetMock.mockResolvedValueOnce(initial).mockResolvedValueOnce(updated);
    saveBudgetMock.mockResolvedValue(undefined);

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

    expect(saveBudgetMock).toHaveBeenCalledWith('u1', '2025-12', { total: 500, perCategory: { Food: 200 } });
    expect(getBudgetMock).toHaveBeenCalledTimes(2);
    expect(result.current.budget).toEqual(updated);
    expect(result.current.budgetSaving).toBe(false);
  });
});
