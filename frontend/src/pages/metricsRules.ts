import type { Transaction } from '../types';
import { hasType } from '../utils/txAgg';

export function shouldShowIncomeAndBalance(monthTransactions: Transaction[], monthlyIncome: number) {
  return monthlyIncome > 0 || hasType(monthTransactions, 'income');
}

