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
        category: transaction.category,
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
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute inset-x-0 top-[10%] mx-auto w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Editar movimiento</h3>
          <button className="text-sm text-slate-300 hover:text-white" onClick={onClose}>
            Cerrar
          </button>
        </div>

        <div className="mt-3 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-300">Monto</label>
            <input
              type="number"
              value={form.amount}
              onChange={(e) => handleChange('amount', e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-300">Categoría</label>
            <ResponsiveSelect
              value={form.category}
              onChange={(val) => handleChange('category', val)}
              options={frequentCategories.map((cat) => ({ value: cat.id, label: cat.label }))}
              title="Categoría"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-300">Nota</label>
            <input
              type="text"
              value={form.note}
              onChange={(e) => handleChange('note', e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-primary focus:outline-none"
              placeholder="Descripción opcional"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-300">Tipo</label>
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
              <label className="mb-1 block text-xs font-semibold text-slate-300">Método de pago</label>
              <ResponsiveSelect
                value={form.paymentMethod}
                onChange={(val) => handleChange('paymentMethod', val)}
                options={paymentMethods.map((method) => ({ value: method, label: method }))}
                title="Método de pago"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-300">Fecha</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => handleChange('date', e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-primary focus:outline-none"
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
              className="rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-100 hover:bg-red-500/20 disabled:opacity-60"
            >
              Eliminar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
