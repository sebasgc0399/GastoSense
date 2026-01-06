import { useEffect, useMemo, useState } from 'react';
import { paymentMethods } from '../data/frequentCategories';
import { useConfirm } from '../hooks/useConfirm';
import { useCategoriesController } from '../hooks/useCategoriesController';
import { ResponsiveSelect } from './ResponsiveSelect';
import type { Category, Transaction, TransactionInput } from '../types';

const EXPENSE_FALLBACK_ID = 'otros';
const INCOME_FALLBACK_ID = 'ingreso';
const resolveKind = (value?: Category['kind']) => (value === 'income' ? 'income' : 'expense');

interface Props {
  open: boolean;
  transaction: Transaction | null;
  onClose: () => void;
  onSave: (id: string, payload: TransactionInput) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  userId?: string | null;
}

export function TransactionEditModal({ open, transaction, onClose, onSave, onDelete, userId }: Props) {
  const [form, setForm] = useState<TransactionInput | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resolvedUserId = userId ?? transaction?.userId ?? null;
  const confirm = useConfirm();
  const { categories } = useCategoriesController({ userId: resolvedUserId, includeArchived: true });
  const categoryOptions = useMemo(() => {
    const txType = form?.type ?? 'expense';
    const sameKind = categories.filter((cat) => resolveKind(cat.kind) === txType);
    const options = sameKind.map((cat) => ({ value: cat.id, label: cat.label }));
    const currentId = form?.categoryId;
    if (currentId && !options.some((opt) => opt.value === currentId)) {
      options.unshift({ value: currentId, label: 'Categoría eliminada' });
    }
    return options;
  }, [categories, form?.categoryId, form?.type]);

  useEffect(() => {
    if (transaction) {
      setForm({
        amount: transaction.amount,
        categoryId: transaction.categoryId,
        note: transaction.note ?? '',
        type: transaction.type,
        paymentMethod: transaction.paymentMethod,
        date: transaction.date,
      });
    } else {
      setForm(null);
    }
  }, [transaction]);

  if (!open || !form || !transaction) return null;

  const handleChange = (field: keyof TransactionInput, value: string) => {
    setForm((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const handleTypeChange = (nextType: 'expense' | 'income') => {
    setForm((prev) => {
      if (!prev) return prev;
      const nextFallback = nextType === 'income' ? INCOME_FALLBACK_ID : EXPENSE_FALLBACK_ID;
      const currentId = prev.categoryId;
      const isValidForNextType = categories.some(
        (cat) => cat.id === currentId && resolveKind(cat.kind) === nextType,
      );
      return {
        ...prev,
        type: nextType,
        categoryId: isValidForNextType ? currentId : nextFallback,
      };
    });
  };

  const handleSave = async () => {
    if (!form || !transaction) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(transaction.id, {
        ...form,
        amount: Number(form.amount),
      });
      onClose();
    } catch (err) {
      console.error(err);
      setError('No se pudo actualizar. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!transaction) return;
    const confirmed = await confirm({
      title: 'Borrar este movimiento?',
      description: 'Esta accion no se puede deshacer.',
      confirmText: 'Borrar',
      cancelText: 'Cancelar',
      variant: 'destructive',
    });
    if (!confirmed) return;
    setSaving(true);
    setError(null);
    try {
      await onDelete(transaction.id);
      onClose();
    } catch (err) {
      console.error(err);
      setError('No se pudo eliminar. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center px-0 md:items-center md:px-3">
      <div className="fixed inset-0 modal-scrim backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        className="modal-surface relative flex h-[92vh] w-full max-w-none flex-col overflow-hidden rounded-t-2xl md:h-auto md:max-h-[85vh] md:max-w-md md:rounded-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Editar movimiento"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="shrink-0 border-b border-[var(--modal-border)] px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-[var(--text)]">Editar movimiento</h3>
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
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--text-muted)]">Monto</label>
              <div className="flex items-center rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-[var(--text)] focus-within:border-primary">
                <span className="text-base text-[var(--text-muted)]">$</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={form.amount}
                  onChange={(e) => handleChange('amount', e.target.value)}
                  className="ml-2 w-full bg-transparent text-base text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--text-muted)]">Categoria</label>
              <ResponsiveSelect
                value={form.categoryId}
                onChange={(val) => handleChange('categoryId', val)}
                options={categoryOptions}
                title="Categoria"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--text-muted)]">Nota</label>
              <input
                type="text"
                value={form.note}
                onChange={(e) => handleChange('note', e.target.value)}
                className="w-full rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-primary focus:outline-none"
                placeholder="Descripcion opcional"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--text-muted)]">Tipo</label>
                <ResponsiveSelect
                  value={form.type}
                  onChange={(val) => handleTypeChange(val as 'expense' | 'income')}
                  options={[
                    { value: 'expense', label: 'Gasto' },
                    { value: 'income', label: 'Ingreso' },
                  ]}
                  title="Tipo"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--text-muted)]">Metodo de pago</label>
                <ResponsiveSelect
                  value={form.paymentMethod}
                  onChange={(val) => handleChange('paymentMethod', val)}
                  options={paymentMethods.map((method) => ({ value: method, label: method }))}
                  title="Metodo de pago"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--text-muted)]">Fecha</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => handleChange('date', e.target.value)}
                className="w-full rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text)] focus:border-primary focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-[var(--modal-border)] px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
          {error && <p className="mb-2 text-sm text-[var(--error-text)]">{error}</p>}
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn btn-primary w-full"
          >
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
          <div className="mt-2 flex items-center justify-between">
            <button
              onClick={onClose}
              disabled={saving}
              className="btn btn-secondary"
            >
              Cancelar
            </button>
            <button
              onClick={handleDelete}
              disabled={saving}
              className="btn btn-danger"
            >
              Eliminar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

