import { useEffect, useRef } from 'react';
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
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[var(--text)]">{title}</h2>
        <span className="text-xs text-[var(--text-muted)]">{subtitle}</span>
      </div>
      {templates.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">{emptyState}</p>
      ) : (
        <div className="space-y-3">
          {templates.map((tpl) => (
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
  const showType =
    template.type === 'income' || (!showCategory && template.type === 'expense' && !template.paymentMethod);
  const amountValue = typeof template.amount === 'number' ? template.amount : null;
  const amountTone =
    resolvedType === 'income' ? 'text-emerald-200' : resolvedType === 'expense' ? 'text-red-200' : 'text-white';
  const amountPrefix = resolvedType === 'income' ? '+' : resolvedType === 'expense' ? '-' : '';
  const amountLabel = amountValue !== null ? `${amountPrefix}${formatPesos(amountValue)}` : '';
  const paymentMethodLabel = template.paymentMethod ? paymentMethodLabels[template.paymentMethod] : '';

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
    <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-3 shadow-sm sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 flex-1 text-sm font-semibold text-white line-clamp-2">{template.name}</p>
          {amountValue !== null && <p className={`shrink-0 text-base font-semibold ${amountTone}`}>{amountLabel}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[10px]">
          <span className="rounded-full border border-white/10 bg-white/10 px-2 py-0.5 font-semibold text-slate-200">
            {frequencyLabel}
          </span>
          {showCategory && (
            <span
              className="flex max-w-[180px] items-center gap-1 rounded-full border border-white/10 bg-white/10 px-2 py-0.5 font-semibold text-slate-200"
              title={showCategoryTooltip && template.categoryId ? `ID: ${template.categoryId}` : undefined}
            >
              <CategoryIcon name={categoryIcon} size={12} className="shrink-0" />
              <span className="truncate">{categoryLabel}</span>
            </span>
          )}
          {showPaymentMethod && (
            <span className="rounded-full border border-white/10 bg-white/10 px-2 py-0.5 font-semibold text-slate-200">
              {paymentMethodLabel}
            </span>
          )}
          {showType && (
            <span className="rounded-full border border-white/10 bg-white/10 px-2 py-0.5 font-semibold text-slate-200">
              {template.type === 'income' ? 'Ingreso' : 'Gasto'}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 sm:justify-end">
        <button
          type="button"
          className="h-10 rounded-lg bg-primary px-4 text-xs font-semibold text-white hover:opacity-90"
          onClick={() => onUseTemplate(template)}
          aria-label={`Registrar plantilla ${template.name}`}
        >
          Registrar
        </button>
        <details className="relative shrink-0" ref={detailsRef}>
          <summary
            className="flex h-10 w-10 list-none items-center justify-center rounded-lg text-slate-200 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/40 [&::-webkit-details-marker]:hidden"
            aria-label="Acciones de plantilla"
            aria-haspopup="menu"
          >
            <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
          </summary>
          <div className="absolute right-0 top-11 z-10 w-32 rounded-lg border border-white/10 bg-slate-950/95 p-1 text-[11px] text-slate-200 shadow-lg backdrop-blur">
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
              className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-red-200 hover:bg-white/10"
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
    </div>
  );
}

