import { useState } from 'react';
import type { TransactionsFilters } from '../../hooks/useTransactionsController';
import { TransactionFilters } from '../TransactionFilters';

interface TransactionsFiltersPanelProps {
  filters: TransactionsFilters;
  onChange: (filters: TransactionsFilters) => void;
  userId?: string | null;
  categoryLabel?: string;
}

const formatShortDate = (value: string) => {
  if (!value) return '';
  const parts = value.split('-');
  if (parts.length !== 3) return value;
  return `${parts[2]}/${parts[1]}`;
};

export function TransactionsFiltersPanel({
  filters,
  onChange,
  userId,
  categoryLabel,
}: TransactionsFiltersPanelProps) {
  const [open, setOpen] = useState(false);
  const searchValue = (filters.search ?? '').trim();
  const showSearch = searchValue.length > 0;
  const hasCategoryFilter = filters.category !== 'all';
  const hasTypeFilter = filters.type !== 'all';
  const canClear = showSearch || hasCategoryFilter || hasTypeFilter;
  const rangeLabel =
    filters.startDate && filters.endDate
      ? `${formatShortDate(filters.startDate)}–${formatShortDate(filters.endDate)}`
      : 'Sin rango';
  const categoryChip = filters.category === 'all' ? 'Todas' : categoryLabel || filters.category;

  const handleClear = () => {
    onChange({ ...filters, category: 'all', search: '', type: 'all' });
  };

  const toggleOpen = () => setOpen((prev) => !prev);
  const panelClasses = `overflow-hidden transition-[max-height,opacity] duration-200 ease-out ${
    open ? 'mt-3 max-h-[70vh] opacity-100' : 'mt-0 max-h-0 opacity-0 pointer-events-none'
  }`;

  return (
    <>
      <div className="sm:hidden rounded-2xl surface-soft p-2">
        <div className="flex items-start justify-between gap-2">
          <button
            type="button"
            className="flex min-w-0 flex-1 flex-wrap gap-2 text-left"
            onClick={toggleOpen}
            aria-expanded={open}
            aria-controls="tx-filters-panel"
            aria-label={open ? 'Cerrar filtros' : 'Abrir filtros'}
          >
            <span className="rounded-full border border-[var(--border-10)] bg-[var(--overlay-10)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text)]">
              Rango: {rangeLabel}
            </span>
            <span className="rounded-full border border-[var(--border-10)] bg-[var(--overlay-10)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text)]">
              Cat: {categoryChip}
            </span>
          </button>
          <button
            type="button"
            className="shrink-0 rounded-full border border-[var(--border-10)] bg-[var(--overlay-10)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text)]"
            onClick={(event) => {
              event.stopPropagation();
              toggleOpen();
            }}
            aria-expanded={open}
            aria-controls="tx-filters-panel"
          >
            {open ? 'Cerrar ▴' : 'Filtros ▾'}
          </button>
        </div>
        {canClear && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {showSearch && (
              <span className="max-w-[220px] truncate rounded-full border border-[var(--border-10)] bg-[var(--overlay-10)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text)]">
                Buscar: {searchValue}
              </span>
            )}
            {canClear && (
              <button
                type="button"
                className="rounded-full border border-[var(--border-10)] bg-[var(--overlay-10)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text)]"
                onClick={(event) => {
                  event.stopPropagation();
                  handleClear();
                }}
              >
                Limpiar filtros
              </button>
            )}
          </div>
        )}
        <div id="tx-filters-panel" className={panelClasses} aria-hidden={!open}>
          <div className="rounded-lg surface-soft p-3">
            <TransactionFilters
              startDate={filters.startDate}
              endDate={filters.endDate}
              category={filters.category}
              search={filters.search}
              type={filters.type}
              userId={userId}
              onChange={onChange}
              variant="bare"
            />
          </div>
        </div>
      </div>
      <div className="hidden sm:block">
        <TransactionFilters
          startDate={filters.startDate}
          endDate={filters.endDate}
          category={filters.category}
          search={filters.search}
          type={filters.type}
          userId={userId}
          onChange={onChange}
        />
      </div>
    </>
  );
}
