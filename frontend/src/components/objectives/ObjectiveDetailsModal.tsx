import { useMemo, useState } from 'react';
import { Pencil, X } from 'lucide-react';
import { useConfirm } from '../../hooks/useConfirm';
import { formatPesos } from '../../utils/format';
import type { Objective, ObjectiveEntry, ObjectiveEntryKind } from '../../types';
import { CategoryIcon } from '../ui/CategoryIcon';
import styles from './ObjectiveDetailsModal.module.css';

interface ObjectiveDetailsModalProps {
  open: boolean;
  objective: Objective | null;
  entries: ObjectiveEntry[];
  entriesError?: string | null;
  onClose: () => void;
  onEdit: (objective: Objective) => void;
  onArchive: (objectiveId: string) => Promise<void>;
  onDelete: (objectiveId: string) => Promise<void>;
  onDeleteEntry: (objectiveId: string, entryId: string) => Promise<void>;
  onQuickAction: (kind: ObjectiveEntryKind) => void;
}

const entryKindLabel = (kind: ObjectiveEntryKind) =>
  kind === 'withdraw' ? 'Retiro' : kind === 'payment' ? 'Pago' : 'Abono';

export function ObjectiveDetailsModal({
  open,
  objective,
  entries,
  entriesError,
  onClose,
  onEdit,
  onArchive,
  onDelete,
  onDeleteEntry,
  onQuickAction,
}: ObjectiveDetailsModalProps) {
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const progress = useMemo(() => {
    if (!objective || objective.targetAmount <= 0) return 0;
    return Math.min(objective.currentAmount / objective.targetAmount, 1);
  }, [objective]);
  const rawRemaining = objective ? objective.targetAmount - objective.currentAmount : 0;
  const remaining = Math.max(rawRemaining, 0);
  const overAmount = rawRemaining < 0 ? Math.abs(rawRemaining) : 0;
  const hasOverTarget = rawRemaining < 0;
  const isComplete =
    objective?.status === 'completed' ||
    ((objective?.targetAmount ?? 0) > 0 && (objective?.currentAmount ?? 0) >= (objective?.targetAmount ?? 0));
  const isGoal = objective?.type === 'goal';
  const statusLabel =
    objective?.status === 'archived'
      ? 'Archivado'
      : hasOverTarget
        ? 'Excedido'
        : isComplete
          ? 'Completado'
          : null;
  const remainingLabel = hasOverTarget
    ? isGoal
      ? `Excedido por ${formatPesos(overAmount)}`
      : `Saldo a favor: ${formatPesos(overAmount)}`
    : isGoal
      ? `Faltan ${formatPesos(remaining)}`
      : `Restante ${formatPesos(remaining)}`;

  if (!open || !objective) return null;

  const heroTint = objective.color || (isGoal ? 'rgba(16, 185, 129, 0.35)' : 'rgba(56, 189, 248, 0.35)');
  const ringColor = objective.color || (isGoal ? '#34d399' : '#38bdf8');
  const progressPct = Math.round(progress * 100);
  const heroBackground = `linear-gradient(135deg, ${heroTint}, rgba(15, 23, 42, 0.95))`;
  const ringStyle = {
    background: `conic-gradient(${ringColor} ${progressPct}%, rgba(255,255,255,0.18) 0)`,
  };
  const iconName = objective.icon || (isGoal ? 'PiggyBank' : 'CreditCard');

  const handleArchive = async () => {
    const ok = await confirm({
      title: 'Archivar objetivo?',
      description: 'Lo ocultaras de la lista principal.',
      confirmText: 'Archivar',
      cancelText: 'Cancelar',
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await onArchive(objective.id);
      onClose();
    } catch (err) {
      console.error(err);
      setError('No se pudo archivar.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: 'Eliminar objetivo?',
      description: 'Esta accion no se puede deshacer.',
      confirmText: 'Eliminar',
      cancelText: 'Cancelar',
      variant: 'destructive',
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await onDelete(objective.id);
      onClose();
    } catch (err) {
      console.error(err);
      setError('No se pudo eliminar.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteEntry = async (entryId: string) => {
    const ok = await confirm({
      title: 'Eliminar movimiento?',
      description: 'Esta accion no se puede deshacer.',
      confirmText: 'Eliminar',
      cancelText: 'Cancelar',
      variant: 'destructive',
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await onDeleteEntry(objective.id, entryId);
    } catch (err) {
      console.error(err);
      setError('No se pudo eliminar el movimiento.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-xl animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={`${styles.sheetInRight} absolute bottom-0 left-0 right-0 flex max-h-[92vh] flex-col overflow-hidden rounded-t-3xl border border-[var(--modal-border)] bg-[var(--modal-surface)]/95 text-[var(--text)] shadow-2xl backdrop-blur-xl animate-sheet-up md:bottom-0 md:right-0 md:left-auto md:top-0 md:h-full md:max-h-none md:w-[420px] md:rounded-none md:rounded-l-3xl md:border-b-0 md:border-r-0 md:border-t-0 md:border-l`}
        role="dialog"
        aria-modal="true"
        aria-label="Detalle del objetivo"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="shrink-0 border-b border-white/10 px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-white">{objective.name}</h3>
                {statusLabel && (
                  <span className="rounded-full border border-white/10 bg-white/10 px-2 py-1 text-[11px] font-semibold text-white">
                    {statusLabel}
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--text-muted)]">
                {isGoal ? 'Meta de ahorro' : 'Deuda'} {objective.dueDate ? `- Vence ${objective.dueDate}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onEdit(objective)}
                className="rounded-full border border-white/10 bg-white/5 p-2 text-white/80 hover:text-white"
                aria-label="Editar"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-white/10 bg-white/5 p-2 text-white/80 hover:text-white"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-6">
            <div className="rounded-3xl border border-white/10 p-5 shadow-lg" style={{ background: heroBackground }}>
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="h-16 w-16 rounded-full p-1" style={ringStyle}>
                    <div className="flex h-full w-full items-center justify-center rounded-full bg-slate-900/80">
                      <CategoryIcon name={iconName} size={26} className="text-white" />
                    </div>
                  </div>
                  <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white">
                    {progressPct}%
                  </span>
                </div>
                <div>
                  <p className="text-3xl font-semibold text-white md:text-4xl">
                    {formatPesos(objective.currentAmount)}
                  </p>
                  <p className="text-xs text-white/70">
                    de {formatPesos(objective.targetAmount)} {isGoal ? 'ahorrado' : 'pagado'}
                  </p>
                  <p className="mt-2 text-xs text-white/70">{remainingLabel}</p>
                </div>
              </div>
              <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className={`h-full rounded-full ${
                    isGoal ? 'bg-gradient-to-r from-emerald-500 to-teal-400' : 'bg-gradient-to-r from-sky-500 to-indigo-400'
                  }`}
                  style={{ width: `${Math.min(progress * 100, 100)}%` }}
                />
              </div>
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-white">Historial</h4>
                <span className="text-xs text-[var(--text-muted)]">{entries.length} movimientos</span>
              </div>
              {entriesError && <p className="text-sm text-red-400">{entriesError}</p>}
              {entries.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 px-4 py-3 text-sm text-[var(--text-muted)]">
                  Aun no hay movimientos.
                </div>
              ) : (
                <div className="relative">
                  <div className="absolute left-[76px] top-2 bottom-2 w-px bg-white/10" />
                  <ul className="space-y-4">
                    {entries.map((entry) => {
                      const displayDate = entry.effectiveDate || entry.createdAt?.slice(0, 10) || '--';
                      return (
                        <li key={entry.id} className="flex gap-4">
                          <div className="w-20 shrink-0 text-right text-xs text-[var(--text-muted)]">
                            {displayDate}
                          </div>
                          <div className="relative flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                            <span className="absolute -left-5 top-4 h-2.5 w-2.5 rounded-full bg-white/40 ring-4 ring-[var(--modal-surface)]" />
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-white">{entryKindLabel(entry.kind)}</p>
                                {entry.note && <p className="text-xs text-[var(--text-muted)]">{entry.note}</p>}
                              </div>
                              <div className="flex flex-col items-end gap-2">
                                <span className="text-sm font-semibold text-white">{formatPesos(entry.amount)}</span>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteEntry(entry.id)}
                                  disabled={busy}
                                  className="text-xs font-semibold text-red-300 hover:text-red-200 disabled:opacity-60"
                                >
                                  Eliminar
                                </button>
                              </div>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-white/10 bg-[var(--modal-surface)]/95 px-5 py-4 backdrop-blur-xl">
          {error && <p className="mb-2 text-sm text-red-400">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onQuickAction(isGoal ? 'deposit' : 'payment')}
              className="flex-1 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-white hover:opacity-90"
            >
              {isGoal ? 'Abonar' : 'Pagar'}
            </button>
            {isGoal && (
              <button
                type="button"
                onClick={() => onQuickAction('withdraw')}
                className="flex-1 rounded-full border border-[var(--card-border)] bg-[var(--input-bg)] px-4 py-3 text-sm font-semibold text-[var(--text)] hover:border-primary"
              >
                Retirar
              </button>
            )}
          </div>
          <div className="mt-3 flex items-center justify-between text-xs">
            <button
              onClick={handleArchive}
              disabled={busy}
              className="rounded-full border border-[var(--card-border)] bg-[var(--input-bg)] px-3 py-2 font-semibold text-[var(--text)] hover:border-primary disabled:opacity-60"
            >
              Archivar
            </button>
            <button
              onClick={handleDelete}
              disabled={busy}
              className="rounded-full border border-red-500/40 bg-red-500/10 px-3 py-2 font-semibold text-red-200 hover:border-red-400 disabled:opacity-60"
            >
              Eliminar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

