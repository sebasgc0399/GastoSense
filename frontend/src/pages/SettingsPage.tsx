import type React from 'react';
import { IaQuotaProgress } from '../components/IaQuotaProgress';
import { ResponsiveSelect } from '../components/ResponsiveSelect';
import styles from './SettingsPage.module.css';
import type { KeyPreference, PlanInfo, PlanPeriod, UserProfile, UserRole } from '../types';

type PlanId = 'plan_byok' | 'plan_pro';
type AdminSubscriptionSource = 'manual' | 'stripe' | 'promo' | 'wompi';
type ThemeMode = 'light' | 'dark';

type AdminUserRow = {
  uid: string;
  role: UserRole;
  openaiKeyStored: boolean;
  preferredKey?: KeyPreference;
  subscriptionStatus?: string;
  subscriptionSource?: AdminSubscriptionSource;
  subscriptionExpires?: string;
};

type IaQuotaLike = {
  parseUsed: number;
  parseLimit: number;
  analyzeUsed: number;
  analyzeLimit: number;
} | null;

export interface SettingsPageProps {
  userUid?: string | null;
  handleCopyUid: () => Promise<void>;
  theme: ThemeMode;
  toggleTheme: () => void;
  roleLabel: string;
  userProfile: UserProfile | null;
  settingsMessage: string | null;
  formatDate: (ts?: number | null) => string | null;
  iaQuota: IaQuotaLike;
  parseProgress: number;
  analyzeProgress: number;
  openUpgrade: (ctx: 'parse_exhausted' | 'analyze_exhausted' | 'feature_locked') => void;
  onShowLimitsHelp: () => void;
  showKeySettings: boolean;
  profileLoading: boolean;
  apiKeyInput: string;
  setApiKeyInput: React.Dispatch<React.SetStateAction<string>>;
  keySaving: boolean;
  handleSaveApiKey: () => Promise<void>;
  handleClearApiKey: () => Promise<void>;
  preferenceSaving: boolean;
  canUseManaged: boolean;
  handlePreferredKeyChange: (pref: KeyPreference) => Promise<void>;
  plansRef: React.RefObject<HTMLDivElement | null>;
  plans: PlanInfo[];
  planPeriods: Record<string, PlanPeriod>;
  setPlanPeriods: React.Dispatch<React.SetStateAction<Record<string, PlanPeriod>>>;
  hasActiveSubscription: boolean;
  currentPaidPlan: PlanId | null;
  checkoutLoading: string | null;
  handleCheckout: (planId: PlanId) => Promise<void>;
  formatCurrency: (cents?: number | null) => string;
  formatUsdApprox: (cents?: number | null) => string;
  adminSearch: string;
  setAdminSearch: React.Dispatch<React.SetStateAction<string>>;
  adminLoading: boolean;
  handleAdminReload: () => Promise<void>;
  adminUsers: AdminUserRow[];
  setAdminUsers: React.Dispatch<React.SetStateAction<AdminUserRow[]>>;
  handleAdminChangeRole: (uid: string, role: UserRole) => void;
  handleAdminSaveUser: (uid: string) => Promise<void>;
}

