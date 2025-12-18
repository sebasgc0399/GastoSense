import { frequentCategories } from '../data/frequentCategories';
import { ResponsiveSelect } from './ResponsiveSelect';

interface TransactionFiltersProps {
  startDate: string;
  endDate: string;
  category: string;
  search: string;
  onChange: (filters: { startDate: string; endDate: string; category: string; search: string }) => void;
}

export function TransactionFilters({ startDate, endDate, category, search, onChange }: TransactionFiltersProps) {
  return (
    <div className="card">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div>
          <label className="mb-1 block text-xs font-semibold text-[var(--muted)]">Desde</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => onChange({ startDate: e.target.value, endDate, category, search })}
            className="input"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-[var(--muted)]">Hasta</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => onChange({ startDate, endDate: e.target.value, category, search })}
            className="input"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-[var(--muted)]">Categoría</label>
          <ResponsiveSelect
            value={category}
            onChange={(val) => onChange({ startDate, endDate, category: val, search })}
            options={[
              { value: 'all', label: 'Todas' },
              ...frequentCategories.map((cat) => ({ value: cat.id, label: cat.label })),
            ]}
            title="Categoría"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-[var(--muted)]">Buscar</label>
          <input
            type="text"
            value={search}
            placeholder="Nota o categoría..."
            onChange={(e) => onChange({ startDate, endDate, category, search: e.target.value })}
            className="input"
          />
        </div>
      </div>
    </div>
  );
}
