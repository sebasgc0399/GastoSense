import { useEffect, useState } from 'react';
import type { Budget } from '../types';

interface Props {
  month: string;
  totalExpense: number;
  budget: Budget | null;
  onSave: (total: number) => Promise<void>;
  loading?: boolean;
}

export function BudgetCard({ month, totalExpense, budget, onSave, loading }: Props) {
  const [value, setValue] = useState(budget?.total ?? 0);
  const target = value || budget?.total || 0;
  const progress = target > 0 ? Math.min(totalExpense / target, 1.2) : 0;
  const alertLevel = progress >= 1 ? 'max' : progress >= 0.8 ? 'warn' : 'ok';

  useEffect(() => {
    const next = budget?.total ?? 0;
    if (next !== value) {
      setValue(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budget?.total]);

  const handleSave = async () => {
    if (!value || value <= 0) return;
    await onSave(value);
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase text-[var(--muted)]">Presupuesto {month}</p>
          <h3 className="text-lg font-semibold text-white">Control mensual</h3>
        </div>
        {budget?.updatedAt && (
          <p className="text-[11px] text-[var(--muted)]">
            Actualizado:{' '}
            {new Date(budget.updatedAt).toLocaleString('es-ES', {
              dateStyle: 'short',
              timeStyle: 'short',
            })}
          </p>
        )}
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-sm text-[var(--muted)]">
          <span>Gastado</span>
          <span className="text-white">
            ${totalExpense.toLocaleString()} / {target ? `$${target.toLocaleString()}` : 'sin definir'}
          </span>
        </div>
        <div className="mt-1 h-3 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full rounded-full ${
              alertLevel === 'ok' ? 'bg-emerald-500' : alertLevel === 'warn' ? 'bg-amber-500' : 'bg-red-500'
            }`}
            style={{ width: `${Math.min(progress * 100, 120)}%` }}
          />
        </div>
        {alertLevel !== 'ok' && (
          <p className="mt-1 text-xs font-semibold text-red-200">
            {alertLevel === 'warn'
              ? 'Alerta: superaste el 80% de tu presupuesto.'
              : 'Alerta: alcanzaste o superaste el 100% del presupuesto.'}
          </p>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold text-[var(--muted)]">Presupuesto total</label>
          <input
            type="number"
            value={value}
            onChange={(e) => setValue(Number(e.target.value))}
            className="input"
            placeholder="Ej. 1500000"
          />
        </div>
        <div className="flex items-end">
          <button
            onClick={handleSave}
            disabled={loading || !value}
            className="w-full rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-sky-600 disabled:opacity-60"
          >
            {loading ? 'Guardando...' : 'Guardar presupuesto'}
          </button>
        </div>
      </div>
    </div>
  );
}
