import type React from 'react';

interface Props {
  currentMonth: string;
  defaultMonth: string;
  onChange: React.Dispatch<React.SetStateAction<string>>;
  description: string;
  title?: string;
}

export function ReferenceMonthCard({
  currentMonth,
  defaultMonth,
  onChange,
  description,
  title = 'Mes de referencia',
}: Props) {
  return (
    <div className="card flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-xs uppercase text-[var(--text-muted)]">{title}</p>
        <p className="text-sm text-[var(--text-muted)]">{description}</p>
      </div>
      <input
        type="month"
        value={currentMonth}
        onChange={(e) => onChange(e.target.value || defaultMonth)}
        className="input w-full max-w-full bg-[var(--input-bg)] sm:w-auto sm:min-w-[180px]"
      />
    </div>
  );
}
