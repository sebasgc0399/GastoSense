interface Props {
  title: string;
  value: number;
  subtitle?: string;
  tone?: 'neutral' | 'success' | 'danger';
}

export function CardStat({ title, value, subtitle, tone = 'neutral' }: Props) {
  const color = tone === 'success' ? 'text-[var(--accent)]' : tone === 'danger' ? 'text-[var(--error-text)]' : 'text-[var(--text)]';
  return (
    <div className="card">
      <p className="text-xs uppercase text-[var(--text-muted)]">{title}</p>
      <p className={`text-2xl font-bold ${color}`}>${value.toLocaleString()}</p>
      {subtitle && <p className="text-sm text-[var(--text-muted)]">{subtitle}</p>}
    </div>
  );
}
