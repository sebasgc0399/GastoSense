import { useEffect, useState } from 'react';
import { CategorySpendChart } from './charts/CategorySpendChart';
import type { CategorySpendItem, CategorySpendMode } from './charts/CategorySpendChart';

interface Props {
  title?: string;
  items: CategorySpendItem[];
  mode: CategorySpendMode;
  onModeChange: (mode: CategorySpendMode) => void;
  budgetModeAvailable: boolean;
  budgetModeHelperText?: string;
  limit?: number;
  showViewAll?: boolean;
  onViewAll?: () => void;
  showModeToggle?: boolean;
  onEditBudgets?: () => void;
  editBudgetsLabel?: string;
  onCategoryNavigate?: (categoryId: string) => void;
  enableCategoryNavigate?: boolean;
  valueLabel?: string;
}

export function TopCategoriesChart({
  title = 'Top categor\u00edas de gasto',
  items,
  mode,
  onModeChange,
  budgetModeAvailable,
  budgetModeHelperText = 'Define presupuestos por categoría para comparar.',
  limit,
  showViewAll,
  onViewAll,
  showModeToggle = true,
  onEditBudgets,
  editBudgetsLabel = 'Editar presupuestos por categoría',
  onCategoryNavigate,
  enableCategoryNavigate,
  valueLabel,
}: Props) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(max-width: 639px)');
    const update = () => setIsMobile(mq.matches);
    update();
    if (mq.addEventListener) {
      mq.addEventListener('change', update);
      return () => mq.removeEventListener('change', update);
    }
    mq.addListener(update);
    return () => mq.removeListener(update);
  }, []);

  const resolvedLimit = typeof limit === 'number' ? limit : isMobile ? 5 : 3;
  const guideText = showModeToggle && !budgetModeAvailable ? 'Para ver Presupuesto, define topes por categoría.' : null;
  const highlightEdit = !budgetModeAvailable && onEditBudgets;
  const editButtonClass = highlightEdit
    ? 'h-9 rounded-xl border border-primary/50 bg-primary/10 px-3 text-xs font-semibold text-[var(--text)] hover:border-primary hover:bg-primary/20'
    : 'h-9 rounded-xl border border-[var(--card-border)] bg-[var(--input-bg)] px-3 text-xs font-semibold text-[var(--text)] hover:bg-white/5 hover:border-primary';
  const canViewAll = Boolean(showViewAll && onViewAll && items.length > resolvedLimit);

  return (
    <div className="card">
      <div className="mb-3 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-white">{title}</h3>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {onEditBudgets && (
              <button type="button" onClick={onEditBudgets} className={editButtonClass}>
                {editBudgetsLabel}
              </button>
            )}
            {canViewAll && (
              <button className="text-xs font-semibold text-primary hover:underline" onClick={onViewAll}>
                Ver todas
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-col">
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
            {guideText && <p className="mt-1 text-xs text-[var(--muted)]">{guideText}</p>}
          </div>
        </div>
      </div>

      <CategorySpendChart
        items={items}
        mode={mode}
        limit={resolvedLimit}
        onCategoryNavigate={onCategoryNavigate}
        enableCategoryNavigate={enableCategoryNavigate}
        valueLabel={valueLabel}
      />
    </div>
  );
}







