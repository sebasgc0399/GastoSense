import { describe, expect, it } from 'vitest';

import type { Objective } from '../src/types';
import { applyEntryToObjective, computeObjectivesSummary, reverseEntryOnObjective } from '../src/utils/objectives';

const baseGoal: Objective = {
  id: 'goal-1',
  userId: 'user-1',
  type: 'goal',
  name: 'Viaje',
  targetAmount: 1000,
  currentAmount: 200,
  status: 'active',
};

const baseDebt: Objective = {
  id: 'debt-1',
  userId: 'user-1',
  type: 'debt',
  name: 'Tarjeta',
  targetAmount: 2000,
  currentAmount: 300,
  status: 'active',
};

describe('objectives utils', () => {
  it('applies goal deposits and keeps status active', () => {
    const result = applyEntryToObjective(baseGoal, { kind: 'deposit', amount: 200 });
    expect(result.nextAmount).toBe(400);
    expect(result.nextStatus).toBe('active');
  });

  it('marks goal as completed when reaching target', () => {
    const result = applyEntryToObjective(baseGoal, { kind: 'deposit', amount: 900 });
    expect(result.nextAmount).toBe(1100);
    expect(result.nextStatus).toBe('completed');
  });

  it('blocks goal withdraw below zero', () => {
    expect(() => applyEntryToObjective(baseGoal, { kind: 'withdraw', amount: 500 })).toThrow('Saldo insuficiente.');
  });

  it('rejects non-payment entries for debt', () => {
    expect(() => applyEntryToObjective(baseDebt, { kind: 'deposit', amount: 100 })).toThrow('Tipo de movimiento invalido.');
  });

  it('reverses an entry correctly', () => {
    const objective: Objective = { ...baseGoal, currentAmount: 500 };
    const result = reverseEntryOnObjective(objective, { kind: 'deposit', amount: 200 });
    expect(result.nextAmount).toBe(300);
    expect(result.nextStatus).toBe('active');
  });

  it('computes summary totals for active items only', () => {
    const summary = computeObjectivesSummary([
      baseGoal,
      { ...baseGoal, id: 'goal-2', currentAmount: 800, status: 'completed' },
      baseDebt,
      { ...baseDebt, id: 'debt-2', currentAmount: 2000, status: 'archived' },
    ]);
    expect(summary.totalSaved).toBe(200);
    expect(summary.totalRemaining).toBe(1700);
    expect(summary.activeGoals).toHaveLength(1);
    expect(summary.activeDebts).toHaveLength(1);
  });
});
