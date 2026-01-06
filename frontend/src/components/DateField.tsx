import { Calendar } from 'lucide-react';

interface DateFieldProps {
  id: string;
  value: string;
  onChange: (nextValue: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}

const formatDateLabel = (value: string) => {
  if (!value) return '';
  const parts = value.split('-');
  if (parts.length !== 3) return value;
  const [year, month, day] = parts;
  if (!year || !month || !day) return value;
  return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
};

export function DateField({ id, value, onChange, placeholder = 'Seleccionar fecha', ariaLabel }: DateFieldProps) {
  const label = value ? formatDateLabel(value) : placeholder;

  return (
    <div className="relative">
      <div className="input flex min-h-[44px] items-center justify-between gap-2 focus-within:border-primary focus-within:ring-2 focus-within:ring-[var(--focus-ring)]">
        <span className={value ? 'text-[var(--text)]' : 'text-[var(--text-muted)]'}>{label}</span>
        <Calendar className="h-4 w-4 text-[var(--text-muted)]" aria-hidden="true" />
      </div>
      <input
        id={id}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent text-[16px] text-transparent opacity-0"
      />
    </div>
  );
}
