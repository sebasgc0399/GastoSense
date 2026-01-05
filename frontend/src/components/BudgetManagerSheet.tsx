import { ChevronDown, ChevronRight, ChevronUp, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useCategoriesController } from '../hooks/useCategoriesController';
import type { Category } from '../types';
import { formatPesos } from '../utils/format';
import { CategoryIcon } from './ui/CategoryIcon';

interface Props {
  open: boolean;
  onClose: () => void;
  userId?: string | null;
  perCategory?: Record<string, number>;
  categorySpendMap?: Record<string, number>;
  onSave: (perCategory: Record<string, number>) => Promise<void>;
  focusCategoryId?: string | null;
  onViewCategory?: (categoryId: string) => void;
}

const toInputValue = (value?: number) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return '';
  return String(Math.round(value));
};

const normalizeAmount = (value?: string) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.round(numeric));
};

const prunePerCategory = (valuesById: Record<string, number>, allowedIds?: Set<string>) => {
  const pruned: Record<string, number> = {};
  const hasAllowedIds = allowedIds && allowedIds.size > 0;

  Object.entries(valuesById).forEach(([id, value]) => {
    if (value <= 0) return;
    if (hasAllowedIds && !allowedIds.has(id)) return;
    pruned[id] = value;
  });

  return pruned;
};

const FALLBACK_CATEGORY_ID = 'otros';
const allowBudgetForFallback = false;
const resolveKind = (value?: Category['kind']) => (value === 'income' ? 'income' : 'expense');

const sortCategories = (items: Category[]) =>
  [...items].sort((a, b) => {
    const orderDiff = (a.order ?? 0) - (b.order ?? 0);
    if (orderDiff !== 0) return orderDiff;
    return a.label.localeCompare(b.label, 'es');
  });

