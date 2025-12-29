import { useEffect, useMemo, useState } from 'react';
import { todayIso } from '../../utils/dates';
import { formatPesos } from '../../utils/format';
import type { Objective, ObjectiveEntryInput, ObjectiveEntryKind } from '../../types';

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
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setAmount('');
    setNote('');
    setEffectiveDate(todayIso());
    setError(null);
  }, [open, objective?.id, kind]);

  const amountValue = useMemo(() => Number(amount), [amount]);
  const isAmountValid = Number.isFinite(amountValue) && amountValue > 0;
  const isWithdraw = kind === 'withdraw';
  const exceedsAvailable = Boolean(objective && isWithdraw && isAmountValid && amountValue > objective.currentAmount);
  const exceedsTarget = useMemo(() => {
    if (!objective || !isAmountValid) return false;
    if (isWithdraw) return false;
    return objective.targetAmount > 0 && objective.currentAmount + amountValue > objective.targetAmount;
  }, [amountValue, isAmountValid, isWithdraw, objective]);
  const disableSave = saving || !isAmountValid || exceedsAvailable;

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
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        className="relative flex h-[85vh] w-full max-w-none flex-col overflow-hidden rounded-t-2xl border border-[var(--modal-border)] bg-[var(--modal-surface)] text-[var(--text)] shadow-2xl backdrop-blur md:h-auto md:max-h-[80vh] md:max-w-md md:rounded-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Registrar movimiento"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="shrink-0 border-b border-[var(--modal-border)] px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-[var(--text)]">
              {kindLabelMap[kind]} en {objective.name}
            </h3>
            <button
              className="text-sm font-semibold text-[var(--text-muted)] hover:text-[var(--text)]"
              onClick={onClose}
            >
              Cerrar
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="space-y-3">
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-[var(--text-muted)]">
              <span className="font-semibold text-white">{formatPesos(objective.currentAmount)}</span> de{' '}
              {formatPesos(objective.targetAmount)}
              {objective.type === 'debt' ? ' pagado' : ' ahorrado'}
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--text-muted)]">Monto</label>
              <div className="flex items-center rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-[var(--text)] focus-within:border-primary">
                <span className="text-base text-[var(--text-muted)]">$</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  className="ml-2 w-full bg-transparent text-base text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none"
                  placeholder="0"
                />
              </div>
              {exceedsAvailable && (
                <p className="mt-1 text-xs text-red-300">No puedes retirar mas de lo ahorrado.</p>
              )}
              {exceedsTarget && (
                <p className="mt-1 text-xs text-amber-200">
                  Este movimiento supera el objetivo ({formatPesos(objective.targetAmount)}).
                </p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--text-muted)]">Nota</label>
              <input
                type="text"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className="w-full rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-primary focus:outline-none"
                placeholder="Descripcion opcional"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--text-muted)]">Fecha</label>
              <input
                type="date"
                value={effectiveDate}
                onChange={(event) => setEffectiveDate(event.target.value)}
                className="w-full rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text)] focus:border-primary focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-[var(--modal-border)] px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
          {error && <p className="mb-2 text-sm text-red-400">{error}</p>}
          <button
            onClick={handleSave}
            disabled={disableSave}
            className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white shadow hover:bg-emerald-700 disabled:opacity-60"
          >
            {saving ? 'Guardando...' : 'Guardar movimiento'}
          </button>
          <button
            onClick={onClose}
            disabled={saving}
            className="mt-2 w-full rounded-xl border border-[var(--card-border)] bg-[var(--input-bg)] px-4 py-2 text-sm font-semibold text-[var(--text)] hover:border-primary disabled:opacity-60"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
