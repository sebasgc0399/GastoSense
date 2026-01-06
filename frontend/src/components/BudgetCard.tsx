import { useEffect, useState, type CSSProperties } from 'react';
import { formatPesos } from '../utils/format';
import type { Budget } from '../types';

interface Props {
  month: string;
  totalExpense: number;
  budget: Budget | null;
  onSave: (total: number) => Promise<void>;
  loading?: boolean;
}

export function BudgetCard({ month, totalExpense, budget, onSave, loading }: Props) {
  const [value, setValue] = useState(String(budget?.total ?? 0));
  const numericValue = value === '' ? 0 : Number(value);
  const safeValue = Number.isFinite(numericValue) ? numericValue : 0;
  const target = safeValue || budget?.total || 0;
  const progress = target > 0 ? Math.min(totalExpense / target, 1.2) : 0;
  const alertLevel = progress >= 1 ? 'max' : progress >= 0.8 ? 'warn' : 'ok';
  const percentUsed = target > 0 ? Math.round((totalExpense / target) * 100) : 0;
  const excess = target > 0 && totalExpense > target ? totalExpense - target : 0;
  const canSave = safeValue > 0;
  const progressStyle = { '--pct': `${Math.min(progress * 100, 120)}%` } as CSSProperties;

  useEffect(() => {
    const next = budget?.total ?? 0;
    const nextValue = String(next);
    if (nextValue !== value) {
      setValue(nextValue);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budget?.total]);

  const handleSave = async () => {
    if (!canSave) return;
    await onSave(safeValue);
  };

  return (
    <div className="card">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-[var(--text)]">Control mensual</h3>
          <p className="text-xs uppercase text-[var(--text-muted)]">Presupuesto {month}</p>
        </div>
        {budget?.updatedAt && (
          <p className="text-[11px] text-[var(--text-muted)] sm:text-right">
            Actualizado:{' '}
            {new Date(budget.updatedAt).toLocaleString('es-ES', {
              dateStyle: 'short',
              timeStyle: 'short',
            })}
          </p>
        )}
      </div>

      <div className="mt-3 rounded-lg surface-soft px-3 py-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-xs uppercase text-[var(--text-muted)]">Gastado</span>
          <span className="font-semibold text-[var(--text)]">
            {formatPesos(totalExpense)} / {target > 0 ? formatPesos(target) : 'Sin definir'}
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between text-[11px] text-[var(--text-muted)]">
          <span>{target > 0 ? `${percentUsed}% usado` : 'Sin tope definido'}</span>
          {excess > 0 && <span className="font-semibold text-[var(--error-text)]">{`Exceso: ${formatPesos(excess)}`}</span>}
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[var(--overlay-10)]">
          <div
            className={`progress-fill h-full rounded-full ${
              alertLevel === 'ok' ? 'state-success' : alertLevel === 'warn' ? 'state-warn' : 'state-danger'
            }`}
            style={progressStyle}
          />
        </div>
        {alertLevel !== 'ok' && (
          <p
            className={`mt-2 text-xs font-semibold ${
              alertLevel === 'warn' ? 'text-[var(--warn-text)]' : 'text-[var(--error-text)]'
            }`}
          >
            {alertLevel === 'warn' ? `Vas en ${percentUsed}% del presupuesto` : 'Excediste el presupuesto'}
          </p>
        )}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <label className="mb-1 block text-xs font-semibold text-[var(--text-muted)]">Presupuesto total</label>
          <div className="relative">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-[var(--text-muted)]">
              $
            </span>
            <input
              type="number"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="input h-11 pl-10 text-left"
              placeholder="Ej. 1500000"
            />
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={loading || !canSave}
          className="h-11 w-full rounded-xl bg-primary px-4 text-sm font-semibold text-[var(--text)] hover:bg-sky-600 disabled:opacity-60 sm:w-auto"
        >
          {loading ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </div>
  );
}
