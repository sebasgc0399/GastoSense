import { CategorySpendChart } from './charts/CategorySpendChart';
import type { CategorySpendItem, CategorySpendMode } from './charts/CategorySpendChart';

interface Props {
  items: CategorySpendItem[];
  mode: CategorySpendMode;
  onModeChange: (mode: CategorySpendMode) => void;
  budgetModeAvailable: boolean;
  budgetModeHelperText?: string;
  limit?: number;
  showViewAll?: boolean;
  onViewAll?: () => void;
  showModeToggle?: boolean;
}

export function TopExpensesChart({
  items,
  mode,
  onModeChange,
  budgetModeAvailable,
  budgetModeHelperText = 'Define presupuestos por categor\u00EDa para comparar.',
  limit = 3,
  showViewAll,
  onViewAll,
  showModeToggle = true,
}: Props) {
  return (
    <div className="card">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">{'Top categor\u00EDas de gasto'}</h3>
          {showModeToggle && !budgetModeAvailable && (
            <p className="mt-1 text-xs text-[var(--muted)]">{budgetModeHelperText}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
          {showViewAll && onViewAll && (
            <button className="text-xs font-semibold text-primary hover:underline" onClick={onViewAll}>
              Ver todas
            </button>
          )}

          {showModeToggle ? (
            <div className="flex rounded-lg border border-[var(--card-border)] bg-[var(--input-bg)] p-1 text-xs">
              <button
                type="button"
                aria-pressed={mode === 'spent'}
                onClick={() => onModeChange('spent')}
                className={`rounded-md px-3 py-2 font-semibold ${
                  mode === 'spent' ? 'bg-primary text-white' : 'text-[var(--text)]'
                }`}
              >
                Barras
              </button>
              <button
                type="button"
                aria-pressed={mode === 'budget'}
                disabled={!budgetModeAvailable}
                title={!budgetModeAvailable ? budgetModeHelperText : undefined}
                onClick={() => onModeChange('budget')}
                className={`rounded-md px-3 py-2 font-semibold ${
                  mode === 'budget' ? 'bg-primary text-white' : 'text-[var(--text)]'
                } ${!budgetModeAvailable ? 'cursor-not-allowed opacity-50' : ''}`}
              >
                Presupuesto
              </button>
            </div>
          ) : (
            <span className="text-xs text-[var(--muted)]">Barras proporcionales</span>
          )}
        </div>
      </div>

      <CategorySpendChart items={items} mode={mode} limit={limit} />
    </div>
  );
}
