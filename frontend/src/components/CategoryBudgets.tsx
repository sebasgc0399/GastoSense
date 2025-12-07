import { useEffect, useState } from 'react';
import { frequentCategories } from '../data/frequentCategories';

interface Props {
  perCategory?: Record<string, number>;
  onSave: (perCategory: Record<string, number>) => Promise<void>;
}

export function CategoryBudgets({ perCategory, onSave }: Props) {
  const [values, setValues] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Sincroniza el formulario local cuando cambia el presupuesto entrante.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setValues((prev) => {
      const next = perCategory ?? {};
      // evita set si es el mismo objeto por referencia o shallow igual
      if (prev === next) return prev;
      return next;
    });
  }, [perCategory]);

  const handleSave = async () => {
    setSaving(true);
    await onSave(values);
    setSaving(false);
  };

  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase text-[var(--muted)]">Presupuesto por categoría</p>
          <h3 className="text-lg font-semibold text-white">Control detallado</h3>
        </div>
        <span className="text-xs text-[var(--muted)]">Mensual</span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {frequentCategories.map((cat) => (
          <div key={cat.id}>
            <label className="mb-1 block text-xs font-semibold text-[var(--muted)]">{cat.label}</label>
            <input
              type="number"
              value={values[cat.id] ?? ''}
              placeholder="Ej. 200000"
              onChange={(e) => setValues((prev) => ({ ...prev, [cat.id]: Number(e.target.value) || 0 }))}
              className="input"
            />
          </div>
        ))}
      </div>
      <div className="mt-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600 disabled:opacity-60"
        >
          {saving ? 'Guardando...' : 'Guardar presupuestos por categoría'}
        </button>
      </div>
    </div>
  );
}
