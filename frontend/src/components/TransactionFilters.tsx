import { useCategoriesController } from '../hooks/useCategoriesController';
import { DateField } from './DateField';
import { ResponsiveSelect } from './ResponsiveSelect';

interface TransactionFiltersProps {
  startDate: string;
  endDate: string;
  category: string;
  search: string;
  userId?: string | null;
  onChange: (filters: { startDate: string; endDate: string; category: string; search: string }) => void;
  variant?: 'card' | 'bare';
}

export function TransactionFilters({
  startDate,
  endDate,
  category,
  search,
  userId,
  onChange,
  variant = 'card',
}: TransactionFiltersProps) {
  const { categories } = useCategoriesController({ userId });
  const content = (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
      <div>
        <label htmlFor="tx-filter-start" className="mb-1 block text-xs font-semibold text-[var(--muted)]">
          Desde
        </label>
        <DateField
          id="tx-filter-start"
          value={startDate}
          onChange={(value) => onChange({ startDate: value, endDate, category, search })}
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
          onChange={(value) => onChange({ startDate, endDate: value, category, search })}
          ariaLabel="Hasta"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-[var(--muted)]">Categoria</label>
        <ResponsiveSelect
          value={category}
          onChange={(val) => onChange({ startDate, endDate, category: val, search })}
          options={[
            { value: 'all', label: 'Todas' },
            ...categories.map((cat) => ({ value: cat.id, label: cat.label })),
          ]}
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
          onChange={(e) => onChange({ startDate, endDate, category, search: e.target.value })}
          className="input min-h-[44px] text-[16px]"
          id="tx-filter-search"
        />
      </div>
    </div>
  );

  if (variant === 'bare') {
    return content;
  }

  return <div className="card">{content}</div>;
}
