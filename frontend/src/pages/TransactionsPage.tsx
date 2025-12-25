﻿import type React from 'react';
import { useMemo, useState } from 'react';
import { CardMini } from '../components/stats/CardMini';
import { StatsSummaryCard, type SummaryItem, type SummaryTone } from '../components/stats/StatsSummaryCard';
import { DayHeader } from '../components/transactions/DayHeader';
import { ExportTransactionsModal } from '../components/transactions/ExportTransactionsModal';
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
  shouldIgnoreTransactionClick?: () => boolean;
  canExport: boolean;
  onExportLocked: () => void;
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
  shouldIgnoreTransactionClick,
  canExport,
  onExportLocked,
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
  const balanceTone: SummaryTone = balanceTotal >= 0 ? 'success' : 'danger';
  const categoryLabel =
    filters.category === 'all'
      ? 'Todas'
      : resolveCategoryLabel(filters.category, categoryResolver) ?? filters.category;
  const summaryItems: SummaryItem[] = [
    { label: 'Gasto (filtro)', value: totals.expense, tone: 'danger' },
    { label: 'Ingreso (filtro)', value: totals.income, tone: 'success' },
    { label: 'Saldo (filtro)', value: balanceTotal, tone: balanceTone },
  ];
  const [isExportOpen, setIsExportOpen] = useState(false);
  const handleExportClick = () => {
    if (canExport) {
      setIsExportOpen(true);
    } else {
      onExportLocked();
    }
  };
  const groupedTransactions = useMemo(() => {
    const groups: Array<{
      date: string;
      items: Transaction[];
      dayIncome: number;
      dayExpense: number;
      dayNet: number;
      count: number;
    }> = [];
    for (const tx of paginatedTransactions) {
      const lastGroup = groups[groups.length - 1];
      const income = tx.type === 'income' ? tx.amount : 0;
      const expense = tx.type === 'expense' ? tx.amount : 0;
      if (!lastGroup || lastGroup.date !== tx.date) {
        groups.push({
          date: tx.date,
          items: [tx],
          dayIncome: income,
          dayExpense: expense,
          dayNet: income - expense,
          count: 1,
        });
      } else {
        lastGroup.items.push(tx);
        lastGroup.dayIncome += income;
        lastGroup.dayExpense += expense;
        lastGroup.dayNet = lastGroup.dayIncome - lastGroup.dayExpense;
        lastGroup.count += 1;
      }
    }
    return groups;
  }, [paginatedTransactions]);

  return (
    <section className="space-y-4 pb-5">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-white">Movimientos</h2>
          <p className="text-xs text-slate-400">Filtra por fecha o categoría.</p>
        </div>
        <button
          type="button"
          onClick={handleExportClick}
          aria-disabled={!canExport}
          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${
            canExport
              ? 'border-white/10 bg-white/5 text-white hover:border-white/20 hover:bg-white/10'
              : 'cursor-not-allowed border-white/5 bg-white/5 text-white/60 hover:border-white/10'
          }`}
        >
          {!canExport && <span aria-hidden="true">{'\u{1F512}'}</span>}
          <span>Exportar</span>
        </button>
      </div>

      <StatsSummaryCard className="sm:hidden" items={summaryItems} />

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

      <div className="space-y-3">
        {transactions.length === 0 && (
          <p className="rounded-xl border border-dashed border-white/10 bg-white/5 px-3 py-3 text-sm text-slate-200">
            Aún no hay movimientos en este rango. Agrega el primero.
          </p>
        )}
        {groupedTransactions.map((group) => (
          <div key={group.date} className="space-y-2">
            <DayHeader
              date={group.date}
              dayIncome={group.dayIncome}
              dayExpense={group.dayExpense}
              dayNet={group.dayNet}
              count={group.count}
            />
            {group.items.map((tx) => {
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
                  showDate={false}
                  onEdit={(transaction) => {
                    if (shouldIgnoreTransactionClick?.()) return;
                    setSelectedTx(transaction);
                  }}
                  onDelete={handleDeleteTransaction}
                />
              );
            })}
          </div>
        ))}
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
      <ExportTransactionsModal
        open={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        transactions={transactions}
        filters={filters}
        budget={budget}
        categoryResolver={categoryResolver}
      />
    </section>
  );
}



