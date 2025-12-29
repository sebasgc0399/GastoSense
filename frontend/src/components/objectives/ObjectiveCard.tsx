import type { MouseEvent } from 'react';
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
  const progress = target > 0 ? Math.min(current / target, 1.2) : 0;
  const percent = target > 0 ? Math.round((current / target) * 100) : 0;
  const remaining = Math.max(target - current, 0);
  const isGoal = objective.type === 'goal';
  const statusLabel =
    objective.status === 'archived' ? 'Archivado' : objective.status === 'completed' ? 'Completado' : null;
  const iconName = objective.icon || defaultIconForType(objective.type);
  const iconBg = objective.color || defaultColorForType(objective.type);

  const handleCardClick = () => onOpenDetails(objective);
  const handleQuickAction =
    (kind: ObjectiveEntryKind) =>
    (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      onQuickAction(objective, kind);
    };

  return (
    <div
      className="card cursor-pointer space-y-3 transition hover:border-primary/60"
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
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10"
            style={{ backgroundColor: iconBg }}
          >
            <CategoryIcon name={iconName} size={18} className="text-white" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white">{objective.name}</h3>
            <p className="text-xs text-[var(--text-muted)]">
              {isGoal ? 'Meta de ahorro' : 'Deuda'} {objective.dueDate ? `• Vence ${objective.dueDate}` : ''}
            </p>
          </div>
        </div>
        {statusLabel && (
          <span className="rounded-full border border-white/10 bg-white/10 px-2 py-1 text-[11px] font-semibold text-white">
            {statusLabel}
          </span>
        )}
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between text-sm text-[var(--text-muted)]">
          <span>{isGoal ? 'Ahorrado' : 'Pagado'}</span>
          <span className="text-white">
            {formatPesos(current)} / {formatPesos(target)}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
          <span>{target > 0 ? `${percent}%` : 'Sin meta'}</span>
          <span>{isGoal ? `Faltan ${formatPesos(remaining)}` : `Restante ${formatPesos(remaining)}`}</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full rounded-full ${isGoal ? 'bg-emerald-500' : 'bg-sky-500'}`}
            style={{ width: `${Math.min(progress * 100, 120)}%` }}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleQuickAction(isGoal ? 'deposit' : 'payment')}
          className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          {isGoal ? '+ Abonar' : '+ Pagar'}
        </button>
        {isGoal && (
          <button
            type="button"
            onClick={handleQuickAction('withdraw')}
            className="rounded-lg border border-[var(--card-border)] bg-[var(--input-bg)] px-3 py-2 text-sm font-semibold text-[var(--text)] hover:border-primary"
          >
            Retirar
          </button>
        )}
      </div>
    </div>
  );
}
