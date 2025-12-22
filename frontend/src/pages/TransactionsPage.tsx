﻿import type React from 'react';
import { CardMini } from '../components/stats/CardMini';
import { TransactionItemCard, type BudgetState } from '../components/transactions/TransactionItemCard';
import { TransactionsFiltersPanel } from '../components/transactions/TransactionsFiltersPanel';
import type { Budget, Transaction } from '../types';
import type { CategoryResolver } from '../utils/categoryResolver';
import { resolveCanonicalCategoryId, resolveCategoryLabel } from '../utils/categoryResolver';

export interface TransactionsPageProps {
  transactions: Transaction[];
  filters: { startDate: string; endDate: string; category: string; search: string };
  handleFiltersChange: (next: { startDate: string; endDate: string; category: string; search: string }) => void;
  error: string | null;
  paginatedTransactions: Transaction[];
  txPageSize: number;
  txPage: number;
  totalTxPages: number;
  setTxPage: React.Dispatch<React.SetStateAction<number>>;
  budget: Budget | null;
  categorySpendMap: Record<string, number>;
  categoryResolver: CategoryResolver;
  userId?: string | null;
  setSelectedTx: React.Dispatch<React.SetStateAction<Transaction | null>>;
  handleDeleteTransaction: (id: string) => Promise<void>;
}

export function TransactionsPage({
  transactions,
  filters,
  handleFiltersChange,
  error,
  paginatedTransactions,
  txPageSize,
  txPage,
  totalTxPages,
  setTxPage,
  budget,
  categorySpendMap,
  categoryResolver,
  userId,
  setSelectedTx,
  handleDeleteTransaction,
}: TransactionsPageProps) {
  const totals = transactions.reduce(
    (acc, tx) => {
      if (tx.type === 'income') acc.income += tx.amount;
      else acc.expense += tx.amount;
      return acc;
    },
    { expense: 0, income: 0 },
  );
  const balanceTotal = totals.income - totals.expense;
  const balanceTone = balanceTotal >= 0 ? 'success' : 'danger';
  const balanceColor = balanceTotal >= 0 ? 'text-emerald-300' : 'text-red-300';
  const categoryLabel =
    filters.category === 'all'
      ? 'Todas'
      : resolveCategoryLabel(filters.category, categoryResolver) ?? filters.category;

  return (
    <section className="space-y-4 pb-5">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-white">Movimientos</h2>
        <p className="text-xs text-slate-400">Filtra por fecha o categoría.</p>
      </div>

      <div className="card sm:hidden">
        <p className="text-[11px] uppercase text-[var(--muted)]">Resumen</p>
        <div className="mt-2 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-xs uppercase text-[var(--muted)]">Gasto (filtro)</span>
            <span className="font-semibold text-red-300">${totals.expense.toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-xs uppercase text-[var(--muted)]">Ingreso (filtro)</span>
            <span className="font-semibold text-emerald-300">${totals.income.toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-xs uppercase text-[var(--muted)]">Saldo (filtro)</span>
            <span className={`font-semibold ${balanceColor}`}>${balanceTotal.toLocaleString()}</span>
          </div>
        </div>
      </div>

      <div className="hidden grid-cols-1 gap-2 sm:grid sm:grid-cols-3">
        <CardMini title="Gasto (filtro)" value={totals.expense} />
        <CardMini title="Ingreso (filtro)" value={totals.income} tone="success" />
        <CardMini title="Saldo (filtro)" value={balanceTotal} tone={balanceTone} />
      </div>

      <TransactionsFiltersPanel
        filters={filters}
        onChange={handleFiltersChange}
        userId={userId}
        categoryLabel={categoryLabel}
      />

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="space-y-2">
        {transactions.length === 0 && (
          <p className="rounded-xl border border-dashed border-white/10 bg-white/5 px-3 py-3 text-sm text-slate-200">
            Aún no hay movimientos en este rango. Agrega el primero.
          </p>
        )}
        {paginatedTransactions.map((tx) => {
          const canonicalCategoryId = resolveCanonicalCategoryId(tx.categoryId, categoryResolver);
          const displayCategory = resolveCategoryLabel(canonicalCategoryId, categoryResolver) ?? tx.categoryId;
          const rawBudgetValue = budget?.perCategory?.[canonicalCategoryId];
          const budgetValue =
            typeof rawBudgetValue === 'number'
              ? rawBudgetValue
              : typeof rawBudgetValue === 'string'
                ? Number(rawBudgetValue)
                : undefined;
          const hasBudgetValue = typeof budgetValue === 'number' && Number.isFinite(budgetValue);
          const budgetState: BudgetState = !hasBudgetValue ? 'none' : budgetValue > 0 ? 'limited' : 'unlimited';
          const spentInCategory = categorySpendMap[canonicalCategoryId] ?? 0;
          const percentUsed =
            budgetState === 'limited' && typeof budgetValue === 'number' && budgetValue > 0
              ? Math.round((spentInCategory / budgetValue) * 100)
              : undefined;
          const excessAmount =
            budgetState === 'limited' && typeof budgetValue === 'number' && spentInCategory > budgetValue
              ? spentInCategory - budgetValue
              : undefined;

          return (
            <TransactionItemCard
              key={tx.id}
              tx={tx}
              displayCategory={displayCategory}
              budgetState={budgetState}
              budgetValue={budgetValue}
              spentInCategory={spentInCategory}
              percentUsed={percentUsed}
              excessAmount={excessAmount}
              onEdit={(transaction) => setSelectedTx(transaction)}
              onDelete={handleDeleteTransaction}
            />
          );
        })}
        {transactions.length > txPageSize && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200">
            <button
              className="rounded-lg border border-white/20 bg-white/5 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
              onClick={() => setTxPage((p) => Math.max(1, p - 1))}
              disabled={txPage === 1}
            >
              Anterior
            </button>
            <span className="text-xs text-slate-300">
              Página {txPage} de {totalTxPages}
            </span>
            <button
              className="rounded-lg border border-white/20 bg-white/5 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
              onClick={() => setTxPage((p) => Math.min(totalTxPages, p + 1))}
              disabled={txPage >= totalTxPages}
            >
              Siguiente
            </button>
          </div>
        )}
      </div>
    </section>
  );
}



