import type React from 'react';
import { TransactionFilters } from '../components/TransactionFilters';
import { CardMini } from '../components/stats/CardMini';
import type { Budget, Transaction } from '../types';

interface TransactionsPageProps {
  transactions: Transaction[];
  filters: { startDate: string; endDate: string; category: string };
  handleFiltersChange: (next: { startDate: string; endDate: string; category: string }) => void;
  error: string | null;
  paginatedTransactions: Transaction[];
  txPageSize: number;
  txPage: number;
  totalTxPages: number;
  setTxPage: React.Dispatch<React.SetStateAction<number>>;
  budget: Budget | null;
  categorySpendMap: Record<string, number>;
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
  setSelectedTx,
  handleDeleteTransaction,
}: TransactionsPageProps) {
  return (
    <section className="space-y-4 pb-5">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-white">Movimientos</h2>
        <p className="text-xs text-slate-400">Filtra por fecha o categoría.</p>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <CardMini
          title="Gasto (filtro)"
          value={transactions.filter((t) => t.type === 'expense').reduce((a, t) => a + t.amount, 0)}
        />
        <CardMini
          title="Ingreso (filtro)"
          value={transactions.filter((t) => t.type === 'income').reduce((a, t) => a + t.amount, 0)}
          tone="success"
        />
        <CardMini
          title="Saldo (filtro)"
          value={transactions.reduce((a, t) => a + (t.type === 'income' ? t.amount : -t.amount), 0)}
          tone={
            transactions.reduce((a, t) => a + (t.type === 'income' ? t.amount : -t.amount), 0) >= 0 ? 'success' : 'danger'
          }
        />
      </div>

      <TransactionFilters
        startDate={filters.startDate}
        endDate={filters.endDate}
        category={filters.category}
        onChange={handleFiltersChange}
      />

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="space-y-2">
        {transactions.length === 0 && (
          <p className="rounded-xl border border-dashed border-white/10 bg-white/5 px-3 py-3 text-sm text-slate-200">
            Aún no hay movimientos en este rango. Agrega el primero.
          </p>
        )}
        {paginatedTransactions.map((tx) => (
          <div
            key={tx.id}
            className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-3 shadow-sm"
          >
            <div>
              <p className="text-sm font-semibold text-white">
                {tx.note || tx.category} • {tx.category}
              </p>
              <p className="text-xs text-slate-400">
                {tx.date} • {tx.paymentMethod}
              </p>
              {budget?.perCategory?.[tx.category] && (
                <p className="text-[11px] text-slate-300">
                  Presupuesto cat: ${budget.perCategory[tx.category].toLocaleString()} • Gastado:{' '}
                  {(categorySpendMap[tx.category] || 0).toLocaleString()}
                </p>
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
                {budget?.perCategory?.[tx.category] && (
                  <span
                    className={`rounded-full px-2 py-1 ${
                      categorySpendMap[tx.category] >= budget.perCategory[tx.category]
                        ? 'bg-red-500/10 text-red-200'
                        : categorySpendMap[tx.category] / budget.perCategory[tx.category] >= 0.8
                          ? 'bg-amber-500/10 text-amber-200'
                          : 'bg-emerald-500/10 text-emerald-200'
                    }`}
                  >
                    Cat{' '}
                    {Math.round(
                      Math.min((categorySpendMap[tx.category] / budget.perCategory[tx.category]) * 100, 150),
                    )}
                    %
                  </span>
                )}
              </div>
              <div className="mt-1 flex justify-end gap-2 text-[11px]">
                <button className="text-primary" onClick={() => setSelectedTx(tx)}>
                  Editar
                </button>
                <button className="text-red-300" onClick={() => handleDeleteTransaction(tx.id)}>
                  Borrar
                </button>
              </div>
            </div>
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
    </section>
  );
}
