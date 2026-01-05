import type { CSSProperties, MouseEvent } from 'react';
import { formatPesos } from '../../utils/format';
import type { Objective, ObjectiveEntryKind } from '../../types';
import { CategoryIcon } from '../ui/CategoryIcon';

interface ObjectiveCardProps {
  objective: Objective;
  onOpenDetails: (objective: Objective) => void;
  onQuickAction: (objective: Objective, kind: ObjectiveEntryKind) => void;
}

const defaultIconForType = (type: Objective['type']) => (type === 'debt' ? 'CreditCard' : 'PiggyBank');
const defaultColorForType = (type: Objective['type']) =>
  type === 'debt' ? 'rgba(59, 130, 246, 0.18)' : 'rgba(34, 197, 94, 0.18)';

export function ObjectiveCard({ objective, onOpenDetails, onQuickAction }: ObjectiveCardProps) {
  const target = objective.targetAmount;
  const current = objective.currentAmount;
  const rawRemaining = target - current;
  const remaining = Math.max(rawRemaining, 0);
  const overAmount = rawRemaining < 0 ? Math.abs(rawRemaining) : 0;
  const hasOverTarget = rawRemaining < 0;
  const isComplete = objective.status === 'completed' || (target > 0 && current >= target);
  const progress = target > 0 ? Math.min(current / target, 1) : 0;
  const percent = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
  const isGoal = objective.type === 'goal';
  const statusLabel =
    objective.status === 'archived'
      ? 'Archivado'
      : hasOverTarget
        ? 'Excedido'
        : isComplete
          ? 'Completado'
          : null;
  const iconName = objective.icon || defaultIconForType(objective.type);
  const iconBg = objective.color || defaultColorForType(objective.type);
  const subtitle = objective.dueDate ? `Vence ${objective.dueDate}` : isGoal ? 'Meta de ahorro' : 'Deuda';
  const remainingLabel = hasOverTarget
    ? isGoal
      ? `Excedido por ${formatPesos(overAmount)}`
      : `Saldo a favor: ${formatPesos(overAmount)}`
    : isGoal
      ? `Faltan ${formatPesos(remaining)}`
      : `Restante ${formatPesos(remaining)}`;
  const progressStyle = { '--pct': `${Math.min(progress * 100, 100)}%` } as CSSProperties;

  const handleCardClick = () => onOpenDetails(objective);
  const handleQuickAction =
    (kind: ObjectiveEntryKind) =>
    (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      onQuickAction(objective, kind);
    };

  return (
    <div
      className="card cursor-pointer space-y-4 shadow-lg transition duration-200 hover:scale-[1.02] hover:border-[var(--border-20)] hover:shadow-xl"
      role="button"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handleCardClick();
        }
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--border-10)]"
            style={{ backgroundColor: iconBg }}
          >
            <CategoryIcon name={iconName} size={18} className="text-[var(--text)]" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-[var(--text)]">{objective.name}</h3>
            <p className="text-xs text-[var(--text-muted)]">{subtitle}</p>
          </div>
        </div>
        {statusLabel && (
          <span className="rounded-full border border-[var(--border-10)] bg-[var(--overlay-10)] px-2 py-1 text-[11px] font-semibold text-[var(--text)]">
            {statusLabel}
          </span>
        )}
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between text-sm text-[var(--text-muted)]">
          <span>{isGoal ? 'Ahorrado' : 'Pagado'}</span>
          <span className="text-[var(--text)]">
            {formatPesos(current)} / {formatPesos(target)}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
          <span>{target > 0 ? `${percent}%` : 'Sin meta'}</span>
          <span>{remainingLabel}</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--overlay-10)]">
          <div
            className={`progress-fill h-full rounded-full ${
              isGoal ? 'bg-gradient-to-r from-emerald-500 to-teal-400' : 'bg-gradient-to-r from-sky-500 to-indigo-400'
            }`}
            style={progressStyle}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleQuickAction(isGoal ? 'deposit' : 'payment')}
          className="inline-flex items-center gap-2 rounded-full border border-[var(--border-10)] bg-[var(--overlay-5)] px-3 py-1.5 text-xs font-semibold text-white/90 hover:border-primary"
        >
          <span className="text-base leading-none">+</span>
          {isGoal ? 'Abonar' : 'Pagar'}
        </button>
        {isGoal && (
          <button
            type="button"
            onClick={handleQuickAction('withdraw')}
            className="rounded-full border border-[var(--card-border)] bg-[var(--input-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--text)] hover:border-primary"
          >
            Retirar
          </button>
        )}
      </div>
    </div>
  );
}
