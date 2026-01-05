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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-3"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-2xl border border-[var(--modal-border)] bg-[var(--modal-surface)] p-4 text-[var(--text)] shadow-2xl backdrop-blur"
        role="dialog"
        aria-modal="true"
        aria-label="Upgrade IA"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <p className="text-[11px] uppercase text-[var(--text-muted)]">Upgrade</p>
            <h3 className="text-lg font-semibold text-[var(--text)]">{contextTitle[context]}</h3>
            <p className="text-sm text-[var(--text-muted)]">
              Sube de plan para tener más cuota semanal y funciones avanzadas de IA.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full border border-[var(--card-border)] bg-[var(--input-bg)] px-3 py-1 text-xs font-semibold text-[var(--text)] hover:border-[var(--primary)]"
          >
            Cerrar
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {visiblePlans.map((plan) => {
            const listPrice = plan.basePriceCents;
            const promoPrice = plan.promoActive && plan.promoPriceCents ? plan.promoPriceCents : null;
            return (
              <div
                key={plan.id}
                className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-3 shadow-sm"
              >
                <div className="mb-1 flex items-center justify-between">
                  <h4 className="text-base font-semibold text-[var(--text)]">{plan.label}</h4>
                  <span className="rounded-full bg-[var(--input-bg)] px-2 py-1 text-[11px] text-[var(--text-muted)]">
                    {plan.id === 'plan_byok' ? 'BYOK' : 'PRO'}
                  </span>
                </div>
                {promoPrice ? (
                  <div className="text-sm text-[var(--accent)] dark:text-[var(--accent)]">
                    <span className="line-through text-[var(--text-muted)]">{formatCurrency(listPrice)}</span>{' '}
                    <span className="font-semibold text-[var(--text)]">{formatCurrency(promoPrice)}</span> / mes por 3
                    meses
                  </div>
                ) : (
                  <div className="text-sm text-[var(--text)]">{formatCurrency(listPrice)} / mes</div>
                )}
                <p className="text-xs text-[var(--text-muted)]">
                  Promo de lanzamiento: disponible solo el primer mes. Luego de 3 meses, se renueva a precio lista.
                </p>
                <button
                  onClick={() => {
                    onClose();
                    onGoToPlans();
                  }}
                  className="mt-3 w-full rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-[var(--text)] hover:opacity-90"
                >
                  Ver planes y pagar
                </button>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[11px] text-[var(--text-muted)]">
          Mientras mantengas activa tu suscripción, conservas el precio promocional durante 3 meses.
        </p>
      </div>
    </div>
  );
}
