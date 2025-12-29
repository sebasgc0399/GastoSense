import { useEffect, useMemo, useRef } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { useConfirm } from '../hooks/useConfirm';
import { CATEGORY_ICONS } from '../utils/categoryIcons';
import { resolveCanonicalCategoryId, resolveCategoryLabel, type CategoryResolver } from '../utils/categoryResolver';
import { formatPesos } from '../utils/format';
import type { Template } from '../types';
import { CategoryIcon } from './ui/CategoryIcon';

interface Props {
  templates: Template[];
  title: string;
  subtitle: string;
  emptyState: string;
  categoryResolver: CategoryResolver;
  onUseTemplate: (tpl: Template) => void;
  onEditTemplate: (tpl: Template) => void;
  onDeleteTemplate: (id: string) => Promise<void>;
}

const frequencyLabels: Record<NonNullable<Template['frequency']>, string> = {
  weekly: 'Semanal',
  biweekly: 'Quincenal',
  monthly: 'Mensual',
  yearly: 'Anual',
};

const paymentMethodLabels: Record<NonNullable<Template['paymentMethod']>, string> = {
  debito: 'Débito',
  credito: 'Crédito',
  digital: 'Digital',
  efectivo: 'Efectivo',
  otro: 'Otro',
};

const getFrequencyLabel = (value?: Template['frequency']) => {
  if (!value) return frequencyLabels.monthly;
  return frequencyLabels[value] ?? frequencyLabels.monthly;
};

const parseTemplateDate = (value?: string) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setHours(0, 0, 0, 0);
  return parsed;
};

const addTemplatePeriod = (date: Date, frequency?: Template['frequency']) => {
  const next = new Date(date);
  if (frequency === 'weekly') next.setDate(next.getDate() + 7);
  else if (frequency === 'biweekly') next.setDate(next.getDate() + 14);
  else if (frequency === 'yearly') next.setFullYear(next.getFullYear() + 1);
  else {
    const day = next.getDate();
    next.setMonth(next.getMonth() + 1);
    if (next.getDate() < day) next.setDate(0);
  }
  next.setHours(0, 0, 0, 0);
  return next;
};

const getNextTemplateDate = (tpl: Template, reference: Date) => {
  const base = parseTemplateDate(tpl.lastUsedAt ?? tpl.createdAt);
  if (!base) return new Date(8640000000000000);
  let next = base;
  const freq = tpl.frequency ?? 'monthly';
  let guard = 0;
  while (next < reference && guard < 520) {
    next = addTemplatePeriod(next, freq);
    guard += 1;
  }
  return next;
};

