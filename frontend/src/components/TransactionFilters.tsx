import { frequentCategories } from '../data/frequentCategories';
import { ResponsiveSelect } from './ResponsiveSelect';

interface TransactionFiltersProps {
  startDate: string;
  endDate: string;
  category: string;
  onChange: (filters: { startDate: string; endDate: string; category: string }) => void;
}

export function TransactionFilters({ startDate, endDate, category, onChange }: TransactionFiltersProps) {
  return (
    <div className="card">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-semibold text-[var(--muted)]">Desde</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => onChange({ startDate: e.target.value, endDate, category })}
            className="input"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-[var(--muted)]">Hasta</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => onChange({ startDate, endDate: e.target.value, category })}
            className="input"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-[var(--muted)]">Categoría</label>
          <ResponsiveSelect
            value={category}
            onChange={(val) => onChange({ startDate, endDate, category: val })}
            options={[
              { value: 'all', label: 'Todas' },
              ...frequentCategories.map((cat) => ({ value: cat.id, label: cat.label })),
            ]}
            title="Categoría"
          />
        </div>
      </div>
    </div>
  );
}
