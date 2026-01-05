import { useEffect, useMemo } from 'react';
import { CategorySpendChart } from './charts/CategorySpendChart';
import type { CategorySpendItem, CategorySpendMode } from './charts/CategorySpendChart';

const formatMonthLabel = (month: string) => {
  const date = new Date(`${month}-01T00:00:00`);
  if (Number.isNaN(date.getTime())) return month;
  return new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' }).format(date);
};

interface AllCategoriesModalProps {
  open: boolean;
  selectedMonth: string;
  items: CategorySpendItem[];
  mode: CategorySpendMode;
  onModeChange: (mode: CategorySpendMode) => void;
  budgetModeAvailable: boolean;
  budgetModeHelperText?: string;
  showModeToggle?: boolean;
  valueLabel?: string;
  onClose: () => void;
  onViewMovements?: (categoryId?: string, opts?: { suppressTxClick?: boolean }) => void;
}

export function AllCategoriesModal({
  open,
  selectedMonth,
  items,
  mode,
  onModeChange,
  budgetModeAvailable,
  budgetModeHelperText = 'Define presupuestos por categoria para comparar.',
  showModeToggle = true,
  valueLabel,
  onClose,
  onViewMovements,
}: AllCategoriesModalProps) {
  const monthLabel = useMemo(() => formatMonthLabel(selectedMonth), [selectedMonth]);
  const visibleItems = useMemo(() => (mode === 'spent' ? items.filter((item) => item.spent > 0) : items), [items, mode]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center modal-scrim backdrop-blur-sm px-3"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-2xl border border-[var(--modal-border)] bg-[var(--modal-surface)] p-4 text-[var(--text)] shadow-2xl backdrop-blur"
        role="dialog"
        aria-modal="true"
        aria-label="Categorías del mes"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-[var(--text)]">{'Categorías del mes'}</h3>
            <p className="text-sm text-[var(--text-muted)]">{monthLabel}</p>
          </div>

          <div className="flex items-center justify-between gap-2 sm:justify-end">
            {showModeToggle && (
              <div className="flex rounded-lg border border-[var(--card-border)] bg-[var(--input-bg)] p-1 text-xs">
                <button
                  type="button"
                  aria-pressed={mode === 'spent'}
                  onClick={() => onModeChange('spent')}
                  className={`rounded-md px-3 py-2 font-semibold ${
                    mode === 'spent' ? 'bg-primary text-[var(--text)]' : 'text-[var(--text)]'
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
                    mode === 'budget' ? 'bg-primary text-[var(--text)]' : 'text-[var(--text)]'
                  } ${!budgetModeAvailable ? 'cursor-not-allowed opacity-50' : ''}`}
                >
                  Presupuesto
                </button>
              </div>
            )}

            <button
              onClick={onClose}
              aria-label="Cerrar"
              className="h-9 w-9 rounded-full border border-[var(--card-border)] bg-[var(--input-bg)] text-sm font-semibold text-[var(--text)] hover:border-[var(--primary)]"
            >
              <span aria-hidden="true">X</span>
            </button>
          </div>
        </div>

        <div className="max-h-[65vh] overflow-y-auto pr-1">
          <CategorySpendChart
            title="Categorías del mes"
            subtitle={monthLabel}
            items={visibleItems}
            mode={mode}
            showFallbackId={false}
            valueLabel={valueLabel}
          />
        </div>

        {onViewMovements && (
          <div className="mt-4 flex justify-end">
            <button
              className="rounded-lg border border-[var(--card-border)] bg-[var(--input-bg)] px-3 py-2 text-sm font-semibold text-[var(--text)] hover:border-primary"
              onClick={() => {
                onClose();
                onViewMovements();
              }}
            >
              Ver movimientos
            </button>
          </div>
        )}
      </div>
    </div>
  );
}











