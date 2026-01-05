import { useEffect, useMemo, useState } from 'react';
import { digitsOnly, formatCOP, parseCOP } from '../../utils/amount';
import { IconPicker } from '../ui/IconPicker';
import type { Objective, ObjectiveInput, ObjectiveType, ObjectiveUpdate } from '../../types';

interface ObjectiveFormModalProps {
  open: boolean;
  mode: 'create' | 'edit';
  objective?: Objective | null;
  initialType?: ObjectiveType;
  onClose: () => void;
  onCreate: (payload: ObjectiveInput) => Promise<void>;
  onUpdate: (id: string, patch: ObjectiveUpdate) => Promise<void>;
}

const defaultIconForType = (type: ObjectiveType) => (type === 'debt' ? 'CreditCard' : 'PiggyBank');

export function ObjectiveFormModal({
  open,
  mode,
  objective,
  initialType = 'goal',
  onClose,
  onCreate,
  onUpdate,
}: ObjectiveFormModalProps) {
  const [type, setType] = useState<ObjectiveType>(initialType);
  const [name, setName] = useState('');
  const [targetDigits, setTargetDigits] = useState('');
  const [icon, setIcon] = useState(defaultIconForType(initialType));
  const [color, setColor] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && objective) {
      setType(objective.type);
      setName(objective.name);
      setTargetDigits(digitsOnly(String(objective.targetAmount)));
      setIcon(objective.icon || defaultIconForType(objective.type));
      setColor(objective.color || '');
      setDueDate(objective.dueDate || '');
    } else {
      setType(initialType);
      setName('');
      setTargetDigits('');
      setIcon(defaultIconForType(initialType));
      setColor('');
      setDueDate('');
    }
    setError(null);
  }, [initialType, mode, objective, open]);

  const targetValue = useMemo(() => parseCOP(targetDigits), [targetDigits]);
  const canSave = name.trim().length > 0 && Number.isFinite(targetValue) && targetValue > 0;
  const isEdit = mode === 'edit';

  if (!open) return null;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      if (isEdit && objective) {
        await onUpdate(objective.id, {
          name: name.trim(),
          targetAmount: targetValue,
          icon: icon || null,
          color: color || null,
          dueDate: dueDate || null,
        });
      } else {
        await onCreate({
          type,
          name: name.trim(),
          targetAmount: targetValue,
          icon: icon || undefined,
          color: color || undefined,
          dueDate: dueDate || undefined,
        });
      }
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
        className="relative flex h-[90vh] w-full max-w-none flex-col overflow-hidden rounded-t-2xl border border-[var(--modal-border)] bg-[var(--modal-surface)] text-[var(--text)] shadow-2xl backdrop-blur md:h-auto md:max-h-[85vh] md:max-w-lg md:rounded-2xl"
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? 'Editar objetivo' : 'Crear objetivo'}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="shrink-0 border-b border-[var(--modal-border)] px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-[var(--text)]">
              {isEdit ? 'Editar objetivo' : 'Nuevo objetivo'}
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
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--text-muted)]">Tipo</label>
              <div className="flex rounded-lg border border-[var(--card-border)] bg-[var(--input-bg)] p-1 text-xs">
                <button
                  type="button"
                  aria-pressed={type === 'goal'}
                  disabled={isEdit}
                  onClick={() => setType('goal')}
                  className={`flex-1 rounded-md px-3 py-2 font-semibold ${
                    type === 'goal' ? 'bg-emerald-500 text-[var(--text)]' : 'text-[var(--text)]'
                  } ${isEdit ? 'cursor-not-allowed opacity-60' : ''}`}
                >
                  Ahorro
                </button>
                <button
                  type="button"
                  aria-pressed={type === 'debt'}
                  disabled={isEdit}
                  onClick={() => setType('debt')}
                  className={`flex-1 rounded-md px-3 py-2 font-semibold ${
                    type === 'debt' ? 'bg-sky-500 text-[var(--text)]' : 'text-[var(--text)]'
                  } ${isEdit ? 'cursor-not-allowed opacity-60' : ''}`}
                >
                  Deuda
                </button>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--text-muted)]">Nombre</label>
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-primary focus:outline-none"
                placeholder="Ej. Viaje, Fondo emergencia"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--text-muted)]">Monto objetivo</label>
              <div className="flex items-center rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-[var(--text)] focus-within:border-primary">
                <span className="text-base text-[var(--text-muted)]">$</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={formatCOP(targetDigits)}
                  onChange={(event) => setTargetDigits(digitsOnly(event.target.value))}
                  className="ml-2 w-full bg-transparent text-base text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none"
                  placeholder="0"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--text-muted)]">Fecha limite</label>
              <input
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                className="w-full rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text)] focus:border-primary focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--text-muted)]">Color</label>
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={color}
                  onChange={(event) => setColor(event.target.value)}
                  className="w-full rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-primary focus:outline-none"
                  placeholder="Ej. #22c55e"
                />
                <div
                  className="h-10 w-10 rounded-xl border border-[var(--border-10)]"
                  style={{ backgroundColor: color || 'rgba(255,255,255,0.08)' }}
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold text-[var(--text-muted)]">Icono</label>
              <IconPicker selectedIcon={icon} onSelect={setIcon} />
              <div className="mt-2 flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => setIcon(defaultIconForType(type))}
                  className="text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text)]"
                >
                  Restablecer icono
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-[var(--modal-border)] px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
          {error && <p className="mb-2 text-sm text-[var(--error-text)]">{error}</p>}
          <button
            onClick={handleSave}
            disabled={!canSave || saving}
            className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-[var(--text)] shadow hover:bg-emerald-700 disabled:opacity-60"
          >
            {saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear objetivo'}
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
