import type { Transaction, TransactionType } from '../types';
import type { CategoryResolver } from './categoryResolver';
import { resolveCanonicalCategoryId } from './categoryResolver';

export type CategorySpendMap = Record<string, number>;

export type DailyAmount = { date: string; amount: number };

export const sumByType = (transactions: Transaction[], type: TransactionType) =>
  transactions.reduce((acc, tx) => (tx.type === type ? acc + tx.amount : acc), 0);

export const hasType = (transactions: Transaction[], type: TransactionType) => transactions.some((tx) => tx.type === type);

export const buildCategorySpendMap = (
  transactions: Transaction[],
  resolver?: CategoryResolver,
): CategorySpendMap =>
  transactions.reduce<CategorySpendMap>((acc, tx) => {
    if (tx.type !== 'expense') return acc;
    const categoryId = resolveCanonicalCategoryId(tx.categoryId, resolver);
    acc[categoryId] = (acc[categoryId] || 0) + tx.amount;
    return acc;
  }, {});

export const topCategories = (spendMap: CategorySpendMap, n: number) =>
  Object.entries(spendMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([category, amount]) => ({ category, amount }));

const parseIsoDateUtc = (iso: string) => {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

export const buildDailyExpenseSeries = (transactions: Transaction[], startDate: string, endDate: string): DailyAmount[] => {
  const start = parseIsoDateUtc(startDate);
  const end = parseIsoDateUtc(endDate);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [];

  const totalsByDate: Record<string, number> = {};
  for (const tx of transactions) {
    if (tx.type !== 'expense') continue;
    if (tx.date < startDate || tx.date > endDate) continue;
    totalsByDate[tx.date] = (totalsByDate[tx.date] ?? 0) + tx.amount;
  }

  const series: DailyAmount[] = [];
  for (let cursor = start; cursor <= end; cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)) {
    const iso = cursor.toISOString().slice(0, 10);
    series.push({ date: iso, amount: totalsByDate[iso] ?? 0 });
  }
  return series;
};

export const buildCumulativeSeries = (daily: DailyAmount[]): DailyAmount[] => {
  let running = 0;
  return daily.map((day) => {
    running += day.amount;
    return { date: day.date, amount: running };
  });
};

export const daysInMonth = (month: string) => {
  const [year, monthNum] = month.split('-').map(Number);
  if (!year || !monthNum) return 0;
  return new Date(year, monthNum, 0).getDate();
};

export const idealBudgetPaceForDate = (month: string, budgetTotal: number, date: string) => {
  const days = daysInMonth(month);
  const dayOfMonth = Number(date.slice(8));
  if (!days || !dayOfMonth) return 0;
  return (budgetTotal * dayOfMonth) / days;
};

export const buildIdealBudgetPaceSeries = (dates: string[], month: string, budgetTotal: number): DailyAmount[] =>
  dates.map((date) => ({ date, amount: idealBudgetPaceForDate(month, budgetTotal, date) }));
