interface FeatureLockCardProps {
  title: string;
  description: string;
  badgeLabel: string;
  onUpgradeClick: () => void;
}

export function FeatureLockCard({ title, description, badgeLabel, onUpgradeClick }: FeatureLockCardProps) {
  return (
    <button
      type="button"
      onClick={onUpgradeClick}
      className="flex w-full items-start gap-3 rounded-xl border border-dashed border-white/20 bg-white/5 p-3 text-left opacity-80 transition hover:opacity-100"
    >
      <span aria-hidden className="mt-1 inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/30 text-xs">
        🔒
      </span>
      <div className="flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white">{title}</span>
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
            {badgeLabel}
          </span>
        </div>
        <p className="text-xs text-slate-300">{description}</p>
        <p className="text-[11px] font-medium text-primary">Toca para ver cómo desbloquearlo</p>
      </div>
    </button>
  );
}
