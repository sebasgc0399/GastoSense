import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { AdminListedUser, UsageQuota } from '../services/users';
import {
  adminSetUserRole,
  clearUserOpenAIKey,
  createWompiCheckout,
  fetchPlans,
  fetchUsageQuota,
  fetchUserProfile,
  fetchUsersList,
  registerUserEntry,
  saveUserOpenAIKey,
  updatePreferredKey,
} from '../services/users';
import { useIaQuota } from './useIaQuota';
import type { IaQuota, KeyPreference, PlanInfo, PlanPeriod, UserProfile, UserRole } from '../types';

type PlanId = 'plan_byok' | 'plan_pro';
type AdminSubscriptionSource = 'manual' | 'stripe' | 'promo' | 'wompi';

type AdminUserRow = {
  uid: string;
  role: UserRole;
  openaiKeyStored: boolean;
  preferredKey?: KeyPreference;
  subscriptionStatus?: string;
  subscriptionSource?: AdminSubscriptionSource;
  subscriptionExpires?: string;
};

export interface UseSettingsControllerParams {
  userUid: string | null | undefined;
  logout: () => Promise<void>;
}

export interface SettingsControllerResult {
  userProfile: UserProfile | null;
  profileLoading: boolean;
  settingsMessage: string | null;
  roleLabel: string;
  formatDate: (ts?: number | null) => string | null;
  iaQuota: IaQuota | null;
  refreshQuota: () => Promise<void>;
  parseProgress: number;
  analyzeProgress: number;
  apiKeyInput: string;
  setApiKeyInput: Dispatch<SetStateAction<string>>;
  keySaving: boolean;
  handleSaveApiKey: () => Promise<void>;
  handleClearApiKey: () => Promise<void>;
  preferenceSaving: boolean;
  canUseManaged: boolean;
  showKeySettings: boolean;
  handlePreferredKeyChange: (pref: KeyPreference) => Promise<void>;
  plansRef: RefObject<HTMLDivElement | null>;
  plans: PlanInfo[];
  planPeriods: Record<string, PlanPeriod>;
  setPlanPeriods: Dispatch<SetStateAction<Record<string, PlanPeriod>>>;
  hasActiveSubscription: boolean;
  currentPaidPlan: PlanId | null;
  checkoutLoading: string | null;
  handleCheckout: (planId: PlanId) => Promise<void>;
  formatCurrency: (cents?: number | null) => string;
  formatUsdApprox: (cents?: number | null) => string;
  adminUsers: AdminUserRow[];
  setAdminUsers: Dispatch<SetStateAction<AdminUserRow[]>>;
  adminSearch: string;
  setAdminSearch: Dispatch<SetStateAction<string>>;
  adminLoading: boolean;
  handleAdminReload: () => Promise<void>;
  handleAdminChangeRole: (uid: string, role: UserRole) => void;
  handleAdminSaveUser: (uid: string) => Promise<void>;
  handleCopyUid: () => Promise<void>;
}

function formatAdminUsers(list: AdminListedUser[]): AdminUserRow[] {
  return list.map((item) => ({
    uid: item.uid,
    role: item.profile.role,
    openaiKeyStored: item.profile.openaiKeyStored,
    preferredKey: item.profile.preferredKey,
    subscriptionStatus: item.profile.subscription?.status,
    subscriptionSource: item.profile.subscription?.source,
    subscriptionExpires: item.profile.subscription?.expiresAt
      ? new Date(item.profile.subscription.expiresAt).toISOString().slice(0, 10)
      : '',
  }));
}

