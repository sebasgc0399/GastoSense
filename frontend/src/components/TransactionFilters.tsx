import { frequentCategories } from '../data/frequentCategories';

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
          <select
            value={category}
            onChange={(e) => onChange({ startDate, endDate, category: e.target.value })}
            className="input"
          >
            <option value="all">Todas</option>
            {frequentCategories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
