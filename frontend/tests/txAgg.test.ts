import { describe, expect, it } from 'vitest';

import type { Transaction } from '../src/types';
import {
  buildCategorySpendMap,
  buildCumulativeSeries,
  buildDailyExpenseSeries,
  hasType,
  idealBudgetPaceForDate,
  daysInMonth,
  sumByType,
  topCategories,
} from '../src/utils/txAgg';

describe('txAgg', () => {
  const baseExpense: Transaction = {
    id: 't1',
    amount: 12000,
    categoryId: 'comida',
    type: 'expense',
    date: '2025-12-10',
    paymentMethod: 'efectivo',
  };

  const baseIncome: Transaction = {
    ...baseExpense,
    id: 't2',
    type: 'income',
    categoryId: 'salario',
    amount: 100000,
  };

  it('sumByType sums only requested type', () => {
    expect(sumByType([baseExpense, baseIncome], 'expense')).toBe(12000);
    expect(sumByType([baseExpense, baseIncome], 'income')).toBe(100000);
  });

  it('hasType detects type presence', () => {
    expect(hasType([baseExpense], 'income')).toBe(false);
    expect(hasType([baseExpense, baseIncome], 'income')).toBe(true);
  });

  it('buildCategorySpendMap aggregates expenses only', () => {
    const map = buildCategorySpendMap([
      baseExpense,
      { ...baseExpense, id: 't3', amount: 5000, categoryId: 'comida' },
      { ...baseExpense, id: 't4', amount: 7000, categoryId: 'transporte' },
      baseIncome,
    ]);

    expect(map).toEqual({ comida: 17000, transporte: 7000 });
  });

  it('topCategories returns the top N categories', () => {
    const top2 = topCategories({ comida: 17000, transporte: 7000, ocio: 2000 }, 2);
    expect(top2).toEqual([
      { category: 'comida', amount: 17000 },
      { category: 'transporte', amount: 7000 },
    ]);
  });

  it('buildDailyExpenseSeries aggregates by day and fills gaps', () => {
    const series = buildDailyExpenseSeries(
      [
        { ...baseExpense, date: '2025-12-01', amount: 1000 },
        { ...baseExpense, id: 't3', date: '2025-12-01', amount: 2000 },
        { ...baseExpense, id: 't4', date: '2025-12-03', amount: 500 },
        { ...baseIncome, id: 't5', date: '2025-12-02', amount: 9000 },
      ],
      '2025-12-01',
      '2025-12-03',
    );

    expect(series).toEqual([
      { date: '2025-12-01', amount: 3000 },
      { date: '2025-12-02', amount: 0 },
      { date: '2025-12-03', amount: 500 },
    ]);
  });

  it('buildCumulativeSeries accumulates daily totals', () => {
    const cumulative = buildCumulativeSeries([
      { date: '2025-12-01', amount: 3000 },
      { date: '2025-12-02', amount: 0 },
      { date: '2025-12-03', amount: 500 },
    ]);

    expect(cumulative).toEqual([
      { date: '2025-12-01', amount: 3000 },
      { date: '2025-12-02', amount: 3000 },
      { date: '2025-12-03', amount: 3500 },
    ]);
  });

  it('daysInMonth returns correct days (including leap year)', () => {
    expect(daysInMonth('2025-02')).toBe(28);
    expect(daysInMonth('2024-02')).toBe(29);
  });

  it('idealBudgetPaceForDate uses day / daysInMonth', () => {
    expect(idealBudgetPaceForDate('2025-02', 2800, '2025-02-14')).toBe(1400);
  });
});
