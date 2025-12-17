interface Props {
  title: string;
  value: number;
  subtitle?: string;
  tone?: 'neutral' | 'success' | 'danger';
}

export function CardStat({ title, value, subtitle, tone = 'neutral' }: Props) {
  const color = tone === 'success' ? 'text-emerald-300' : tone === 'danger' ? 'text-red-300' : 'text-white';
  return (
    <div className="card">
      <p className="text-xs uppercase text-[var(--muted)]">{title}</p>
      <p className={`text-2xl font-bold ${color}`}>${value.toLocaleString()}</p>
      {subtitle && <p className="text-sm text-[var(--muted)]">{subtitle}</p>}
    </div>
  );
}
