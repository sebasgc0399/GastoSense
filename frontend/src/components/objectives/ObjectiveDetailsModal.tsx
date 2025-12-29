import { useMemo, useState } from 'react';
import { useConfirm } from '../../hooks/useConfirm';
import { formatPesos } from '../../utils/format';
import type { Objective, ObjectiveEntry, ObjectiveEntryKind } from '../../types';

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
    return Math.min(objective.currentAmount / objective.targetAmount, 1.2);
  }, [objective]);
  const remaining = objective ? Math.max(objective.targetAmount - objective.currentAmount, 0) : 0;
  const isGoal = objective?.type === 'goal';

  if (!open || !objective) return null;

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
    <div className="fixed inset-0 z-50 flex items-end justify-center px-0 md:items-center md:px-3">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        className="relative flex h-[90vh] w-full max-w-none flex-col overflow-hidden rounded-t-2xl border border-[var(--modal-border)] bg-[var(--modal-surface)] text-[var(--text)] shadow-2xl backdrop-blur md:h-auto md:max-h-[85vh] md:max-w-lg md:rounded-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Detalle del objetivo"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="shrink-0 border-b border-[var(--modal-border)] px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-[var(--text)]">{objective.name}</h3>
            <button
              className="text-sm font-semibold text-[var(--text-muted)] hover:text-[var(--text)]"
              onClick={onClose}
            >
              Cerrar
            </button>
          </div>
          <p className="text-xs text-[var(--text-muted)]">
            {isGoal ? 'Meta de ahorro' : 'Deuda'} {objective.dueDate ? `• Vence ${objective.dueDate}` : ''}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="space-y-4">
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3">
              <div className="flex items-center justify-between text-sm text-[var(--text-muted)]">
                <span>{isGoal ? 'Ahorrado' : 'Pagado'}</span>
                <span className="text-white">
                  {formatPesos(objective.currentAmount)} / {formatPesos(objective.targetAmount)}
                </span>
              </div>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {isGoal ? 'Faltan' : 'Restante'} {formatPesos(remaining)}
              </p>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className={`h-full rounded-full ${isGoal ? 'bg-emerald-500' : 'bg-sky-500'}`}
                  style={{ width: `${Math.min(progress * 100, 120)}%` }}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onQuickAction(isGoal ? 'deposit' : 'payment')}
                className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
              >
                {isGoal ? '+ Abonar' : '+ Pagar'}
              </button>
              {isGoal && (
                <button
                  type="button"
                  onClick={() => onQuickAction('withdraw')}
                  className="rounded-lg border border-[var(--card-border)] bg-[var(--input-bg)] px-3 py-2 text-sm font-semibold text-[var(--text)] hover:border-primary"
                >
                  Retirar
                </button>
              )}
              <button
                type="button"
                onClick={() => onEdit(objective)}
                className="rounded-lg border border-[var(--card-border)] bg-[var(--input-bg)] px-3 py-2 text-sm font-semibold text-[var(--text)] hover:border-primary"
              >
                Editar
              </button>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-white">Historial</h4>
                <span className="text-xs text-[var(--text-muted)]">{entries.length} movimientos</span>
              </div>
              {entriesError && <p className="text-sm text-red-400">{entriesError}</p>}
              {entries.length === 0 ? (
                <p className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--text-muted)]">
                  Aun no hay movimientos.
                </p>
              ) : (
                <ul className="space-y-2">
                  {entries.map((entry) => {
                    const displayDate = entry.effectiveDate || entry.createdAt?.slice(0, 10) || '--';
                    return (
                      <li
                        key={entry.id}
                        className="flex items-start justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2"
                      >
                        <div>
                          <p className="text-sm font-semibold text-white">{entryKindLabel(entry.kind)}</p>
                          <p className="text-xs text-[var(--text-muted)]">{displayDate}</p>
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
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-[var(--modal-border)] px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
          {error && <p className="mb-2 text-sm text-red-400">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleArchive}
              disabled={busy}
              className="rounded-lg border border-[var(--card-border)] bg-[var(--input-bg)] px-4 py-2 text-sm font-semibold text-[var(--text)] hover:border-primary disabled:opacity-60"
            >
              Archivar
            </button>
            <button
              onClick={handleDelete}
              disabled={busy}
              className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-200 hover:border-red-400 disabled:opacity-60"
            >
              Eliminar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
