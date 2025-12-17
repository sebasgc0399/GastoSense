interface Props {
  title: string;
  value: number;
  tone?: 'neutral' | 'success' | 'danger';
}

export function CardMini({ title, value, tone = 'neutral' }: Props) {
  const color = tone === 'success' ? 'text-emerald-300' : tone === 'danger' ? 'text-red-300' : 'text-white';
  return (
    <div className="card">
      <p className="text-xs uppercase text-[var(--muted)]">{title}</p>
      <p className={`text-lg font-bold ${color}`}>${value.toLocaleString()}</p>
    </div>
  );
}
