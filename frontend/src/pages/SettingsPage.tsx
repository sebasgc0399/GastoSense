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
          <p className="text-xs uppercase text-[var(--text-muted)]">Cuenta</p>
          <h2 className="text-lg font-semibold text-[var(--text)]">ID de usuario</h2>
          <p className="text-xs text-[var(--text-muted)]">ID para soporte o auditoría.</p>
        </div>
        <div className="flex w-full items-center gap-2">
          <div className="max-w-full grow overflow-x-auto rounded-lg surface-soft px-3 py-2 text-[11px] font-mono text-[var(--text)]">
            {userUid}
          </div>
          <button
            onClick={handleCopyUid}
            aria-label="Copiar ID de usuario"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg surface-soft text-[var(--text)] hover:border-primary"
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
            <p className="text-xs uppercase text-[var(--text-muted)]">Apariencia</p>
            <h2 className="text-lg font-semibold text-[var(--text)]">Tema</h2>
            <p className="text-xs text-[var(--text-muted)]">Alterna entre modo claro y oscuro.</p>
          </div>
          <button
            className="pill-strong px-3 py-1 text-xs font-semibold text-[var(--text)] shadow-sm hover:border-[var(--border-20)]"
            onClick={toggleTheme}
          >
            {theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
          </button>
        </div>
      </div>

      <div className="card space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs uppercase text-[var(--text-muted)]">IA / Suscripción</p>
            <h2 className="text-lg font-semibold text-[var(--text)]">Gestiona tus claves</h2>
            <p className="text-xs text-[var(--text-muted)]">BYOK se guarda en backend (Secret Manager). El cliente nunca ve la clave.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="pill-surface px-3 py-1 text-[var(--text)]">Rol: {roleLabel}</span>
            <span
              className={`rounded-full border px-3 py-1 ${
                userProfile?.subscription?.status === 'active' ? 'state-success' : styles.badgeWarn
              }`}
            >
              {userProfile?.subscription?.status === 'active' ? 'Membresía activa' : 'Membresía inactiva'}
            </span>
            <span
              className={`rounded-full border px-3 py-1 ${
                userProfile?.openaiKeyStored ? 'state-success' : 'surface-soft text-[var(--text)]'
              }`}
            >
              {userProfile?.openaiKeyStored ? 'Key BYOK guardada' : 'Sin key BYOK'}
            </span>
            {userProfile?.subscription?.expiresAt ? (
              <span className="pill-surface px-3 py-1 text-[var(--text)]">
                Expira: {formatDate(userProfile.subscription.expiresAt) || '--'}
              </span>
            ) : null}
          </div>
        </div>

        {settingsMessage && (
          <div className="rounded-lg border state-success px-3 py-2 text-xs">
            {settingsMessage}
          </div>
        )}

        {iaQuota && (
          <div className="space-y-3 rounded-xl surface-soft p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-[var(--text)]">Uso semanal de IA</p>
                <p className="text-xs text-[var(--text-muted)]">Se renueva cada semana (lunes). Úsalo para registrar por voz y pedir consejos.</p>
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
            <div className="space-y-2 rounded-xl surface-soft p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-[var(--text)]">Tu API key de OpenAI (BYOK)</p>
                  <p className="text-xs text-[var(--text-muted)]">Se guarda en el backend; usa formato sk-.</p>
                </div>
                {profileLoading && <span className="text-[11px] text-[var(--text-muted)]">Cargando perfil...</span>}
              </div>
              <input
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="sk-..."
                className="w-full rounded-xl border border-[var(--border-10)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text)]0 focus:border-primary"
                type="password"
                disabled={keySaving}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleSaveApiKey}
                  disabled={keySaving || !apiKeyInput.trim()}
                  className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-[var(--text)] hover:opacity-90 disabled:opacity-50"
                >
                  {keySaving ? 'Guardando...' : 'Guardar key'}
                </button>
                {userProfile?.openaiKeyStored && (
                  <button
                    onClick={handleClearApiKey}
                    disabled={keySaving}
                    className="rounded-lg border border-[var(--border-20)] bg-[var(--overlay-5)] px-4 py-2 text-xs font-semibold text-[var(--text)] hover:border-primary disabled:opacity-50"
                  >
                    {keySaving ? 'Procesando...' : 'Eliminar key'}
                  </button>
                )}
              </div>
              <p className="text-[11px] text-[var(--text-muted)]">
                {userProfile?.openaiKeyStored
                  ? 'Key guardada en backend. Nunca se expone al cliente.'
                  : 'Pega tu clave privada de OpenAI. Se almacenará solo en el servidor.'}
              </p>
            </div>

            <div className="space-y-2 rounded-xl surface-soft p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-[var(--text)]">Preferencia de clave</p>
                {userProfile?.preferredKey && (
                  <span className="text-[11px] text-[var(--text-muted)]">
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
                      ? 'bg-primary text-[var(--text)]'
                      : 'surface-soft text-[var(--text)]'
                  } disabled:opacity-50`}
                >
                  Usar mi key (BYOK)
                </button>
                <button
                  onClick={() => handlePreferredKeyChange('managed')}
                  disabled={!canUseManaged || preferenceSaving}
                  className={`rounded-lg px-4 py-2 text-xs font-semibold ${
                    userProfile?.preferredKey === 'managed'
                      ? 'bg-primary text-[var(--text)]'
                      : 'surface-soft text-[var(--text)]'
                  } disabled:opacity-50`}
                >
                  Usar key de GastoSense
                </button>
              </div>
              <p className="text-[11px] text-[var(--text-muted)]">
                Si usas tu key (BYOK) tienes más cuota; con key GastoSense aplican límites de plan Free.
              </p>
            </div>
          </>
        )}

        <div
          ref={plansRef}
          id="plans"
          className="space-y-3 rounded-xl border border-[var(--accent-strong)] bg-[var(--accent-weak)] p-4"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase text-[var(--accent-strong)]">Planes</p>
              <h3 className="text-lg font-semibold text-[var(--text)]">Elige tu plan</h3>
              <p className="text-xs text-[var(--text-muted)]">Precios muestran promo y descuentos por periodo.</p>
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
                <div key={plan.id} className="rounded-xl surface-soft p-4 shadow-sm flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-base font-semibold text-[var(--text)]">{plan.label}</h4>
                    <span className="rounded-full px-2 py-1 text-[11px] badge-paint">
                      {plan.id === 'plan_byok' ? 'BYOK' : 'PRO'}
                    </span>
                  </div>
                  {plan.promoActive && plan.promoPriceCents ? (
                    <div className="text-sm text-[var(--accent)]">
                      Promo: {formatCurrency(plan.promoPriceCents)} {formatUsdApprox(plan.promoPriceCents)} / mes · hasta{' '}
                      {plan.promoEndsAt ? new Date(plan.promoEndsAt).toISOString().slice(0, 10) : ''}
                    </div>
                  ) : (
                    <div className="text-sm text-[var(--text)]">
                      Precio: {formatCurrency(plan.basePriceCents)} {formatUsdApprox(plan.basePriceCents)} / mes
                    </div>
                  )}
                  <div className="text-xs text-[var(--text-muted)]">
                    Periodo: {months} {months === 1 ? 'mes' : 'meses'} ({Math.round((periodInfo?.discount ?? 0) * 100)}% desc.)
                  </div>
                  <div className="text-lg font-semibold text-[var(--text)]">
                    Total {formatCurrency(price)} {formatUsdApprox(price)} {plan.currency}
                  </div>
                  {switchingPlan && (
                    <p className="text-[11px] text-[var(--warn-text)]">
                      Al comprar este plan, tu plan actual se reemplaza desde hoy ({currentPaidPlan === 'plan_byok' ? 'BYOK' : 'PRO'} → {plan.id === 'plan_byok' ? 'BYOK' : 'PRO'}).
                    </p>
                  )}
                  {sameActivePlan && (
                    <p className="text-[11px] text-[var(--text)]">
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
                  <div className="text-xs text-[var(--text-muted)]">
                    Incluye: {plan.id === 'plan_byok' ? 'IA con tu propia API key' : 'IA con clave gestionada'}.
                  </div>
                  <button
                    onClick={() => handleCheckout(plan.id as 'plan_byok' | 'plan_pro')}
                    disabled={checkoutLoading === plan.id}
                    className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-[var(--text)] hover:opacity-90 disabled:opacity-50"
                  >
                    {checkoutLoading === plan.id ? 'Generando...' : 'Pagar con Wompi'}
                  </button>
                </div>
              );
            })}
            {plans.length === 0 && (
              <div className="rounded-xl surface-soft p-4 text-sm text-[var(--text-muted)]">
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
                <h3 className="text-lg font-semibold text-[var(--text)]">Usuarios y roles</h3>
                <p className="text-xs text-[var(--text-muted)]">Cambia rol o preferencia. Máx 200 usuarios.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={adminSearch}
                  onChange={(e) => setAdminSearch(e.target.value)}
                  placeholder="Buscar UID..."
                  className="rounded-lg field-soft px-3 py-2 text-[11px] outline-none"
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
            <div className="overflow-auto rounded-lg border border-[var(--border-10)]">
              <table className="min-w-full text-left text-xs text-[var(--text)]">
                <thead className="bg-[var(--overlay-5)] text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
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
                      <tr key={u.uid} className="border-t border-[var(--surface-border-1)]">
                        <td className="px-3 py-2 font-mono text-[11px] text-[var(--text)]">{u.uid}</td>
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
                        <td className="px-3 py-2 text-[11px] text-[var(--text)] space-y-1">
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
                            className="w-full rounded-lg field-soft px-2 py-1 text-[11px]"
                            disabled={adminLoading}
                          />
                        </td>
                        <td className="px-3 py-2 text-[11px]">
                          <span
                            className={`rounded-full px-2 py-1 ${
                              u.openaiKeyStored
                                ? 'state-success'
                                : 'bg-[var(--overlay-5)] text-[var(--text-muted)]'
                            }`}
                          >
                            {u.openaiKeyStored ? 'Sí' : 'No'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-[11px] text-[var(--text)] space-y-1">
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
                      <td className="px-3 py-2 text-[var(--text-muted)]" colSpan={5}>
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
