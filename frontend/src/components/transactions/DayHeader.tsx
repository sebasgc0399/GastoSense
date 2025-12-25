export interface DayHeaderProps {
  date: string;
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

export function DayHeader({ date }: DayHeaderProps) {
  const parsedDate = parseIsoDate(date);
  const currentYear = new Date().getFullYear();
  const primary = parsedDate ? `${formatMonth(MONTH_FORMATTER.format(parsedDate))} ${parsedDate.getDate()}` : date;
  const weekday = parsedDate ? WEEKDAY_FORMATTER.format(parsedDate).toLocaleLowerCase('es-CO') : '';
  const yearSuffix = parsedDate && parsedDate.getFullYear() !== currentYear ? ` ${parsedDate.getFullYear()}` : '';
  const secondary = weekday ? `${weekday}${yearSuffix}` : '';

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 shadow-sm backdrop-blur-sm">
      <p className="text-xs font-semibold text-slate-200">{primary}</p>
      {secondary ? <p className="text-[11px] text-slate-400">{secondary}</p> : null}
    </div>
  );
}
