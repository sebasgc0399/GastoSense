interface LimitsHelpModalProps {
  open: boolean;
  onClose: () => void;
}

export function LimitsHelpModal({ open, onClose }: LimitsHelpModalProps) {
  if (!open) return null;
  const rows = [
    { role: 'Free', parse: '10', analyze: '4' },
    { role: 'BYOK', parse: '70', analyze: '20' },
    { role: 'PRO', parse: '90', analyze: '20' },
    { role: 'Gifted', parse: '90', analyze: '20' },
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-3" onClick={onClose}>
      <div
        className="w-full max-w-xl rounded-2xl border border-white/10 bg-slate-950 p-4 text-slate-50 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Limites IA"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase text-slate-300">Ayuda</p>
            <h3 className="text-lg font-semibold text-white">¿Cómo se calculan mis límites?</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-full border border-white/20 bg-white/10 px-2 py-1 text-xs text-white hover:border-primary"
          >
            Cerrar
          </button>
        </div>
        <p className="text-sm text-slate-200">Los límites son semanales y se renuevan cada lunes.</p>
        <div className="mt-3 overflow-hidden rounded-xl border border-white/10">
          <table className="min-w-full text-sm text-white">
            <thead className="bg-white/5 text-[12px] uppercase tracking-wide text-slate-300">
              <tr>
                <th className="px-3 py-2 text-left">Rol</th>
                <th className="px-3 py-2 text-left">Frases/semana</th>
                <th className="px-3 py-2 text-left">Análisis/semana</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.role} className="border-t border-white/5">
                  <td className="px-3 py-2">{r.role}</td>
                  <td className="px-3 py-2">{r.parse}</td>
                  <td className="px-3 py-2">{r.analyze}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[12px] text-slate-200">
          Si te quedas corto seguido, puedes subir de plan; si no usas la IA, no necesitas cambiar nada.
        </p>
      </div>
    </div>
  );
}
