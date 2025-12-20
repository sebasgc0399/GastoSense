import { useEffect, useState } from 'react';
import { frequentCategories, paymentMethods } from '../data/frequentCategories';
import { ResponsiveSelect } from './ResponsiveSelect';
import type { Transaction, TransactionInput } from '../types';

interface Props {
  open: boolean;
  transaction: Transaction | null;
  onClose: () => void;
  onSave: (id: string, payload: TransactionInput) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function TransactionEditModal({ open, transaction, onClose, onSave, onDelete }: Props) {
  const [form, setForm] = useState<TransactionInput | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute inset-x-0 top-[10%] mx-auto w-full max-w-md rounded-2xl border border-[var(--modal-border)] bg-[var(--modal-surface)] p-5 text-[var(--text)] shadow-2xl backdrop-blur">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-[var(--text)]">Editar movimiento</h3>
          <button
            className="text-sm font-semibold text-[var(--text-muted)] hover:text-[var(--text)]"
            onClick={onClose}
          >
            Cerrar
          </button>
        </div>

        <div className="mt-3 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--text-muted)]">Monto</label>
            <input
              type="number"
              value={form.amount}
              onChange={(e) => handleChange('amount', e.target.value)}
              className="w-full rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--text-muted)]">Categoría</label>
            <ResponsiveSelect
              value={form.categoryId}
              onChange={(val) => handleChange('categoryId', val)}
              options={frequentCategories.map((cat) => ({ value: cat.id, label: cat.label }))}
              title="Categoría"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--text-muted)]">Nota</label>
            <input
              type="text"
              value={form.note}
              onChange={(e) => handleChange('note', e.target.value)}
              className="w-full rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-primary focus:outline-none"
              placeholder="Descripción opcional"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--text-muted)]">Tipo</label>
              <ResponsiveSelect
                value={form.type}
                onChange={(val) => handleChange('type', val)}
                options={[
                  { value: 'expense', label: 'Gasto' },
                  { value: 'income', label: 'Ingreso' },
                ]}
                title="Tipo"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--text-muted)]">Método de pago</label>
              <ResponsiveSelect
                value={form.paymentMethod}
                onChange={(val) => handleChange('paymentMethod', val)}
                options={paymentMethods.map((method) => ({ value: method, label: method }))}
                title="Método de pago"
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

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white shadow hover:bg-emerald-700 disabled:opacity-60"
            >
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </button>
            <button
              onClick={handleDelete}
              disabled={saving}
              className="rounded-xl border border-[var(--danger-border)] bg-[var(--danger-bg)] px-4 py-3 text-sm font-semibold text-[var(--danger-text)] hover:opacity-90 disabled:opacity-60"
            >
              Eliminar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
