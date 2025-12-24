import { useCallback, useEffect, useState } from 'react';
import { getBudget, saveBudgetPerCategory, saveBudgetTotal } from '../services/budgets';
import type { Budget } from '../types';

export interface UseBudgetControllerParams {
  userId: string | null | undefined;
  currentMonth: string;
}

export interface BudgetControllerResult {
  budget: Budget | null;
  budgetSaving: boolean;
  handleSaveBudget: (total: number) => Promise<void>;
  handleSaveCategoryBudgets: (perCategory: Record<string, number>) => Promise<void>;
}

export function useBudgetController({ userId, currentMonth }: UseBudgetControllerParams): BudgetControllerResult {
  const [budget, setBudget] = useState<Budget | null>(null);
  const [budgetSaving, setBudgetSaving] = useState(false);

  useEffect(() => {
    const fetchBudgetData = async () => {
      try {
        if (!userId) return;
        const data = await getBudget(userId, currentMonth);
        setBudget(data);
      } catch (err) {
        console.error(err);
      }
    };
    void fetchBudgetData();
  }, [currentMonth, userId]);

  const handleSaveBudget = useCallback(
    async (total: number) => {
      setBudgetSaving(true);
      try {
        if (!userId) return;
        await saveBudgetTotal({ uid: userId, month: currentMonth, total });
        const updated = await getBudget(userId, currentMonth);
        setBudget(updated);
      } catch (err) {
        console.error(err);
      } finally {
        setBudgetSaving(false);
      }
    },
    [currentMonth, userId],
  );

  const handleSaveCategoryBudgets = useCallback(
    async (perCategory: Record<string, number>) => {
      setBudgetSaving(true);
      try {
        if (!userId) return;
        await saveBudgetPerCategory({ uid: userId, month: currentMonth, perCategory });
        const updated = await getBudget(userId, currentMonth);
        setBudget(updated);
      } catch (err) {
        console.error(err);
        throw err;
      } finally {
        setBudgetSaving(false);
      }
    },
    [currentMonth, userId],
  );

  return {
    budget,
    budgetSaving,
    handleSaveBudget,
    handleSaveCategoryBudgets,
  };
}