export function BudgetManagerSheet({
  open,
  onClose,
  userId,
  perCategory,
  categorySpendMap,
  onSave,
  focusCategoryId,
  onViewCategory,
}: Props) {
  const { categories, loading, error } = useCategoriesController({ userId, includeArchived: true });
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const initializedRef = useRef(false);

  const expenseCategories = useMemo(
    () => sortCategories(categories.filter((cat) => resolveKind(cat.kind) === 'expense')),
    [categories],
  );
  const fallbackSpent = useMemo(() => categorySpendMap?.[FALLBACK_CATEGORY_ID] ?? 0, [categorySpendMap]);
  const shouldShowFallback = useMemo(() => fallbackSpent > 0, [fallbackSpent]);
  const activeCategories = useMemo(
    () =>
      expenseCategories.filter(
        (cat) => !cat.isArchived && (cat.id !== FALLBACK_CATEGORY_ID || shouldShowFallback),
      ),
    [expenseCategories, shouldShowFallback],
  );
  const archivedCategories = useMemo(
    () => expenseCategories.filter((cat) => cat.isArchived && cat.id !== FALLBACK_CATEGORY_ID),
    [expenseCategories],
  );
  const archivedRelevant = useMemo(() => {
    const budgetMap = perCategory ?? {};
    const spendMap = categorySpendMap ?? {};
    return archivedCategories.filter((cat) => (budgetMap[cat.id] ?? 0) > 0 || (spendMap[cat.id] ?? 0) > 0);
  }, [archivedCategories, categorySpendMap, perCategory]);
  const visibleCategories = useMemo(
    () => [...activeCategories, ...archivedRelevant],
    [activeCategories, archivedRelevant],
  );

  useEffect(() => {
    if (!open) {
      initializedRef.current = false;
      setValues({});
      setSaveError(null);
      setArchivedOpen(false);
      return;
    }
    if (initializedRef.current) return;
    const initialValues: Record<string, string> = {};
    visibleCategories.forEach((cat) => {
      initialValues[cat.id] = toInputValue(perCategory?.[cat.id]);
    });
    setValues(initialValues);
    initializedRef.current = true;
  }, [open, perCategory, visibleCategories]);

  useEffect(() => {
    if (!open) return;
    setValues((prev) => {
      const next = { ...prev };
      visibleCategories.forEach((cat) => {
        if (!(cat.id in next)) {
          next[cat.id] = toInputValue(perCategory?.[cat.id]);
        }
      });
      return next;
    });
  }, [open, perCategory, visibleCategories]);

  const focusIsArchived = useMemo(
    () => !!focusCategoryId && archivedRelevant.some((cat) => cat.id === focusCategoryId),
    [archivedRelevant, focusCategoryId],
  );

  useEffect(() => {
    if (!open || !focusIsArchived) return;
    setArchivedOpen(true);
  }, [focusIsArchived, open]);

  useEffect(() => {
    if (!open || !focusCategoryId) return;
    const input = inputRefs.current[focusCategoryId];
    if (!input) return;
    const timer = window.setTimeout(() => {
      input.focus();
      input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [archivedOpen, focusCategoryId, open, visibleCategories]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handler);
    };
  }, [onClose, open]);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 2500);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  const handleValueChange = (id: string, value: string) => {
    setValues((prev) => ({ ...prev, [id]: value }));
  };

  const handleSave = async () => {
    if (!userId) {
      setSaveError('No se pudo guardar. Inicia sesi\u00F3n nuevamente.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const computed: Record<string, number> = {};
      visibleCategories.forEach((cat) => {
        computed[cat.id] = normalizeAmount(values[cat.id]);
      });
      delete computed[FALLBACK_CATEGORY_ID];
      const allowedIds =
        categories.length > 0
          ? new Set(categories.filter((cat) => resolveKind(cat.kind) === 'expense').map((cat) => cat.id))
          : undefined;
      const nextPerCategory = prunePerCategory(computed, allowedIds);
      await onSave(nextPerCategory);
      setToastMessage('Presupuestos actualizados');
      onClose();
    } catch (err) {
      console.error(err);
      setSaveError('No se pudieron guardar los presupuestos.');
    } finally {
      setSaving(false);
    }
  };

  const renderCategoryRow = (cat: Category) => {
    const value = values[cat.id] ?? '';
    const isFallback = cat.id === FALLBACK_CATEGORY_ID;
    const disabled = isFallback && !allowBudgetForFallback;
    const displayValue = disabled ? '' : value;
    const spent = categorySpendMap?.[cat.id] ?? 0;
    return (
      <div
        key={cat.id}
        className="flex flex-col gap-3 rounded-xl border border-[var(--card-border)] bg-[var(--card)]/40 px-3 py-3 sm:flex-row sm:items-center"
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--input-bg)]">
            <CategoryIcon name={cat.icon} size={18} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold text-[var(--text)]">{cat.label}</p>
              {isFallback ? (
                <span className="rounded-full border border-[var(--border-10)] bg-[var(--overlay-5)] px-2 py-0.5 text-[10px] font-semibold uppercase text-[var(--text-muted)]">
                  Automatica
                </span>
              ) : null}
            </div>
            <p className="text-[10px] text-[var(--text-muted)]">Gastado este mes: {formatPesos(spent)}</p>
          </div>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
          <input
            ref={(el) => {
              inputRefs.current[cat.id] = el;
            }}
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={displayValue}
            placeholder={disabled ? 'No aplica' : 'Sin tope'}
            onChange={(e) => handleValueChange(cat.id, e.target.value)}
            disabled={disabled}
            className="input w-full text-right sm:w-32 disabled:opacity-60"
          />
          {!disabled && (
            <button
              type="button"
              onClick={() => handleValueChange(cat.id, '')}
              className="btn-outline rounded-lg px-3 py-2 text-xs"
            >
              Sin tope
            </button>
          )}
          {onViewCategory && (
            <button
              type="button"
              onClick={() => onViewCategory(cat.id)}
              className="flex items-center gap-1 rounded-lg border border-transparent px-2 py-2 text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text)]"
              aria-label={`Ver movimientos de ${cat.label}`}
            >
              Ver
              <ChevronRight className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    );
  };

  if (typeof document === 'undefined') return null;
  if (!open && !toastMessage) return null;

  return createPortal(
    <>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center px-0 md:items-center md:px-3">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
            onClick={onClose}
            aria-hidden="true"
          />
          <div
            className="modal-surface relative flex h-[92vh] w-full max-w-none flex-col overflow-hidden rounded-t-2xl md:h-auto md:max-h-[85vh] md:max-w-3xl md:rounded-2xl"
            role="dialog"
            aria-modal="true"
            aria-label="Presupuestos por categoría"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 border-b border-[var(--modal-border)] px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-[var(--text)]">Presupuestos por categoría</h3>
                  <p className="text-xs text-[var(--text-muted)]">Define los límites mensuales por categoría.</p>
                </div>
                <button
                  onClick={onClose}
                  className="icon-button h-9 w-9 rounded-full"
                  aria-label="Cerrar"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              {error && <p className="text-xs text-[var(--error-text)]">{error}</p>}
              {loading && visibleCategories.length === 0 ? (
                <div className="panel-muted">
                  Cargando categorías...
                </div>
              ) : visibleCategories.length === 0 ? (
                <div className="panel-muted">
                  No hay categorías disponibles.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="section-label">Activas</div>
                  {activeCategories.length === 0 ? (
                    <div className="panel-muted">
                      No hay categorías activas.
                    </div>
                  ) : (
                    <div className="space-y-3">{activeCategories.map(renderCategoryRow)}</div>
                  )}

                  {archivedRelevant.length > 0 && (
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={() => setArchivedOpen((prev) => !prev)}
                        className="flex w-full items-center justify-between rounded-xl border border-[var(--card-border)] bg-[var(--card)]/30 px-3 py-2 text-sm font-semibold text-[var(--text)]"
                      >
                        <span>Inactivas con presupuesto o gasto</span>
                        {archivedOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                      {archivedOpen && (
                        <div className="mt-3 space-y-3">{archivedRelevant.map(renderCategoryRow)}</div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="shrink-0 border-t border-[var(--modal-border)] bg-[var(--modal-surface)] px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
              {saveError && <p className="mb-2 text-xs text-[var(--error-text)]">{saveError}</p>}
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="btn-outline w-full px-4 py-3 text-sm sm:w-auto"
                  disabled={saving}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || visibleCategories.length === 0}
                  className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-[var(--text)] shadow hover:opacity-90 disabled:opacity-60 sm:w-auto"
                >
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-full border border-emerald-500/40 bg-emerald-500/20 px-4 py-2 text-xs font-semibold text-emerald-100 shadow-lg">
          {toastMessage}
        </div>
      )}
    </>,
    document.body,
  );
}
