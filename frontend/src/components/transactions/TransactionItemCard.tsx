import type { Transaction } from '../../types';

export type BudgetState = 'none' | 'unlimited' | 'limited';

export interface TransactionItemCardProps {
  tx: Transaction;
  displayCategory: string;
  spentInCategory: number;
  budgetState: BudgetState;
  budgetValue?: number;
  percentUsed?: number;
  excessAmount?: number;
  onEdit: (tx: Transaction) => void;
  onDelete: (id: string) => void | Promise<void>;
}

export function TransactionItemCard({
  tx,
  displayCategory,
  spentInCategory,
  budgetState,
  budgetValue,
  percentUsed,
  excessAmount,
  onEdit,
  onDelete,
}: TransactionItemCardProps) {
  const hasBudget = budgetState !== 'none';
  const hasLimit = budgetState === 'limited';
  const budgetLabel = hasLimit && typeof budgetValue === 'number' ? `$${budgetValue.toLocaleString()}` : 'Sin tope';

  return (
    <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-3 shadow-sm">
      <div>
        <p className="text-sm font-semibold text-white">
          {tx.note || displayCategory} · {displayCategory}
        </p>
        <p className="text-xs text-slate-400">
          {tx.date} · {tx.paymentMethod}
        </p>
        {hasBudget && (
          <>
            <p className="text-[11px] text-slate-300">
              Presupuesto: {budgetLabel} · Gastado:{' '}
              {`$${spentInCategory.toLocaleString()}`}
            </p>
            {hasLimit && typeof excessAmount === 'number' && excessAmount > 0 && (
              <p className="text-[11px] text-slate-300">{`Exceso: $${excessAmount.toLocaleString()}`}</p>
            )}
          </>
        )}
      </div>
      <div className="text-right">
        <p className={`text-base font-bold ${tx.type === 'expense' ? 'text-red-300' : 'text-emerald-300'}`}>
          {tx.type === 'expense' ? '-' : '+'}${tx.amount.toLocaleString()}
        </p>
        <div className="mt-1 flex items-center justify-end gap-2 text-[11px]">
          <span
            className={`rounded-full px-2 py-1 ${
              tx.type === 'income' ? 'bg-emerald-500/10 text-emerald-200' : 'bg-red-500/10 text-red-200'
            }`}
          >
            {tx.type === 'income' ? 'Ingreso' : 'Gasto'}
          </span>
          {hasLimit && typeof budgetValue === 'number' && typeof percentUsed === 'number' && (
            <span
              className={`rounded-full px-2 py-1 ${
                spentInCategory >= budgetValue
                  ? 'bg-red-500/10 text-red-200'
                  : spentInCategory / budgetValue >= 0.8
                    ? 'bg-amber-500/10 text-amber-200'
                    : 'bg-emerald-500/10 text-emerald-200'
              }`}
            >
              Cat {percentUsed}%
            </span>
          )}
        </div>
        <div className="mt-1 flex justify-end gap-2 text-[11px]">
          <button className="text-primary" onClick={() => onEdit(tx)}>
            Editar
          </button>
          <button className="text-red-300" onClick={() => onDelete(tx.id)}>
            Borrar
          </button>
        </div>
      </div>
    </div>
  );
}
