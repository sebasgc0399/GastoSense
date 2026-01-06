import { useEffect, useMemo, useState } from 'react';
import { todayIso } from '../../utils/dates';
import { digitsOnly, formatCOP, parseCOP } from '../../utils/amount';
import { formatPesos } from '../../utils/format';
import type { Objective, ObjectiveEntryInput, ObjectiveEntryKind } from '../../types';
import styles from './ObjectiveEntryModal.module.css';

interface ObjectiveEntryModalProps {
  open: boolean;
  objective: Objective | null;
  kind: ObjectiveEntryKind | null;
  onClose: () => void;
  onSave: (objectiveId: string, payload: ObjectiveEntryInput) => Promise<void>;
}

const kindLabelMap: Record<ObjectiveEntryKind, string> = {
  deposit: 'Abonar',
  withdraw: 'Retirar',
  payment: 'Pagar',
};

export function ObjectiveEntryModal({ open, objective, kind, onClose, onSave }: ObjectiveEntryModalProps) {
  const [amountDigits, setAmountDigits] = useState('');
  const [note, setNote] = useState('');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setAmountDigits('');
    setNote('');
    setEffectiveDate(todayIso());
    setError(null);
  }, [open, objective?.id, kind]);

  const amountValue = useMemo(() => parseCOP(amountDigits), [amountDigits]);
  const isAmountValid = Number.isFinite(amountValue) && amountValue > 0;
  const isWithdraw = kind === 'withdraw';
  const exceedsAvailable = Boolean(objective && isWithdraw && isAmountValid && amountValue > objective.currentAmount);
  const exceedsTarget = useMemo(() => {
    if (!objective || !isAmountValid) return false;
    if (isWithdraw) return false;
    return objective.targetAmount > 0 && objective.currentAmount + amountValue > objective.targetAmount;
  }, [amountValue, isAmountValid, isWithdraw, objective]);
  const disableSave = saving || !isAmountValid || exceedsAvailable;
  const caretClass = amountDigits ? 'caret-white' : styles.caretTransparent;

  if (!open || !objective || !kind) return null;

  const handleSave = async () => {
    if (disableSave) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(objective.id, {
        kind,
        amount: amountValue,
        note: note.trim() || undefined,
        effectiveDate: effectiveDate || undefined,
      });
      onClose();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center px-0 md:items-center md:px-3">
      <div
        className="fixed inset-0 modal-scrim backdrop-blur-xl animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="relative flex h-[85vh] w-full max-w-none flex-col overflow-hidden rounded-t-3xl border border-[var(--modal-border)] bg-[var(--modal-surface)]/95 text-[var(--text)] shadow-2xl backdrop-blur-xl animate-sheet-up md:h-auto md:max-h-[80vh] md:max-w-md md:rounded-3xl md:animate-fade-in"
        role="dialog"
        aria-modal="true"
        aria-label="Registrar movimiento"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="shrink-0 px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
                {kindLabelMap[kind]}
              </p>
              <p className="text-sm text-[var(--text)]">{objective.name}</p>
            </div>
            <button
              className="pill-surface px-3 py-1 text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text)]"
              onClick={onClose}
            >
              Cerrar
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-6">
          <div className="mx-auto flex max-w-sm flex-col items-center text-center">
            <p className="text-xs text-[var(--text-muted)]">
              {formatPesos(objective.currentAmount)} de {formatPesos(objective.targetAmount)}
              {objective.type === 'debt' ? ' pagado' : ' ahorrado'}
            </p>
            <div className="mt-4 flex items-center justify-center gap-3">
              <span className="text-2xl text-[var(--text-muted)]">$</span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={formatCOP(amountDigits)}
                onChange={(event) => setAmountDigits(digitsOnly(event.target.value))}
                className={`w-full max-w-[240px] bg-transparent text-center text-5xl font-semibold text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none ${caretClass}`}
                placeholder="0"
                autoFocus
              />
            </div>
            {exceedsAvailable && (
              <p className="mt-2 text-xs text-[var(--error-text)]">No puedes retirar mas de lo ahorrado.</p>
            )}
            {exceedsTarget && (
              <p className="mt-2 text-xs text-amber-200">
                Este movimiento supera el objetivo ({formatPesos(objective.targetAmount)}).
              </p>
            )}
          </div>

          <div className="mt-6 space-y-3">
            <div className="rounded-2xl surface-soft px-4 py-3">
              <label className="sr-only" htmlFor="objective-entry-note">
                Nota
              </label>
              <input
                id="objective-entry-note"
                type="text"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className="w-full bg-transparent text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none"
                placeholder="Nota (opcional)"
              />
            </div>
            <div className="rounded-2xl surface-soft px-4 py-3">
              <label className="sr-only" htmlFor="objective-entry-date">
                Fecha
              </label>
              <input
                id="objective-entry-date"
                type="date"
                value={effectiveDate}
                onChange={(event) => setEffectiveDate(event.target.value)}
                className="w-full bg-transparent text-sm text-[var(--text)] focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-[var(--border-10)] bg-[var(--modal-surface)]/95 px-6 py-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur-xl">
          {error && <p className="mb-2 text-sm text-[var(--error-text)]">{error}</p>}
          <button
            onClick={handleSave}
            disabled={disableSave}
            className="w-full rounded-full bg-primary px-4 py-3 text-sm font-semibold text-[var(--text)] shadow hover:opacity-90 disabled:opacity-60"
          >
            {saving ? 'Guardando...' : 'Guardar movimiento'}
          </button>
          <button
            onClick={onClose}
            disabled={saving}
            className="mt-2 w-full rounded-full border border-[var(--card-border)] bg-[var(--input-bg)] px-4 py-2 text-sm font-semibold text-[var(--text)] hover:border-primary disabled:opacity-60"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
