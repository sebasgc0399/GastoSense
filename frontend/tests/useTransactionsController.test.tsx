import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Transaction } from '../src/types';
import { listenTransactions } from '../src/services/transactions';
import { useTransactionsController } from '../src/hooks/useTransactionsController';

type ListenArgs = {
  userId: string;
  startDate?: string;
  endDate?: string;
  category?: string;
  onChange: (transactions: Transaction[]) => void;
  onError?: (error: Error) => void;
};

vi.mock('../src/services/transactions', () => ({
  listenTransactions: vi.fn(),
}));

describe('useTransactionsController', () => {
  const listenTransactionsMock = vi.mocked(listenTransactions);

  beforeEach(() => {
    listenTransactionsMock.mockReset();
  });

  it('swaps inverted dates and resets page in handleFiltersChange', () => {
    const { result } = renderHook(() => useTransactionsController({ userId: null }));

    act(() => result.current.setTxPage(2));
    expect(result.current.txPage).toBe(2);

    act(() =>
      result.current.handleFiltersChange({
        startDate: '2025-12-10',
        endDate: '2025-12-01',
        category: 'all',
      }),
    );

    expect(result.current.txPage).toBe(1);
    expect(result.current.filters.startDate).toBe('2025-12-01');
    expect(result.current.filters.endDate).toBe('2025-12-10');
  });

  it('paginates transactions from listener onChange', async () => {
    const unsubscribe = vi.fn();
    let lastArgs: ListenArgs | null = null;

    listenTransactionsMock.mockImplementation((args: ListenArgs) => {
      lastArgs = args;
      return unsubscribe;
    });

    const { result, unmount } = renderHook(() => useTransactionsController({ userId: 'u1', txPageSize: 2 }));

    await waitFor(() => expect(listenTransactionsMock).toHaveBeenCalledTimes(1));
    expect(lastArgs).not.toBeNull();
    const args = lastArgs!;
    expect(args.userId).toBe('u1');

    const list: Transaction[] = Array.from({ length: 5 }, (_, i) => ({
      id: `t${i + 1}`,
      amount: i + 1,
      categoryId: 'food',
      note: '',
      type: 'expense',
      date: '2025-12-01',
      paymentMethod: 'otro',
      userId: 'u1',
    }));

    act(() => args.onChange(list));

    expect(result.current.transactionsReady).toBe(true);
    expect(result.current.transactions).toHaveLength(5);
    expect(result.current.totalTxPages).toBe(3);
    expect(result.current.paginatedTransactions.map((t: Transaction) => t.id)).toEqual(['t1', 't2']);

    act(() => result.current.setTxPage(2));
    expect(result.current.paginatedTransactions.map((t: Transaction) => t.id)).toEqual(['t3', 't4']);

    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('sets error and marks ready on listener onError', async () => {
    const unsubscribe = vi.fn();
    let lastArgs: ListenArgs | null = null;

    listenTransactionsMock.mockImplementation((args: ListenArgs) => {
      lastArgs = args;
      return unsubscribe;
    });

    const { result } = renderHook(() => useTransactionsController({ userId: 'u1' }));
    await waitFor(() => expect(listenTransactionsMock).toHaveBeenCalledTimes(1));
    expect(lastArgs).not.toBeNull();
    const args = lastArgs!;

    act(() => result.current.setTxPage(2));
    expect(result.current.txPage).toBe(2);

    act(() => args.onError?.(new Error('boom')));

    expect(result.current.error).toBe('boom');
    expect(result.current.txPage).toBe(1);
    expect(result.current.transactionsReady).toBe(true);
  });
});
