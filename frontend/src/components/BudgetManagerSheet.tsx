import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useCategoriesController } from '../hooks/useCategoriesController';
import type { Category } from '../types';
import { CategoryIcon } from './ui/CategoryIcon';

interface Props {
  open: boolean;
  onClose: () => void;
  userId?: string | null;
  perCategory?: Record<string, number>;
  categorySpendMap?: Record<string, number>;
  onSave: (perCategory: Record<string, number>) => Promise<void>;
  focusCategoryId?: string | null;
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

const FALLBACK_CATEGORY_ID = 'otros';

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
}: Props) {
  const { categories, loading, error } = useCategoriesController({ userId, includeArchived: true });
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const initializedRef = useRef(false);

  const sortedCategories = useMemo(() => sortCategories(categories), [categories]);
  const fallbackBudget = useMemo(() => perCategory?.[FALLBACK_CATEGORY_ID] ?? 0, [perCategory]);
  const fallbackSpent = useMemo(() => categorySpendMap?.[FALLBACK_CATEGORY_ID] ?? 0, [categorySpendMap]);
  const shouldShowFallback = useMemo(() => fallbackBudget > 0 || fallbackSpent > 0, [fallbackBudget, fallbackSpent]);
  const activeCategories = useMemo(
    () =>
      sortedCategories.filter(
        (cat) => !cat.isArchived && (cat.id !== FALLBACK_CATEGORY_ID || shouldShowFallback),
      ),
    [shouldShowFallback, sortedCategories],
  );
  const archivedCategories = useMemo(
    () => sortedCategories.filter((cat) => cat.isArchived && cat.id !== FALLBACK_CATEGORY_ID),
    [sortedCategories],
  );
  const archivedWithBudget = useMemo(() => {
    if (!perCategory) return [];
    return archivedCategories.filter((cat) => (perCategory[cat.id] ?? 0) > 0);
  }, [archivedCategories, perCategory]);
  const visibleCategories = useMemo(
    () => [...activeCategories, ...archivedWithBudget],
    [activeCategories, archivedWithBudget],
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
    () => !!focusCategoryId && archivedWithBudget.some((cat) => cat.id === focusCategoryId),
    [archivedWithBudget, focusCategoryId],
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
      const nextPerCategory = { ...(perCategory ?? {}), ...computed };
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
                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase text-[var(--text-muted)]">
                  Sistema / fallback
                </span>
              ) : cat.isSystem ? (
                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase text-[var(--text-muted)]">
                  Base
                </span>
              ) : null}
            </div>
            {isFallback && (
              <p className="text-[10px] text-[var(--text-muted)]">Sugerencia: Sin tope</p>
            )}
          </div>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <input
            ref={(el) => {
              inputRefs.current[cat.id] = el;
            }}
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={value}
            placeholder="Sin tope"
            onChange={(e) => handleValueChange(cat.id, e.target.value)}
            className="input w-full text-right sm:w-32"
          />
          <button
            type="button"
            onClick={() => handleValueChange(cat.id, '0')}
            className="rounded-lg border border-[var(--card-border)] bg-[var(--input-bg)] px-3 py-2 text-xs font-semibold text-[var(--text)] hover:border-primary"
          >
            Sin tope
          </button>
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
            className="relative flex h-[92vh] w-full max-w-none flex-col overflow-hidden rounded-t-2xl border border-[var(--modal-border)] bg-[var(--modal-surface)] text-[var(--text)] shadow-2xl backdrop-blur md:h-auto md:max-h-[85vh] md:max-w-3xl md:rounded-2xl"
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
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--card-border)] bg-[var(--input-bg)] text-[var(--text)] hover:border-primary"
                  aria-label="Cerrar"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              {error && <p className="text-xs text-[var(--error-text)]">{error}</p>}
              {loading && visibleCategories.length === 0 ? (
                <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)]/40 p-3 text-sm text-[var(--text-muted)]">
                  Cargando categorías...
                </div>
              ) : visibleCategories.length === 0 ? (
                <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)]/40 p-3 text-sm text-[var(--text-muted)]">
                  No hay categorías disponibles.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">Activas</div>
                  {activeCategories.length === 0 ? (
                    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)]/40 p-3 text-sm text-[var(--text-muted)]">
                      No hay categorías activas.
                    </div>
                  ) : (
                    <div className="space-y-3">{activeCategories.map(renderCategoryRow)}</div>
                  )}

                  {archivedWithBudget.length > 0 && (
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={() => setArchivedOpen((prev) => !prev)}
                        className="flex w-full items-center justify-between rounded-xl border border-[var(--card-border)] bg-[var(--card)]/30 px-3 py-2 text-sm font-semibold text-[var(--text)]"
                      >
                        <span>Inactivas con presupuesto</span>
                        {archivedOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                      {archivedOpen && (
                        <div className="mt-3 space-y-3">{archivedWithBudget.map(renderCategoryRow)}</div>
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
                  className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--input-bg)] px-4 py-3 text-sm font-semibold text-[var(--text)] hover:border-primary sm:w-auto"
                  disabled={saving}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || visibleCategories.length === 0}
                  className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white shadow hover:opacity-90 disabled:opacity-60 sm:w-auto"
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