export function RecurringTemplatesCard({
  templates,
  title,
  subtitle,
  emptyState,
  categoryResolver,
  onUseTemplate,
  onEditTemplate,
  onDeleteTemplate,
}: Props) {
  const confirm = useConfirm();
  const totalFixedExpense = useMemo(() => {
    const expenseTemplates = templates.filter((tpl) => tpl.type !== 'income');
    if (expenseTemplates.length === 0) return null;
    const total = expenseTemplates.reduce((sum, tpl) => {
      const value = typeof tpl.amount === 'number' && Number.isFinite(tpl.amount) ? Math.abs(tpl.amount) : 0;
      return sum + value;
    }, 0);
    return formatPesos(total);
  }, [templates]);

  const sortedTemplates = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return [...templates].sort((a, b) => {
      const nextA = getNextTemplateDate(a, today).getTime();
      const nextB = getNextTemplateDate(b, today).getTime();
      if (nextA !== nextB) return nextA - nextB;
      return a.name.localeCompare(b.name);
    });
  }, [templates]);

  const handleDelete = async (id: string) => {
    const confirmed = await confirm({
      title: '¿Eliminar plantilla?',
      description: 'Esta acción no se puede deshacer.',
      confirmText: 'Eliminar',
      cancelText: 'Cancelar',
      variant: 'destructive',
    });
    if (!confirmed) return;
    void onDeleteTemplate(id);
  };

  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-lg font-semibold text-[var(--text)]">{title}</h2>
          {totalFixedExpense && (
            <span className="text-xs text-[var(--text-muted)]">{`Gastos fijos: ${totalFixedExpense}`}</span>
          )}
        </div>
        <span className="hidden text-xs text-[var(--text-muted)] sm:inline">{subtitle}</span>
      </div>
      {templates.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">{emptyState}</p>
      ) : (
        <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto overflow-y-visible pb-2 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {sortedTemplates.map((tpl) => (
            <RecurringTemplateItem
              key={tpl.id}
              template={tpl}
              categoryResolver={categoryResolver}
              onUseTemplate={onUseTemplate}
              onEditTemplate={onEditTemplate}
              onDeleteTemplate={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface RecurringTemplateItemProps {
  template: Template;
  categoryResolver: CategoryResolver;
  onUseTemplate: (tpl: Template) => void;
  onEditTemplate: (tpl: Template) => void;
  onDeleteTemplate: (id: string) => void;
}

function RecurringTemplateItem({
  template,
  categoryResolver,
  onUseTemplate,
  onEditTemplate,
  onDeleteTemplate,
}: RecurringTemplateItemProps) {
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const frequencyLabel = getFrequencyLabel(template.frequency);
  const resolvedType = template.type === 'income' ? 'income' : 'expense';
  const fallbackId = resolvedType === 'income' ? 'ingreso' : 'otros';
  const effectiveCategoryId = template.categoryId?.trim() || fallbackId;
  const canonicalCategoryId = resolveCanonicalCategoryId(effectiveCategoryId, categoryResolver);
  const resolvedLabel = resolveCategoryLabel(canonicalCategoryId, categoryResolver);
  const categoryLabel =
    resolvedLabel ?? (template.categoryId ? 'Categoria eliminada' : resolvedType === 'income' ? 'Ingreso' : 'Otros');
  const categoryIcon =
    categoryResolver.categoriesById[canonicalCategoryId]?.icon ??
    CATEGORY_ICONS[canonicalCategoryId] ??
    CATEGORY_ICONS.default ??
    'Tag';
  const showCategory = Boolean(categoryLabel);
  const showCategoryTooltip = Boolean(template.categoryId) && !resolvedLabel;
  const showPaymentMethod = Boolean(template.paymentMethod);
  const amountValue = typeof template.amount === 'number' ? template.amount : null;
  const amountPrefix = resolvedType === 'income' ? '+' : resolvedType === 'expense' ? '-' : '';
  const amountLabel = amountValue !== null ? `${amountPrefix}${formatPesos(amountValue)}` : '';
  const paymentMethodLabel = template.paymentMethod ? paymentMethodLabels[template.paymentMethod] : '';
  const metaLine = [frequencyLabel, showPaymentMethod ? paymentMethodLabel : null].filter(Boolean).join(' / ');

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const details = detailsRef.current;
      if (!details || !details.open) return;
      if (!details.contains(event.target as Node)) {
        details.removeAttribute('open');
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const details = detailsRef.current;
      if (!details || !details.open) return;
      details.removeAttribute('open');
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const closeDetails = () => {
    const details = detailsRef.current;
    if (details?.open) {
      details.removeAttribute('open');
    }
  };

  return (
    <div className="snap-start shrink-0 min-w-[85%] sm:min-w-[280px] sm:w-[280px]">
      <div className="flex h-[160px] flex-col rounded-2xl border border-[var(--card-border)] bg-[var(--card)] px-3 py-3 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          {showCategory && (
            <div
              className="flex min-w-0 items-center gap-2"
              title={showCategoryTooltip && template.categoryId ? `ID: ${template.categoryId}` : undefined}
            >
              <CategoryIcon name={categoryIcon} size={14} className="shrink-0 text-[var(--text-muted)]" />
              <span className="truncate text-xs font-semibold text-[var(--text)]">{categoryLabel}</span>
            </div>
          )}

          <details className="relative shrink-0" ref={detailsRef}>
            <summary
              className="flex h-8 w-8 list-none items-center justify-center rounded-lg text-[var(--text)] hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/40 [&::-webkit-details-marker]:hidden"
              aria-label="Acciones de plantilla"
              aria-haspopup="menu"
            >
              <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
            </summary>

            <div className="absolute right-0 top-9 z-[999] w-32 rounded-lg border border-[var(--modal-border)] bg-[var(--modal-surface)] p-1 text-[11px] text-[var(--text)] shadow-lg backdrop-blur-xl">
              <button
                type="button"
                className="flex w-full items-center rounded-md px-2 py-1.5 text-left hover:bg-white/10"
                onClick={() => {
                  closeDetails();
                  onEditTemplate(template);
                }}
              >
                Editar
              </button>

              <button
                type="button"
                className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-[var(--danger-text)] hover:bg-[var(--danger-bg)]"
                onClick={() => {
                  closeDetails();
                  onDeleteTemplate(template.id);
                }}
              >
                Borrar
              </button>
            </div>
          </details>
        </div>

        <div className="mt-2 flex-1">
          <p className="truncate text-sm font-semibold text-[var(--text)]">{template.name}</p>

          {amountValue !== null && (
            <p
              className={`mt-1 text-lg font-semibold ${
                resolvedType === 'income'
                  ? 'text-[var(--accent)]'
                  : resolvedType === 'expense'
                    ? 'text-[var(--danger-text)]'
                    : 'text-[var(--text)]'
              }`}
            >
              {amountLabel}
            </p>
          )}

          {metaLine && <p className="mt-1 truncate text-[10px] text-[var(--text-muted)]">{metaLine}</p>}
        </div>

        <button
          type="button"
          className="mt-2 h-9 w-full rounded-lg bg-[var(--primary)] px-4 text-xs font-semibold text-[var(--text-on-primary)] hover:opacity-90"
          onClick={() => onUseTemplate(template)}
          aria-label={`Registrar plantilla ${template.name}`}
        >
          Registrar
        </button>
      </div>
    </div>
  );
}










