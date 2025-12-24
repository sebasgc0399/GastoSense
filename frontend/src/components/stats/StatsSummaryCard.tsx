import { formatPesos } from '../../utils/format';

export type SummaryTone = 'neutral' | 'success' | 'danger';

export interface SummaryItem {
  label: string;
  value: number;
  tone?: SummaryTone;
}

interface StatsSummaryCardProps {
  title?: string;
  items: SummaryItem[];
  className?: string;
}

const getToneClass = (tone?: SummaryTone) => {
  if (tone === 'success') return 'text-emerald-300';
  if (tone === 'danger') return 'text-red-300';
  return 'text-white';
};

export function StatsSummaryCard({ title = 'Resumen', items, className }: StatsSummaryCardProps) {
  return (
    <div className={`card ${className ?? ''}`.trim()}>
      <p className="text-[11px] uppercase text-[var(--muted)]">{title}</p>
      <div className="mt-2 space-y-2">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between text-sm">
            <span className="text-xs uppercase text-[var(--muted)]">{item.label}</span>
            <span className={`font-semibold ${getToneClass(item.tone)}`}>{formatPesos(item.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
