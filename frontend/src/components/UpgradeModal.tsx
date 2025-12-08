import type { PlanInfo, UserRole } from '../types';
import { formatCurrency } from '../utils/format';

type UpgradeContext = 'parse_exhausted' | 'analyze_exhausted' | 'feature_locked';

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  context: UpgradeContext;
  role: UserRole;
  plans: PlanInfo[];
  onGoToPlans: () => void;
}

const contextTitle: Record<UpgradeContext, string> = {
  parse_exhausted: 'Te quedaste sin IA para frases',
  analyze_exhausted: 'Te quedaste sin IA para análisis',
  feature_locked: 'Función disponible en planes pagos',
};

export function UpgradeModal({ open, onClose, context, role, plans, onGoToPlans }: UpgradeModalProps) {
  if (!open) return null;
  const recommended = role === 'free' ? ['plan_byok', 'plan_pro'] : role === 'paid_byok' ? ['plan_pro'] : ['plan_pro'];
  const visiblePlans = plans.filter((p) => recommended.includes(p.id));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-3"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-2xl border border-white/10 bg-slate-950 p-4 text-slate-50 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Upgrade IA"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <p className="text-xs uppercase text-slate-400">Upgrade</p>
            <h3 className="text-lg font-semibold text-white">{contextTitle[context]}</h3>
            <p className="text-sm text-slate-300">
              Sube de plan para tener más cuota semanal y funciones avanzadas de IA.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full border border-white/20 bg-white/10 px-2 py-1 text-xs text-white hover:border-primary"
          >
            Cerrar
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {visiblePlans.map((plan) => {
            const listPrice = plan.basePriceCents;
            const promoPrice = plan.promoActive && plan.promoPriceCents ? plan.promoPriceCents : null;
            return (
              <div key={plan.id} className="rounded-xl border border-white/15 bg-white/5 p-3">
                <div className="mb-1 flex items-center justify-between">
                  <h4 className="text-base font-semibold text-white">{plan.label}</h4>
                  <span className="rounded-full bg-white/10 px-2 py-1 text-[11px] text-white">
                    {plan.id === 'plan_byok' ? 'BYOK' : 'PRO'}
                  </span>
                </div>
                {promoPrice ? (
                  <div className="text-sm text-emerald-200">
                    <span className="line-through text-slate-300">{formatCurrency(listPrice)}</span>{' '}
                    <span className="font-semibold">{formatCurrency(promoPrice)}</span> / mes por 3 meses
                  </div>
                ) : (
                  <div className="text-sm text-slate-200">{formatCurrency(listPrice)} / mes</div>
                )}
                <p className="text-xs text-slate-300">
                  Promo de lanzamiento: disponible solo el primer mes. Luego de 3 meses, se renueva a precio lista.
                </p>
                <button
                  onClick={() => {
                    onClose();
                    onGoToPlans();
                  }}
                  className="mt-3 w-full rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
                >
                  Ver planes y pagar
                </button>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[11px] text-slate-300">
          Mientras mantengas activa tu suscripción, conservas el precio promocional durante 3 meses.
        </p>
      </div>
    </div>
  );
}