export function SettingsPage({
  userUid,
  handleCopyUid,
  theme,
  toggleTheme,
  roleLabel,
  userProfile,
  settingsMessage,
  formatDate,
  iaQuota,
  parseProgress,
  analyzeProgress,
  openUpgrade,
  onShowLimitsHelp,
  showKeySettings,
  profileLoading,
  apiKeyInput,
  setApiKeyInput,
  keySaving,
  handleSaveApiKey,
  handleClearApiKey,
  preferenceSaving,
  canUseManaged,
  handlePreferredKeyChange,
  plansRef,
  plans,
  planPeriods,
  setPlanPeriods,
  hasActiveSubscription,
  currentPaidPlan,
  checkoutLoading,
  handleCheckout,
  formatCurrency,
  formatUsdApprox,
  adminSearch,
  setAdminSearch,
  adminLoading,
  handleAdminReload,
  adminUsers,
  setAdminUsers,
  handleAdminChangeRole,
  handleAdminSaveUser,
}: SettingsPageProps) {
  return (
    <section className="space-y-4">
      <div className="card flex flex-col gap-3">
        <div className="space-y-1">
          <p className="text-xs uppercase text-slate-400">Cuenta</p>
          <h2 className="text-lg font-semibold text-white">ID de usuario</h2>
          <p className="text-xs text-slate-300">ID para soporte o auditoría.</p>
        </div>
        <div className="flex w-full items-center gap-2">
          <div className="max-w-full grow overflow-x-auto rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-mono text-white">
            {userUid}
          </div>
          <button
            onClick={handleCopyUid}
            aria-label="Copiar ID de usuario"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white hover:border-primary"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          </button>
        </div>
      </div>

      <div className="card space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs uppercase text-slate-400">Apariencia</p>
            <h2 className="text-lg font-semibold text-white">Tema</h2>
            <p className="text-xs text-slate-300">Alterna entre modo claro y oscuro.</p>
          </div>
          <button
            className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:border-white/20"
            onClick={toggleTheme}
          >
            {theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
          </button>
        </div>
      </div>

      <div className="card space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs uppercase text-slate-400">IA / Suscripción</p>
            <h2 className="text-lg font-semibold text-white">Gestiona tus claves</h2>
            <p className="text-xs text-slate-300">BYOK se guarda en backend (Secret Manager). El cliente nunca ve la clave.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white">Rol: {roleLabel}</span>
            <span
              className={`rounded-full border px-3 py-1 ${
                userProfile?.subscription?.status === 'active'
                  ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200'
                  : styles.badgeWarn
              }`}
            >
              {userProfile?.subscription?.status === 'active' ? 'Membresía activa' : 'Membresía inactiva'}
            </span>
            <span
              className={`rounded-full border px-3 py-1 ${
                userProfile?.openaiKeyStored
                  ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200'
                  : 'border-white/10 bg-white/5 text-slate-200'
              }`}
            >
              {userProfile?.openaiKeyStored ? 'Key BYOK guardada' : 'Sin key BYOK'}
            </span>
            {userProfile?.subscription?.expiresAt ? (
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white">
                Expira: {formatDate(userProfile.subscription.expiresAt) || '--'}
              </span>
            ) : null}
          </div>
        </div>

        {settingsMessage && (
          <div className="rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
            {settingsMessage}
          </div>
        )}

        {iaQuota && (
          <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-white">Uso semanal de IA</p>
                <p className="text-xs text-slate-300">Se renueva cada semana (lunes). Úsalo para registrar por voz y pedir consejos.</p>
              </div>
              <button type="button" onClick={onShowLimitsHelp} className="text-[11px] font-semibold text-primary underline">
                ¿Cómo se calculan los límites?
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <IaQuotaProgress
                label="Modo frase / voz"
                used={iaQuota.parseUsed}
                limit={iaQuota.parseLimit}
                ratio={parseProgress}
                onUpgradeClick={() => openUpgrade('parse_exhausted')}
              />
              <IaQuotaProgress
                label="Asesor IA"
                used={iaQuota.analyzeUsed}
                limit={iaQuota.analyzeLimit}
                ratio={analyzeProgress}
                onUpgradeClick={() => openUpgrade('analyze_exhausted')}
              />
            </div>
          </div>
        )}

        {showKeySettings && (
          <>
            <div className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">Tu API key de OpenAI (BYOK)</p>
                  <p className="text-xs text-slate-300">Se guarda en el backend; usa formato sk-.</p>
                </div>
                {profileLoading && <span className="text-[11px] text-slate-300">Cargando perfil...</span>}
              </div>
              <input
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="sk-..."
                className="w-full rounded-xl border border-white/10 bg-[var(--input-bg)] px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-primary"
                type="password"
                disabled={keySaving}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleSaveApiKey}
                  disabled={keySaving || !apiKeyInput.trim()}
                  className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                >
                  {keySaving ? 'Guardando...' : 'Guardar key'}
                </button>
                {userProfile?.openaiKeyStored && (
                  <button
                    onClick={handleClearApiKey}
                    disabled={keySaving}
                    className="rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-xs font-semibold text-white hover:border-primary disabled:opacity-50"
                  >
                    {keySaving ? 'Procesando...' : 'Eliminar key'}
                  </button>
                )}
              </div>
              <p className="text-[11px] text-slate-300">
                {userProfile?.openaiKeyStored
                  ? 'Key guardada en backend. Nunca se expone al cliente.'
                  : 'Pega tu clave privada de OpenAI. Se almacenará solo en el servidor.'}
              </p>
            </div>

            <div className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-white">Preferencia de clave</p>
                {userProfile?.preferredKey && (
                  <span className="text-[11px] text-slate-300">
                    Actual: {userProfile.preferredKey === 'byok' ? 'Mi key' : 'Key GastoSense'}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handlePreferredKeyChange('byok')}
                  disabled={!userProfile?.openaiKeyStored || preferenceSaving}
                  className={`rounded-lg px-4 py-2 text-xs font-semibold ${
                    userProfile?.preferredKey === 'byok'
                      ? 'bg-primary text-white'
                      : 'border border-white/10 bg-white/5 text-white'
                  } disabled:opacity-50`}
                >
                  Usar mi key (BYOK)
                </button>
                <button
                  onClick={() => handlePreferredKeyChange('managed')}
                  disabled={!canUseManaged || preferenceSaving}
                  className={`rounded-lg px-4 py-2 text-xs font-semibold ${
                    userProfile?.preferredKey === 'managed'
                      ? 'bg-primary text-white'
                      : 'border border-white/10 bg-white/5 text-white'
                  } disabled:opacity-50`}
                >
                  Usar key de GastoSense
                </button>
              </div>
              <p className="text-[11px] text-slate-300">
                Si usas tu key (BYOK) tienes más cuota; con key GastoSense aplican límites de plan Free.
              </p>
            </div>
          </>
        )}

        <div ref={plansRef} id="plans" className="space-y-3 rounded-xl border border-indigo-400/30 bg-indigo-500/5 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase text-indigo-200">Planes</p>
              <h3 className="text-lg font-semibold text-white">Elige tu plan</h3>
              <p className="text-xs text-slate-300">Precios muestran promo y descuentos por periodo.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {plans.map((plan) => {
              const selectedPeriod = planPeriods[plan.id] ?? 'monthly';
              const periodInfo = plan.periods.find((p) => p.period === selectedPeriod);
              const price = periodInfo?.totalCents ?? 0;
              const months = periodInfo?.months ?? 1;
              const switchingPlan = hasActiveSubscription && currentPaidPlan && currentPaidPlan !== (plan.id as PlanId);
              const sameActivePlan = hasActiveSubscription && currentPaidPlan === (plan.id as PlanId);
              return (
                <div key={plan.id} className="rounded-xl border border-white/10 bg-white/5 p-4 shadow-sm flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-base font-semibold text-white">{plan.label}</h4>
                    <span className="rounded-full bg-white/10 px-2 py-1 text-[11px] text-white">
                      {plan.id === 'plan_byok' ? 'BYOK' : 'PRO'}
                    </span>
                  </div>
                  {plan.promoActive && plan.promoPriceCents ? (
                    <div className="text-sm text-emerald-200">
                      Promo: {formatCurrency(plan.promoPriceCents)} {formatUsdApprox(plan.promoPriceCents)} / mes · hasta{' '}
                      {plan.promoEndsAt ? new Date(plan.promoEndsAt).toISOString().slice(0, 10) : ''}
                    </div>
                  ) : (
                    <div className="text-sm text-slate-200">
                      Precio: {formatCurrency(plan.basePriceCents)} {formatUsdApprox(plan.basePriceCents)} / mes
                    </div>
                  )}
                  <div className="text-xs text-slate-300">
                    Periodo: {months} {months === 1 ? 'mes' : 'meses'} ({Math.round((periodInfo?.discount ?? 0) * 100)}% desc.)
                  </div>
                  <div className="text-lg font-semibold text-white">
                    Total {formatCurrency(price)} {formatUsdApprox(price)} {plan.currency}
                  </div>
                  {switchingPlan && (
                    <p className="text-[11px] text-amber-200">
                      Al comprar este plan, tu plan actual se reemplaza desde hoy ({currentPaidPlan === 'plan_byok' ? 'BYOK' : 'PRO'} → {plan.id === 'plan_byok' ? 'BYOK' : 'PRO'}).
                    </p>
                  )}
                  {sameActivePlan && (
                    <p className="text-[11px] text-slate-200">
                      Al renovar extiendes tu vencimiento {months > 1 ? `(+${months} meses)` : '(+1 mes)'} desde la fecha actual.
                    </p>
                  )}
                  <ResponsiveSelect
                    value={selectedPeriod}
                    onChange={(val) =>
                      setPlanPeriods((prev) => ({
                        ...prev,
                        [plan.id]: val,
                      }))
                    }
                    options={[
                      { value: 'monthly', label: 'Mensual' },
                      { value: 'quarterly', label: 'Trimestral (-5%)' },
                      { value: 'semiannual', label: 'Semestral (-10%)' },
                      { value: 'annual', label: 'Anual (-15%)' },
                    ]}
                    title="Elige periodo"
                  />
                  <div className="text-xs text-slate-300">
                    Incluye: {plan.id === 'plan_byok' ? 'IA con tu propia API key' : 'IA con clave gestionada'}.
                  </div>
                  <button
                    onClick={() => handleCheckout(plan.id as 'plan_byok' | 'plan_pro')}
                    disabled={checkoutLoading === plan.id}
                    className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {checkoutLoading === plan.id ? 'Generando...' : 'Pagar con Wompi'}
                  </button>
                </div>
              );
            })}
            {plans.length === 0 && (
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                No pudimos cargar los planes. Intenta más tarde.
              </div>
            )}
          </div>
        </div>

        {userProfile?.role === 'admin' && (
          <div className="space-y-3 rounded-xl border border-primary/40 bg-primary/5 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase text-primary/80">Admin</p>
                <h3 className="text-lg font-semibold text-white">Usuarios y roles</h3>
                <p className="text-xs text-slate-300">Cambia rol o preferencia. Máx 200 usuarios.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={adminSearch}
                  onChange={(e) => setAdminSearch(e.target.value)}
                  placeholder="Buscar UID..."
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-white outline-none placeholder:text-slate-400"
                />
                <button
                  onClick={handleAdminReload}
                  disabled={adminLoading}
                  className="rounded-lg border border-primary/50 bg-primary/20 px-3 py-1 text-xs font-semibold text-primary hover:bg-primary/30 disabled:opacity-50"
                >
                  {adminLoading ? 'Cargando...' : 'Recargar'}
                </button>
              </div>
            </div>
            <div className="overflow-auto rounded-lg border border-white/10">
              <table className="min-w-full text-left text-xs text-white">
                <thead className="bg-white/5 text-[11px] uppercase tracking-wide text-slate-300">
                  <tr>
                    <th className="px-3 py-2">UID</th>
                    <th className="px-3 py-2">Rol</th>
                    <th className="px-3 py-2">Suscripciĸn</th>
                    <th className="px-3 py-2">BYOK</th>
                    <th className="px-3 py-2">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {adminUsers
                    .filter((u) => u.uid.toLowerCase().includes(adminSearch.toLowerCase()))
                    .map((u) => (
                      <tr key={u.uid} className="border-t border-white/5">
                        <td className="px-3 py-2 font-mono text-[11px] text-slate-200">{u.uid}</td>
                        <td className="px-3 py-2">
                          <ResponsiveSelect
                            value={u.role}
                            onChange={(val) => handleAdminChangeRole(u.uid, val as UserRole)}
                            options={[
                              { value: 'free', label: 'free' },
                              { value: 'paid_byok', label: 'paid_byok' },
                              { value: 'paid_managed', label: 'paid_managed' },
                              { value: 'gifted_managed', label: 'gifted_managed' },
                              { value: 'admin', label: 'admin' },
                            ]}
                            title="Rol"
                            className="text-[11px]"
                            buttonClassName="text-[11px]"
                          />
                        </td>
                        <td className="px-3 py-2 text-[11px] text-slate-200 space-y-1">
                          <ResponsiveSelect
                            value={u.subscriptionStatus || 'expired'}
                            onChange={(val) =>
                              setAdminUsers((prev) =>
                                prev.map((item) => (item.uid === u.uid ? { ...item, subscriptionStatus: val } : item)),
                              )
                            }
                            options={[
                              { value: 'active', label: 'Activa' },
                              { value: 'expired', label: 'Inactiva' },
                            ]}
                            title="Estado suscripción"
                            className="text-[11px]"
                            buttonClassName="text-[11px]"
                          />
                          <ResponsiveSelect
                            value={(u.subscriptionSource as AdminSubscriptionSource) || 'manual'}
                            onChange={(val) =>
                              setAdminUsers((prev) =>
                                prev.map((item) =>
                                  item.uid === u.uid
                                    ? { ...item, subscriptionSource: val as AdminSubscriptionSource }
                                    : item,
                                ),
                              )
                            }
                            options={[
                              { value: 'manual', label: 'Manual' },
                              { value: 'stripe', label: 'Stripe' },
                              { value: 'promo', label: 'Promo' },
                              { value: 'wompi', label: 'Wompi' },
                            ]}
                            title="Fuente"
                            className="text-[11px]"
                            buttonClassName="text-[11px]"
                          />
                          <input
                            type="date"
                            value={u.subscriptionExpires || ''}
                            onChange={(e) =>
                              setAdminUsers((prev) =>
                                prev.map((item) =>
                                  item.uid === u.uid ? { ...item, subscriptionExpires: e.target.value } : item,
                                ),
                              )
                            }
                            className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white"
                            disabled={adminLoading}
                          />
                        </td>
                        <td className="px-3 py-2 text-[11px]">
                          <span
                            className={`rounded-full px-2 py-1 ${
                              u.openaiKeyStored
                                ? 'bg-emerald-500/10 text-emerald-200'
                                : 'bg-white/5 text-slate-300'
                            }`}
                          >
                            {u.openaiKeyStored ? 'Sí' : 'No'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-[11px] text-slate-200 space-y-1">
                          <div>Pref: {u.preferredKey ?? 'n/a'}</div>
                          <button
                            onClick={() => handleAdminSaveUser(u.uid)}
                            disabled={adminLoading}
                            className="w-full rounded-lg border border-primary/40 bg-primary/20 px-2 py-1 text-[11px] font-semibold text-primary hover:bg-primary/30 disabled:opacity-50"
                          >
                            Guardar
                          </button>
                        </td>
                      </tr>
                    ))}
                  {adminUsers.filter((u) => u.uid.toLowerCase().includes(adminSearch.toLowerCase())).length === 0 && (
                    <tr>
                      <td className="px-3 py-2 text-slate-300" colSpan={5}>
                        {adminLoading ? 'Cargando...' : 'Sin usuarios que coincidan.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