export function useSettingsController({ userUid, logout }: UseSettingsControllerParams): SettingsControllerResult {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const userRoleRef = useRef<UserRole | undefined>(undefined);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);
  const [keySaving, setKeySaving] = useState(false);
  const [preferenceSaving, setPreferenceSaving] = useState(false);
  const [adminUsers, setAdminUsers] = useState<AdminUserRow[]>([]);
  const [adminSearch, setAdminSearch] = useState('');
  const [aiQuota, setAiQuota] = useState<UsageQuota | null>(null);
  const [plans, setPlans] = useState<PlanInfo[]>([]);
  const [planPeriods, setPlanPeriods] = useState<Record<string, PlanPeriod>>({});
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [adminLoading, setAdminLoading] = useState(false);
  const plansRef = useRef<HTMLDivElement | null>(null);
  const { quota: iaQuotaFresh } = useIaQuota();

  useEffect(() => {
    userRoleRef.current = userProfile?.role;
  }, [userProfile?.role]);

  const refreshAdminUsers = useCallback(
    async ({ resetSearch = false, role }: { resetSearch?: boolean; role?: UserRole } = {}) => {
      const effectiveRole = role ?? userRoleRef.current;
      if (!userUid || effectiveRole !== 'admin') return;
      const list = await fetchUsersList();
      setAdminUsers(formatAdminUsers(list));
      if (resetSearch) {
        setAdminSearch('');
      }
    },
    [userUid],
  );

  const refreshQuota = useCallback(async () => {
    if (!userUid) return;
    try {
      const quota = await fetchUsageQuota();
      setAiQuota(quota);
    } catch (err) {
      console.error('No pudimos actualizar cuota IA', err);
    }
  }, [userUid]);

  const iaQuota: IaQuota | null = useMemo(() => {
    if (aiQuota) {
      return {
        role: aiQuota.role ?? (userProfile?.role as UserRole) ?? 'free',
        parseUsed: aiQuota.parse.used,
        parseLimit: aiQuota.parse.limit,
        analyzeUsed: aiQuota.analyze.used,
        analyzeLimit: aiQuota.analyze.limit,
        week: aiQuota.week,
        resetAt: aiQuota.resetAt,
      };
    }
    if (iaQuotaFresh) return iaQuotaFresh;
    return null;
  }, [aiQuota, iaQuotaFresh, userProfile?.role]);

  const parseProgress = iaQuota && iaQuota.parseLimit ? iaQuota.parseUsed / iaQuota.parseLimit : 0;
  const analyzeProgress = iaQuota && iaQuota.analyzeLimit ? iaQuota.analyzeUsed / iaQuota.analyzeLimit : 0;

  useEffect(() => {
    const loadProfile = async () => {
      if (!userUid) {
        setUserProfile(null);
        setProfileLoading(false);
        setSettingsMessage(null);
        setAiQuota(null);
        return;
      }
      try {
        setProfileLoading(true);
        setSettingsMessage(null);
        // Reservamos entrada y creamos perfil respetando límite de capacidad
        const profile = (await registerUserEntry()) || (await fetchUserProfile());
        setUserProfile(profile);
        try {
          const planData = await fetchPlans();
          setPlans(planData);
          const defaults: Record<string, PlanPeriod> = {};
          planData.forEach((p) => {
            defaults[p.id] = 'monthly';
          });
          setPlanPeriods((prev) => ({ ...defaults, ...prev }));
        } catch (err) {
          console.error('No pudimos cargar planes', err);
        }
        if (profile?.role === 'admin') {
          setAdminLoading(true);
          await refreshAdminUsers({ resetSearch: true, role: profile.role });
        } else {
          setAdminUsers([]);
        }
      } catch (err) {
        console.error(err);
        const message = (err as Error)?.message || 'No pudimos cargar tu perfil.';
        setSettingsMessage(message);
        // Si es por capacidad/límite, cerramos sesión y avisamos
        if (message.toLowerCase().includes('capacidad')) {
          await logout();
        }
        setAdminUsers([]);
      } finally {
        setProfileLoading(false);
        setAdminLoading(false);
      }
    };
    void loadProfile();
  }, [logout, refreshAdminUsers, userUid]);

  const roleLabel = useMemo(() => {
    if (!userProfile) return 'Sin rol';
    return (
      {
        admin: 'Admin',
        free: 'Free',
        paid_byok: 'BYOK',
        paid_managed: 'PRO',
        gifted_managed: 'Gifted',
      }[userProfile.role] || userProfile.role
    );
  }, [userProfile]);

  const currentPaidPlan: PlanId | null = useMemo(() => {
    if (!userProfile) return null;
    if (userProfile.role === 'paid_byok') return 'plan_byok';
    if (['paid_managed', 'gifted_managed'].includes(userProfile.role)) return 'plan_pro';
    return null;
  }, [userProfile]);

  const hasActiveSubscription = (userProfile?.subscription as { status?: string } | undefined)?.status === 'active';
  const canUseManaged =
    !!userProfile && ['paid_managed', 'gifted_managed', 'admin', 'paid_byok', 'free'].includes(userProfile.role);
  const showKeySettings = userProfile?.role === 'paid_byok' || userProfile?.role === 'admin';

  const formatCurrency = useCallback((cents?: number | null) => {
    if (!cents && cents !== 0) return '--';
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(
      cents / 100,
    );
  }, []);

  const formatUsdApprox = useCallback((cents?: number | null) => {
    if (!cents && cents !== 0) return '';
    // Aproximación rápida: 1 USD = 4000 COP; ajusta si quieres un tipo de cambio distinto.
    const usd = cents / 100 / 4000;
    return `(≈ ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(usd)})`;
  }, []);

  const formatDate = useCallback((ts?: number | null) => {
    if (!ts) return null;
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }, []);

  const handleCheckout = useCallback(
    async (planId: PlanId) => {
      if (!userUid) {
        setSettingsMessage('Inicia sesión para pagar.');
        return;
      }
      const period = planPeriods[planId] ?? 'monthly';
      setCheckoutLoading(planId);
      setSettingsMessage(null);
      try {
        const data = await createWompiCheckout(planId, period);
        window.location.href = data.url;
      } catch (err) {
        console.error(err);
        setSettingsMessage('No pudimos generar el pago. Intenta de nuevo.');
      } finally {
        setCheckoutLoading(null);
      }
    },
    [planPeriods, userUid],
  );

  const handleSaveApiKey = useCallback(async () => {
    if (!userUid) return;
    if (!apiKeyInput.trim()) {
      setSettingsMessage('Pega tu API key antes de guardar.');
      return;
    }
    setKeySaving(true);
    setSettingsMessage(null);
    try {
      await saveUserOpenAIKey(apiKeyInput.trim(), 'byok');
      const profile = await fetchUserProfile();
      setUserProfile(profile);
      setApiKeyInput('');
      setSettingsMessage('API key guardada en el backend.');
      await refreshQuota();
    } catch (err) {
      console.error(err);
      setSettingsMessage('No pudimos guardar la API key.');
    } finally {
      setKeySaving(false);
    }
  }, [apiKeyInput, refreshQuota, userUid]);

  const handleClearApiKey = useCallback(async () => {
    if (!userUid) return;
    setKeySaving(true);
    setSettingsMessage(null);
    try {
      await clearUserOpenAIKey();
      const profile = await fetchUserProfile();
      setUserProfile(profile);
      setApiKeyInput('');
      setSettingsMessage('API key eliminada.');
      await refreshQuota();
    } catch (err) {
      console.error(err);
      setSettingsMessage('No pudimos borrar la API key.');
    } finally {
      setKeySaving(false);
    }
  }, [refreshQuota, userUid]);

  const handlePreferredKeyChange = useCallback(
    async (preferred: KeyPreference) => {
      if (!userUid) return;
      setPreferenceSaving(true);
      setSettingsMessage(null);
      try {
        await updatePreferredKey(preferred);
        const profile = await fetchUserProfile();
        setUserProfile(profile);
        setSettingsMessage('Preferencia actualizada.');
        await refreshQuota();
      } catch (err) {
        console.error(err);
        setSettingsMessage('No pudimos actualizar la preferencia.');
      } finally {
        setPreferenceSaving(false);
      }
    },
    [refreshQuota, userUid],
  );

  const handleAdminChangeRole = useCallback(
    async (targetUid: string, nextRole: UserRole) => {
      if (!userUid) return;
      setAdminLoading(true);
      setSettingsMessage(null);
      try {
        const target = adminUsers.find((u) => u.uid === targetUid);
        await adminSetUserRole({
          uid: targetUid,
          role: nextRole,
          subscription: {
            status: target?.subscriptionStatus as 'active' | 'expired' | undefined,
            source: target?.subscriptionSource as 'manual' | 'stripe' | 'promo' | undefined,
            expiresAt: target?.subscriptionExpires ? new Date(target.subscriptionExpires).getTime() : null,
          },
        });
        await refreshAdminUsers();
        const profile = await fetchUserProfile();
        setUserProfile(profile);
        setSettingsMessage('Rol actualizado.');
      } catch (err) {
        console.error(err);
        setSettingsMessage('No pudimos cambiar el rol.');
      } finally {
        setAdminLoading(false);
      }
    },
    [adminUsers, refreshAdminUsers, userUid],
  );

  const handleAdminSaveUser = useCallback(
    async (targetUid: string) => {
      if (!userUid) return;
      const target = adminUsers.find((u) => u.uid === targetUid);
      if (!target) return;
      setAdminLoading(true);
      setSettingsMessage(null);
      try {
        await adminSetUserRole({
          uid: targetUid,
          role: target.role,
          subscription: {
            status: target.subscriptionStatus as 'active' | 'expired' | undefined,
            source: target.subscriptionSource as 'manual' | 'stripe' | 'promo' | undefined,
            expiresAt: target.subscriptionExpires ? new Date(target.subscriptionExpires).getTime() : null,
          },
        });
        await refreshAdminUsers();
        setSettingsMessage('Usuario actualizado.');
      } catch (err) {
        console.error(err);
        setSettingsMessage('No pudimos guardar los cambios.');
      } finally {
        setAdminLoading(false);
      }
    },
    [adminUsers, refreshAdminUsers, userUid],
  );

  const handleAdminReload = useCallback(async () => {
    if (!userUid || userProfile?.role !== 'admin') return;
    setAdminLoading(true);
    try {
      await refreshAdminUsers();
    } catch (err) {
      console.error(err);
      setSettingsMessage('No pudimos recargar la lista de usuarios.');
    } finally {
      setAdminLoading(false);
    }
  }, [refreshAdminUsers, userProfile?.role, userUid]);

  const handleCopyUid = useCallback(async () => {
    if (!userUid) return;
    try {
      await navigator.clipboard.writeText(userUid);
      setSettingsMessage('UID copiado al portapapeles.');
    } catch (err) {
      console.error(err);
      setSettingsMessage('No se pudo copiar el UID.');
    }
  }, [userUid]);

  return {
    userProfile,
    profileLoading,
    settingsMessage,
    roleLabel,
    formatDate,
    iaQuota,
    refreshQuota,
    parseProgress,
    analyzeProgress,
    apiKeyInput,
    setApiKeyInput,
    keySaving,
    handleSaveApiKey,
    handleClearApiKey,
    preferenceSaving,
    canUseManaged,
    showKeySettings,
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
    adminUsers,
    setAdminUsers,
    adminSearch,
    setAdminSearch,
    adminLoading,
    handleAdminReload,
    handleAdminChangeRole,
    handleAdminSaveUser,
    handleCopyUid,
  };
}
