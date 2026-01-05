import clsx from 'clsx';

interface IaQuotaProgressProps {
  label: string;
  used: number;
  limit: number;
  ratio: number; // 0-1
  onUpgradeClick?: () => void;
}

export function IaQuotaProgress({ label, used, limit, ratio, onUpgradeClick }: IaQuotaProgressProps) {
  const percent = Math.round(ratio * 100);
  const state: 'ok' | 'warn' | 'danger' =
    ratio >= 1 ? 'danger' : ratio >= 0.8 ? 'warn' : 'ok';

  return (
    <div className="space-y-1 rounded-xl border border-[var(--border-10)] bg-[var(--overlay-5)] p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-[var(--text)]">{label}</span>
        <span className="text-xs text-[var(--text-muted)]">
          {used}/{limit} ({percent}%)
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-[var(--overlay-10)]">
        <div
          className={clsx(
            'h-2 rounded-full transition-all',
            state === 'ok' && 'bg-emerald-500',
            state === 'warn' && 'bg-amber-500',
            state === 'danger' && 'bg-rose-500',
          )}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
      {state !== 'ok' && onUpgradeClick && (
        <button
          type="button"
          className="mt-1 text-xs font-medium text-primary underline"
          onClick={onUpgradeClick}
        >
          {ratio >= 1 ? 'Me quedé corto, ver planes' : 'Mejorar plan antes de que se acabe'}
        </button>
      )}
    </div>
  );
}
