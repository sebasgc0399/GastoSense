interface Props {
  title: string;
  value: number;
  tone?: 'neutral' | 'success' | 'danger';
}

export function CardMini({ title, value, tone = 'neutral' }: Props) {
  const color = tone === 'success' ? 'text-[var(--accent)]' : tone === 'danger' ? 'text-[var(--error-text)]' : 'text-[var(--text)]';
  return (
    <div className="card">
      <p className="text-xs uppercase text-[var(--muted)]">{title}</p>
      <p className={`text-lg font-bold ${color}`}>${value.toLocaleString()}</p>
    </div>
  );
}
