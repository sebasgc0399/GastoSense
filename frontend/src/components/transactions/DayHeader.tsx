export interface DayHeaderProps {
  date: string;
  dayIncome: number;
  dayExpense: number;
  dayNet: number;
  count: number;
}

const MONTH_FORMATTER = new Intl.DateTimeFormat('es-CO', { month: 'short' });
const WEEKDAY_FORMATTER = new Intl.DateTimeFormat('es-CO', { weekday: 'long' });

const parseIsoDate = (value: string) => {
  const parts = value.split('-');
  if (parts.length !== 3) return null;
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!year || !month || !day) return null;
  const parsed = new Date(year, month - 1, day);
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return null;
  return parsed;
};

const formatMonth = (value: string) => {
  const cleaned = value.replace(/\./g, '');
  const lower = cleaned.toLocaleLowerCase('es-CO');
  if (!lower) return cleaned;
  return `${lower.charAt(0).toLocaleUpperCase('es-CO')}${lower.slice(1)}`;
};

export function DayHeader({ date, dayNet, count }: DayHeaderProps) {
  const parsedDate = parseIsoDate(date);
  const currentYear = new Date().getFullYear();
  const primary = parsedDate ? `${formatMonth(MONTH_FORMATTER.format(parsedDate))} ${parsedDate.getDate()}` : date;
  const weekday = parsedDate ? WEEKDAY_FORMATTER.format(parsedDate).toLocaleLowerCase('es-CO') : '';
  const yearSuffix = parsedDate && parsedDate.getFullYear() !== currentYear ? ` ${parsedDate.getFullYear()}` : '';
  const secondary = weekday ? `${weekday}${yearSuffix}` : '';
  const absNet = Math.abs(dayNet);
  const netPrefix = dayNet < 0 ? '-' : dayNet > 0 ? '+' : '';
  const netLabel = `${netPrefix ? `${netPrefix} ` : ''}$${absNet.toLocaleString('es-CO')}`;
  const movLabel = count === 1 ? 'mov' : 'movs';

  return (
    <div className="flex items-start justify-between gap-3 rounded-lg surface-soft px-3 py-1.5">
      <div className="flex flex-col">
        <p className="text-sm font-semibold text-[var(--text)]">{primary}</p>
        {secondary ? <p className="text-[11px] text-[var(--text-muted)]">{secondary}</p> : null}
      </div>
      <div className="text-right text-sm">
        <span className="font-semibold text-[var(--text)] tabular-nums">{netLabel}</span>
        <span className="text-[var(--text-muted)]">{` \u00b7 ${count} ${movLabel}`}</span>
      </div>
    </div>
  );
}
