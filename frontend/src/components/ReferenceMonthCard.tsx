import { useId } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  currentMonth: string;
  defaultMonth: string;
  onChange: (month: string) => void;
  description: string;
  title?: string;
}

const formatMonthLabel = (value: string) => {
  const [year, month] = value.split('-');
  const yearNum = Number(year);
  const monthNum = Number(month);
  if (!year || !month || Number.isNaN(yearNum) || Number.isNaN(monthNum)) return value;
  const date = new Date(yearNum, monthNum - 1, 1);
  if (Number.isNaN(date.getTime())) return value;
  const label = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
};

const shiftMonth = (value: string, delta: number) => {
  const [year, month] = value.split('-');
  const yearNum = Number(year);
  const monthNum = Number(month);
  if (!year || !month || Number.isNaN(yearNum) || Number.isNaN(monthNum)) return value;
  const date = new Date(yearNum, monthNum - 1 + delta, 1);
  if (Number.isNaN(date.getTime())) return value;
  const nextYear = date.getFullYear();
  const nextMonth = String(date.getMonth() + 1).padStart(2, '0');
  return `${nextYear}-${nextMonth}`;
};

export function ReferenceMonthCard({
  currentMonth,
  defaultMonth,
  onChange,
  description,
  title = 'Mes de referencia',
}: Props) {
  const descriptionId = useId();
  const monthLabel = formatMonthLabel(currentMonth);
  const prevMonth = shiftMonth(currentMonth, -1);
  const nextMonth = shiftMonth(currentMonth, 1);

  return (
    <div className="card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1">
        <p className="text-xs uppercase text-[var(--text-muted)]">{title}</p>
        <p id={descriptionId} className="text-sm text-[var(--text-muted)]">
          {description}
        </p>
      </div>
      <div className="flex w-full flex-col gap-2 sm:w-auto">
        <div className="relative w-full sm:min-w-[220px]">
          <div className="flex min-h-[44px] items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--text)] shadow-sm focus-within:outline-none focus-within:ring-2 focus-within:ring-emerald-400/40">
            <span className="font-semibold">{monthLabel}</span>
            <Calendar className="h-4 w-4 text-[var(--text-muted)]" aria-hidden="true" />
          </div>
          <input
            type="month"
            value={currentMonth}
            onChange={(e) => onChange(e.target.value || defaultMonth)}
            aria-label="Mes de referencia"
            aria-describedby={descriptionId}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </div>
        <div className="hidden items-center gap-2 sm:flex">
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[var(--text)] hover:border-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/40"
            onClick={() => onChange(prevMonth)}
            aria-label="Mes anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-[var(--text)] hover:border-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/40"
            onClick={() => onChange(defaultMonth)}
          >
            Mes actual
          </button>
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[var(--text)] hover:border-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/40"
            onClick={() => onChange(nextMonth)}
            aria-label="Mes siguiente"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
