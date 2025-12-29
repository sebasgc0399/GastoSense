import { useMemo } from 'react';
import { useCategoriesController } from '../hooks/useCategoriesController';
import type { TransactionTypeFilter, TransactionsFilters } from '../hooks/useTransactionsController';
import type { Category, CategoryKind } from '../types';
import { DateField } from './DateField';
import { ResponsiveSelect } from './ResponsiveSelect';

interface TransactionFiltersProps {
  startDate: TransactionsFilters['startDate'];
  endDate: TransactionsFilters['endDate'];
  category: TransactionsFilters['category'];
  search: TransactionsFilters['search'];
  type: TransactionsFilters['type'];
  userId?: string | null;
  onChange: (filters: TransactionsFilters) => void;
  variant?: 'card' | 'bare';
}

const resolveKind = (value?: CategoryKind) => (value === 'income' ? 'income' : 'expense');
const normalizeKey = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

export function TransactionFilters({
  startDate,
  endDate,
  category,
  search,
  type,
  userId,
  onChange,
  variant = 'card',
}: TransactionFiltersProps) {
  const { categories } = useCategoriesController({ userId });
  const categoryOptions = useMemo(() => {
    const visible = categories.filter((cat) => !cat.isArchived || cat.id === 'otros' || cat.id === 'ingreso');
    const sortAlpha = (a: Category, b: Category) => a.label.localeCompare(b.label, 'es-CO');
    const sortWithFallbacks = (list: Category[], fallbackIds: string[]) => {
      const fallbackSet = new Set(fallbackIds);
      const rest = list.filter((cat) => !fallbackSet.has(cat.id)).sort(sortAlpha);
      const fallbacks = list.filter((cat) => fallbackSet.has(cat.id)).sort(sortAlpha);
      return [...rest, ...fallbacks];
    };

    const labelKinds = new Map<string, Set<'expense' | 'income'>>();
    visible.forEach((cat) => {
      const key = normalizeKey(cat.label);
      if (!key) return;
      const kind = resolveKind(cat.kind);
      const entry = labelKinds.get(key) ?? new Set<'expense' | 'income'>();
      entry.add(kind);
      labelKinds.set(key, entry);
    });

    const shouldSuffix = (label: string) => {
      if (type !== 'all') return false;
      const key = normalizeKey(label);
      const kinds = labelKinds.get(key);
      return Boolean(kinds && kinds.size > 1);
    };

    const toOption = (cat: Category) => {
      const kind = resolveKind(cat.kind);
      const suffix = shouldSuffix(cat.label) ? (kind === 'income' ? ' (Ingreso)' : ' (Gasto)') : '';
      return { value: cat.id, label: `${cat.label}${suffix}` };
    };

    const expenses = visible.filter((cat) => resolveKind(cat.kind) === 'expense');
    const incomes = visible.filter((cat) => resolveKind(cat.kind) === 'income');
    const sortedExpenses = sortWithFallbacks(expenses, ['otros']);
    const sortedIncomes = sortWithFallbacks(incomes, ['ingreso']);

    const header = [{ value: 'all', label: 'Todas las categorias' }];
    if (type === 'expense') {
      return [...header, ...sortedExpenses.map(toOption)];
    }
    if (type === 'income') {
      return [...header, ...sortedIncomes.map(toOption)];
    }
    const combined = sortWithFallbacks([...expenses, ...incomes], ['otros', 'ingreso']);
    return [...header, ...combined.map(toOption)];
  }, [categories, type]);

  const typeOptions: Array<{ id: TransactionTypeFilter; label: string }> = [
    { id: 'all', label: 'Todos' },
    { id: 'expense', label: 'Gastos' },
    { id: 'income', label: 'Ingresos' },
  ];

  const content = (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2 pb-1">
        {typeOptions.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange({ startDate, endDate, search, category: 'all', type: option.id })}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
              type === option.id
                ? 'bg-primary text-white'
                : 'bg-white/5 text-slate-400 hover:bg-white/10'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div>
          <label htmlFor="tx-filter-start" className="mb-1 block text-xs font-semibold text-[var(--muted)]">
            Desde
          </label>
          <DateField
            id="tx-filter-start"
            value={startDate}
            onChange={(value) => onChange({ startDate: value, endDate, category, search, type })}
            ariaLabel="Desde"
          />
        </div>
        <div>
          <label htmlFor="tx-filter-end" className="mb-1 block text-xs font-semibold text-[var(--muted)]">
            Hasta
          </label>
          <DateField
            id="tx-filter-end"
            value={endDate}
            onChange={(value) => onChange({ startDate, endDate: value, category, search, type })}
            ariaLabel="Hasta"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-[var(--muted)]">Categoria</label>
          <ResponsiveSelect
            value={category}
            onChange={(val) => onChange({ startDate, endDate, category: val, search, type })}
            options={categoryOptions}
            title="Categoria"
            className="min-h-[44px] rounded-xl border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text)]"
            buttonClassName="min-h-[44px] rounded-xl border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text)]"
          />
        </div>
        <div>
          <label htmlFor="tx-filter-search" className="mb-1 block text-xs font-semibold text-[var(--muted)]">
            Buscar
          </label>
          <input
            type="text"
            value={search}
            placeholder="Nota o categoria..."
            onChange={(e) => onChange({ startDate, endDate, category, search: e.target.value, type })}
            className="input min-h-[44px] text-[16px]"
            id="tx-filter-search"
          />
        </div>
      </div>
    </div>
  );

  if (variant === 'bare') {
    return content;
  }

  return <div className="card">{content}</div>;
}
