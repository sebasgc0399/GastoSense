interface LimitsHelpModalProps {
  open: boolean;
  onClose: () => void;
}

export function LimitsHelpModal({ open, onClose }: LimitsHelpModalProps) {
  if (!open) return null;

  const rows = [
    { role: 'Free', parse: '5', analyze: '2' },
    { role: 'BYOK', parse: '70', analyze: '20' },
    { role: 'PRO', parse: '90', analyze: '20' },
    { role: 'Gifted', parse: '90', analyze: '20' },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-3"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-2xl border border-[var(--modal-border)] bg-[var(--modal-surface)] p-4 text-[var(--text)] shadow-2xl backdrop-blur"
        role="dialog"
        aria-modal="true"
        aria-label="Limites IA"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase text-[var(--text-muted)]">Ayuda</p>
            <h3 className="text-lg font-semibold text-[var(--text)]">¿Cómo se calculan mis límites?</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-full border border-[var(--card-border)] bg-[var(--input-bg)] px-3 py-1 text-xs font-semibold text-[var(--text)] hover:border-[var(--primary)]"
          >
            Cerrar
          </button>
        </div>

        <p className="text-sm text-[var(--text-muted)]">Los límites son semanales y se renuevan cada lunes.</p>

        <div className="mt-3 overflow-hidden rounded-xl border border-[var(--modal-border)]">
          <table className="min-w-full text-sm text-[var(--text)]">
            <thead className="bg-[var(--modal-header)] text-[12px] uppercase tracking-wide text-[var(--text)]">
              <tr>
                <th className="px-3 py-2 text-left">Rol</th>
                <th className="px-3 py-2 text-left">Frases/semana</th>
                <th className="px-3 py-2 text-left">Análisis/semana</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr
                  key={r.role}
                  className={`border-t border-[var(--card-border)] ${idx % 2 === 1 ? 'bg-[var(--input-bg)]' : ''}`}
                >
                  <td className="px-3 py-2 font-semibold">{r.role}</td>
                  <td className="px-3 py-2">{r.parse}</td>
                  <td className="px-3 py-2">{r.analyze}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-[12px] text-[var(--text-muted)]">
          Si te quedas corto seguido, puedes subir de plan; si no usas la IA, no necesitas cambiar nada.
        </p>
      </div>
    </div>
  );
}
