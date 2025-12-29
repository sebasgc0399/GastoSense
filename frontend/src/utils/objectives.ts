import type { Objective, ObjectiveEntryInput, ObjectiveEntryKind, ObjectiveStatus, ObjectiveType } from '../types';

const assertPositiveAmount = (amount: number) => {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Monto invalido.');
  }
};

const resolveObjectiveStatus = (
  status: ObjectiveStatus,
  targetAmount: number,
  currentAmount: number,
): ObjectiveStatus => {
  if (status === 'archived') return 'archived';
  if (targetAmount > 0 && currentAmount >= targetAmount) return 'completed';
  return 'active';
};

const entryDeltaForObjective = (objectiveType: ObjectiveType, kind: ObjectiveEntryKind, amount: number) => {
  assertPositiveAmount(amount);
  if (objectiveType === 'goal') {
    if (kind === 'payment') throw new Error('Tipo de movimiento invalido.');
    return kind === 'withdraw' ? -amount : amount;
  }
  if (kind !== 'payment') throw new Error('Tipo de movimiento invalido.');
  return amount;
};

export const applyEntryToObjective = (objective: Objective, entry: ObjectiveEntryInput) => {
  const delta = entryDeltaForObjective(objective.type, entry.kind, entry.amount);
  const nextAmount = objective.currentAmount + delta;
  if (nextAmount < 0) {
    throw new Error('Saldo insuficiente.');
  }
  const nextStatus = resolveObjectiveStatus(objective.status, objective.targetAmount, nextAmount);
  return { nextAmount, nextStatus, delta };
};

export const reverseEntryOnObjective = (objective: Objective, entry: ObjectiveEntryInput) => {
  const delta = entryDeltaForObjective(objective.type, entry.kind, entry.amount);
  const nextAmount = objective.currentAmount - delta;
  if (nextAmount < 0) {
    throw new Error('Saldo insuficiente.');
  }
  const nextStatus = resolveObjectiveStatus(objective.status, objective.targetAmount, nextAmount);
  return { nextAmount, nextStatus, delta: -delta };
};

export const computeObjectivesSummary = (objectives: Objective[]) => {
  const activeGoals = objectives.filter((item) => item.type === 'goal' && item.status === 'active');
  const activeDebts = objectives.filter((item) => item.type === 'debt' && item.status === 'active');
  const totalSaved = activeGoals.reduce((acc, item) => acc + item.currentAmount, 0);
  const totalRemaining = activeDebts.reduce((acc, item) => {
    const remaining = item.targetAmount - item.currentAmount;
    return acc + Math.max(0, remaining);
  }, 0);
  return { totalSaved, totalRemaining, activeGoals, activeDebts };
};
