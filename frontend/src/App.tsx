import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BottomNav, type TabKey } from './components/BottomNav';
import { QuickAddSheet } from './components/QuickAddSheet';
import { TransactionEditModal } from './components/TransactionEditModal';
import { UpgradeModal } from './components/UpgradeModal';
import { LimitsHelpModal } from './components/LimitsHelpModal';
import { useAuth } from './context/AuthContext';
import { LoginHero } from './components/LoginHero';
import { useThemeMode } from './context/ThemeContext';
import { AdvisorPage } from './pages/AdvisorPage';
import { HomePage } from './pages/HomePage';
import { SettingsPage } from './pages/SettingsPage';
import { TransactionsPage } from './pages/TransactionsPage';
import { callAnalyzeSummary, callAnalyzeMonthlyDeep, callParseTransactionPhrase } from './services/functions';
import { trackEvent } from './services/analytics';
import { useIaQuota } from './hooks/useIaQuota';
import { useBudgetController } from './hooks/useBudgetController';
import { useTemplatesController } from './hooks/useTemplatesController';
import { useTransactionsController } from './hooks/useTransactionsController';
import { useHomeMonthController } from './hooks/useHomeMonthController';
import {
  adminSetUserRole,
  clearUserOpenAIKey,
  fetchUserProfile,
  fetchUsersList,
  setUserAdvisorMode,
  saveUserOpenAIKey,
  updatePreferredKey,
  registerUserEntry,
  fetchUsageQuota,
  type UsageQuota,
  fetchPlans,
  createWompiCheckout,
} from './services/users';
import {
  createTransaction,
  deleteTransaction,
  fetchTransactionsRange,
  updateTransaction,
} from './services/transactions';
import type {
  AdvisorMode,
  ParsedTransactionSuggestion,
  Transaction,
  TransactionInput,
  UserProfile,
  KeyPreference,
  UserRole,
  PlanInfo,
  PlanPeriod,
} from './types';
import { monthStartIso, todayIso } from './utils/dates';
type PlanId = 'plan_byok' | 'plan_pro';

type ChatItem = {
  id: string;
  from: 'user' | 'ia';
  text: string;
  ts: number;
  tone?: AdvisorMode;
  kind?: 'action' | 'tx' | 'ia';
  chartTop?: { category: string; amount: number }[];
};
type AdminSubscriptionSource = 'manual' | 'stripe' | 'promo' | 'wompi';
function App() {
  const { user, loading, logout } = useAuth();
  const { theme, toggleTheme } = useThemeMode();
  const [activeTab, setActiveTab] = useState<TabKey>('home');
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const openQuickAddSheet = useCallback(() => setShowQuickAdd(true), []);
  const [advisorMode, setAdvisorMode] = useState<AdvisorMode>('amable');
  const [chatFeed, setChatFeed] = useState<ChatItem[]>([]);
  const {
    filters,
    handleFiltersChange: txHandleFiltersChange,
    transactions,
    transactionsReady,
    error,
    txPage,
    setTxPage,
    txPageSize,
    paginatedTransactions,
    totalTxPages,
  } = useTransactionsController({ userId: user?.uid });
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const userRoleRef = useRef<UserRole | undefined>(undefined);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);
  const [keySaving, setKeySaving] = useState(false);
  const [preferenceSaving, setPreferenceSaving] = useState(false);
  const [adminUsers, setAdminUsers] = useState<
    {
      uid: string;
      role: UserRole;
      openaiKeyStored: boolean;
      preferredKey?: KeyPreference;
      subscriptionStatus?: string;
      subscriptionSource?: 'manual' | 'stripe' | 'promo' | 'wompi';
      subscriptionExpires?: string;
    }[]
  >([]);
  const defaultMonth = todayIso().slice(0, 7);
  const [currentMonth, setCurrentMonth] = useState(defaultMonth);
  const { budget, budgetSaving, handleSaveBudget, handleSaveCategoryBudgets } = useBudgetController({
    userId: user?.uid,
    currentMonth,
  });
  const [adminSearch, setAdminSearch] = useState('');
  const [aiQuota, setAiQuota] = useState<UsageQuota | null>(null);
  const [plans, setPlans] = useState<PlanInfo[]>([]);
  const [planPeriods, setPlanPeriods] = useState<Record<string, PlanPeriod>>({});
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [adminLoading, setAdminLoading] = useState(false);
  const {
    templates,
    recurringTemplates,
    selectedTemplate,
    clearSelectedTemplate,
    saveTemplate: handleSaveTemplate,
    updateTemplate: handleUpdateTemplate,
    deleteTemplate: handleDeleteTemplate,
    handleUseTemplate,
  } = useTemplatesController({ userId: user?.uid, onOpenQuickAdd: openQuickAddSheet });
  const [advisorLoading, setAdvisorLoading] = useState(false);
  const { quota: iaQuotaFresh } = useIaQuota();
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeContext, setUpgradeContext] = useState<'parse_exhausted' | 'analyze_exhausted' | 'feature_locked'>(
    'parse_exhausted',
  );
  const [showLimitsHelp, setShowLimitsHelp] = useState(false);
  const plansRef = useRef<HTMLDivElement | null>(null);
  const formatAdminUsers = (
    list: Awaited<ReturnType<typeof fetchUsersList>>,
  ): {
    uid: string;
    role: UserRole;
    openaiKeyStored: boolean;
    preferredKey?: KeyPreference | undefined;
    subscriptionStatus?: string | undefined;
    subscriptionSource?: AdminSubscriptionSource | undefined;
    subscriptionExpires?: string | undefined;
  }[] =>
    list.map((item) => ({
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

  useEffect(() => {
    userRoleRef.current = userProfile?.role;
  }, [userProfile?.role]);

  const refreshAdminUsers = useCallback(
    async ({ resetSearch = false, role }: { resetSearch?: boolean; role?: UserRole } = {}) => {
      const effectiveRole = role ?? userRoleRef.current;
      if (!user || effectiveRole !== 'admin') return;
      const list = await fetchUsersList();
      setAdminUsers(formatAdminUsers(list));
      if (resetSearch) {
        setAdminSearch('');
      }
    },
    [user],
  );
  const refreshQuota = useCallback(async () => {
    if (!user) return;
    try {
      const quota = await fetchUsageQuota();
      setAiQuota(quota);
    } catch (err) {
      console.error('No pudimos actualizar cuota IA', err);
    }
  }, [user]);

  const iaQuota = useMemo(() => {
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
    const stored = localStorage.getItem('advisorMode');
    if (stored === 'amable' || stored === 'reganon') {
      setAdvisorMode(stored);
    }
  }, []);

  useEffect(() => {
    if (showUpgradeModal) {
      document.body.classList.add('overflow-hidden');
    } else {
      document.body.classList.remove('overflow-hidden');
    }
    return () => {
      document.body.classList.remove('overflow-hidden');
    };
  }, [showUpgradeModal]);

  useEffect(() => {
    const loadProfile = async () => {
      if (!user) {
        setUserProfile(null);
        setProfileLoading(false);
        setSettingsMessage(null);
        setAiQuota(null);
        setChatFeed([]);
        return;
      }
      try {
        setProfileLoading(true);
        setSettingsMessage(null);
        // Reservamos entrada y creamos perfil respetando límite de capacidad
        const profile = (await registerUserEntry()) || (await fetchUserProfile());
        setUserProfile(profile);
        if (profile?.advisorMode === 'amable' || profile?.advisorMode === 'reganon') {
          setAdvisorMode(profile.advisorMode);
          localStorage.setItem('advisorMode', profile.advisorMode);
        }
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
    loadProfile();
  }, [logout, refreshAdminUsers, user]);
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
    !!userProfile &&
    ['paid_managed', 'gifted_managed', 'admin', 'paid_byok', 'free'].includes(userProfile.role);
  const showKeySettings = userProfile?.role === 'paid_byok' || userProfile?.role === 'admin';

  const isResourceExhausted = useCallback((err: unknown) => {
    const codeRaw = (err as { code?: unknown } | null)?.code;
    const code =
      typeof codeRaw === 'string'
        ? codeRaw
        : typeof codeRaw === 'number'
          ? codeRaw.toString()
          : codeRaw && typeof (codeRaw as { toString?: () => string }).toString === 'function'
            ? (codeRaw as { toString: () => string }).toString()
            : '';
    return code.includes('resource-exhausted');
  }, []);

  const mapAiError = useCallback((err: unknown, kind: 'parse' | 'analyze' = 'parse') => {
    const codeRaw = (err as { code?: unknown } | null)?.code;
    const code =
      typeof codeRaw === 'string'
        ? codeRaw
        : typeof codeRaw === 'number'
          ? codeRaw.toString()
          : codeRaw && typeof (codeRaw as { toString?: () => string }).toString === 'function'
            ? (codeRaw as { toString: () => string }).toString()
            : '';
    const totalUsed = kind === 'analyze' ? (iaQuota?.analyzeUsed ?? 0) : (iaQuota?.parseUsed ?? 0);
    const limit = kind === 'analyze' ? (iaQuota?.analyzeLimit ?? 0) : (iaQuota?.parseLimit ?? 0);
    const quotaText = limit ? ` (${totalUsed}/${limit})` : '';
    if (code.includes('permission-denied') || code.includes('failed-precondition')) {
      return 'Configura tu API key en Configuración o activa tu membresía para usar la IA.';
    }
    if (code.includes('resource-exhausted')) {
      return `Alcanzaste el límite semanal de IA para tu plan${quotaText}.`;
    }
    return 'No pudimos consultar la IA. Inténtalo de nuevo en unos minutos.';
  }, [iaQuota?.analyzeLimit, iaQuota?.analyzeUsed, iaQuota?.parseLimit, iaQuota?.parseUsed]);

  const formatCurrency = useCallback((cents?: number | null) => {
    if (!cents && cents !== 0) return '--';
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(
      cents / 100,
    );
  }, []);

  const formatPesos = useCallback((value?: number | null) => {
    if (!value && value !== 0) return '--';
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(
      value,
    );
  }, []);

  const formatUsdApprox = useCallback((cents?: number | null) => {
    if (!cents && cents !== 0) return '';
    // Aproximación rápida: 1 USD = 4000 COP; ajusta si quieres un tipo de cambio distinto.
    const usd = (cents / 100) / 4000;
    return `(≈ ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(usd)})`;
  }, []);

  const formatDate = useCallback((ts?: number | null) => {
    if (!ts) return null;
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }, []);

  const categoryBudgetsRef = useRef<HTMLDivElement | null>(null);
  const scrollToPlans = useCallback(
    () => plansRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    [],
  );
  const scrollToBudgets = useCallback(
    () => categoryBudgetsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    [],
  );

  const openBudgets = useCallback((category?: string) => {
    setActiveTab('home');
    trackEvent('smart_card_click', { action: 'budgets', category });
    // Scroll al bloque de presupuestos; si ya está en pantalla, hará scroll suave
    setTimeout(() => scrollToBudgets(), 100);
  }, [scrollToBudgets]);

  const openMovements = useCallback((category?: string) => {
    txHandleFiltersChange({ startDate: monthStartIso(), endDate: todayIso(), category: category || 'all' });
    setActiveTab('transactions');
    trackEvent('smart_card_click', { action: 'movements', category });
  }, [txHandleFiltersChange]);

  const openQuickAdd = useCallback((mode?: 'income' | 'expense') => {
    setShowQuickAdd(true);
    trackEvent('smart_card_click', { action: 'quick_add', mode });
    if (mode === 'income') {
      clearSelectedTemplate();
      // Podrías setear un estado para preseleccionar tipo ingreso si el formulario lo soporta
    }
  }, [clearSelectedTemplate]);

  const openAdvisor = useCallback((context?: Record<string, unknown>) => {
    setActiveTab('advisor');
    trackEvent('smart_card_click', { action: 'advisor', ...context });
  }, []);

  const openPlans = useCallback(() => {
    setActiveTab('settings');
    trackEvent('smart_card_click', { action: 'plans' });
    setTimeout(() => scrollToPlans(), 120);
  }, [scrollToPlans]);

  const {
    monthTransactions,
    monthlyExpense,
    monthlyIncome,
    availableBalance,
    topExpenses,
    categorySpendMap,
    previousMonth,
    smartCards,
    smartCardIndex,
    setSmartCardIndex,
    handlePrevInsight,
    handleNextInsight,
    handleTouchStart,
    handleTouchEnd,
  } = useHomeMonthController({
    userId: user?.uid,
    currentMonth,
    budget,
    templates,
    transactions,
    iaQuota,
    formatPesos,
    openBudgets,
    openMovements,
    openQuickAdd,
    openPlans,
    openAdvisor,
    handleUseTemplate,
  });

  const getWeekKey = useCallback(() => {
    if (iaQuota?.week) return iaQuota.week;
    if (iaQuota?.resetAt) return iaQuota.resetAt.slice(0, 10);
    return todayIso();
  }, [iaQuota?.resetAt, iaQuota?.week]);

  const hasShownUpgrade = useCallback(
    (kind: 'parse' | 'analyze') => {
      const key = `upgrade_shown_${kind}_${getWeekKey()}`;
      return localStorage.getItem(key) === '1';
    },
    [getWeekKey],
  );

  const markUpgradeShown = useCallback(
    (kind: 'parse' | 'analyze') => {
      const key = `upgrade_shown_${kind}_${getWeekKey()}`;
      localStorage.setItem(key, '1');
    },
    [getWeekKey],
  );

  const openUpgrade = useCallback(
    (ctx: 'parse_exhausted' | 'analyze_exhausted' | 'feature_locked') => {
      setUpgradeContext(ctx);
      setShowUpgradeModal(true);
    },
    [],
  );

  const handleShowLimitsHelp = useCallback(() => setShowLimitsHelp(true), []);

  const triggerUpgradeOnce = useCallback(
    (ctx: 'parse_exhausted' | 'analyze_exhausted') => {
      const kind = ctx === 'parse_exhausted' ? 'parse' : 'analyze';
      if (hasShownUpgrade(kind)) return;
      markUpgradeShown(kind);
      openUpgrade(ctx);
    },
    [hasShownUpgrade, markUpgradeShown, openUpgrade],
  );

  const handleFiltersChange = useCallback(
    (next: { startDate: string; endDate: string; category: string }) => {
      const { startDate, endDate, category } = next;
      // Aseguramos orden para evitar consultas vacías si el usuario invierte las fechas
      if (startDate && endDate && startDate > endDate) {
        txHandleFiltersChange({ startDate: endDate, endDate: startDate, category });
      } else {
        txHandleFiltersChange(next);
      }
    },
    [txHandleFiltersChange],
  );

  const iaRole: UserRole = (userProfile?.role as UserRole) || (iaQuota?.role as UserRole) || 'free';
  const isFreeRole = iaRole === 'free';
  const isManagedRole = ['paid_managed', 'gifted_managed', 'admin'].includes(iaRole);
  const parseExhausted =
    iaQuota?.parseLimit !== undefined && iaQuota?.parseLimit !== null
      ? iaQuota.parseUsed >= iaQuota.parseLimit
      : false;
  const analyzeExhausted =
    iaQuota?.analyzeLimit !== undefined && iaQuota?.analyzeLimit !== null
      ? iaQuota.analyzeUsed >= iaQuota.analyzeLimit
      : false;
  const advisorQuickActions = [
    {
      label: 'Espejo diario',
      description: 'Resumen de hoy',
      action: 'Espejo diario',
      locked: false,
      requiresAnalyze: true,
      badge: '',
    },
    {
      label: 'Detector de gastos hormiga',
      description: 'Detecta gastos pequeños recurrentes y cuánto podrías ahorrar.',
      action: 'Gastos hormiga',
      locked: isFreeRole,
      requiresAnalyze: true,
      badge: 'PRO/BYOK',
    },
    {
      label: 'Resumen semanal',
      description: 'Cómo vas esta semana vs la anterior.',
      action: 'Resumen semanal',
      locked: isFreeRole,
      requiresAnalyze: true,
      badge: 'PRO/BYOK',
    },
    {
      label: 'En qué se va la plata',
      description: 'Top de categorías y proporciones.',
      action: 'En qué se va la plata',
      locked: isFreeRole,
      requiresAnalyze: true,
      badge: 'PRO/BYOK',
    },
    {
      label: 'Análisis mensual profundo',
      description: 'Compara tus últimos 3 meses y da un plan por categoría.',
      action: 'Análisis mensual profundo',
      locked: !isManagedRole,
      requiresAnalyze: true,
      badge: 'PRO',
    },
  ];

  const featureLocks: { id: string; title: string; description: string; badge: string }[] = [];

  const pushFeedItem = useCallback((item: Omit<ChatItem, 'id' | 'ts'> & { id?: string; ts?: number }) => {
    const id = item.id ?? `chat-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const ts = item.ts ?? Date.now();
    setChatFeed((prev) => {
      const next = [...prev, { ...item, id, ts }];
      return next.length > 50 ? next.slice(next.length - 50) : next;
    });
  }, []);

  const handleSaveTransaction = async (payload: TransactionInput) => {
    if (!user) return;
    await createTransaction(payload, user.uid);
  };

  const handleUpdateTransaction = async (id: string, payload: TransactionInput) => {
    if (!user) return;
    await updateTransaction(id, payload, user.uid);
  };

  const handleDeleteTransaction = useCallback(async (id: string) => {
    await deleteTransaction(id);
  }, []);

  const handleInterpret = async (text: string): Promise<ParsedTransactionSuggestion> => {
    try {
      const resp = await callParseTransactionPhrase({
        text,
        clientOffsetMinutes: new Date().getTimezoneOffset(),
      });
      const data = resp.data as { parsed: ParsedTransactionSuggestion };
      const quota = await fetchUsageQuota();
      if (quota) setAiQuota(quota);
      return data.parsed;
    } catch (err) {
      if (isResourceExhausted(err)) {
        triggerUpgradeOnce('parse_exhausted');
      }
      throw new Error(mapAiError(err, 'parse'));
    }
  };

  const handleToneChange = useCallback(async (mode: AdvisorMode) => {
    if (mode === advisorMode) return;
    setAdvisorMode(mode);
    setChatFeed([]);
    localStorage.setItem('advisorMode', mode);
    if (user) {
      try {
        await setUserAdvisorMode(mode);
      } catch (err) {
        console.error('No pudimos guardar el tono en perfil', err);
      }
    }
  }, [advisorMode, user]);

  const handleAdvisorAction = useCallback(async (action: string) => {
    if (iaQuota && iaQuota.analyzeLimit !== undefined && iaQuota.analyzeUsed >= iaQuota.analyzeLimit) {
      openUpgrade('analyze_exhausted');
      return;
    }
    try {
      if (!user) {
        pushFeedItem({
          from: 'ia',
          text: 'Inicia sesión para usar el asesor IA.',
          tone: advisorMode,
          kind: 'ia',
        });
        return;
      }
      setAdvisorLoading(true);
      pushFeedItem({
        from: 'user',
        text: action,
        kind: 'action',
      });
      if (action === 'Análisis mensual profundo') {
        const now = new Date();
        const months: string[] = [];
        for (let i = 2; i >= 0; i -= 1) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          months.push(d.toISOString().slice(0, 7));
        }
        const rangeStart = new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString().slice(0, 10);
        const rangeEnd = todayIso();
        const txs = await fetchTransactionsRange({ userId: user?.uid || '', startDate: rangeStart, endDate: rangeEnd });
        const catMap: Record<
          string,
          {
            name: string;
            sums: number[];
            isIncome?: boolean;
          }
        > = {};
        txs.forEach((tx) => {
          if (!tx.date || !tx.category) return;
          const m = tx.date.slice(0, 7);
          const pos = months.indexOf(m);
          if (pos === -1) return;
          if (!catMap[tx.category]) {
            catMap[tx.category] = { name: tx.category, sums: Array(months.length).fill(0), isIncome: tx.type === 'income' };
          }
          catMap[tx.category].sums[pos] += tx.amount;
          if (tx.type === 'income') catMap[tx.category].isIncome = true;
        });
        const categories = Object.values(catMap).map((c) => ({
          id: c.name,
          name: c.name,
          last3Months: c.sums,
          last3Budgets: months.map((m) =>
            m === currentMonth && budget?.perCategory ? budget.perCategory[c.name] ?? null : null,
          ),
          isIncome: c.isIncome,
        }));
        const payload = {
          tone: advisorMode,
          currency: 'COP',
          userLocale: 'es-CO',
          months,
          categories,
        };
        const resp = await callAnalyzeMonthlyDeep({ input: payload });
        const data = resp.data as {
          summary?: string;
          globalTrend?: string;
          categoryPlans?: { categoryName: string; advice?: string; changePctVsAvg?: number; overBudgetPct?: number | null }[];
          top3Actions?: string[];
        };
        const parts: string[] = [];
        if (data.summary) parts.push(data.summary);
        if (data.globalTrend) {
          const trendText =
            data.globalTrend === 'sube'
              ? 'Gasto subiendo vs. promedio previo.'
            : data.globalTrend === 'baja'
              ? 'Gasto bajando vs. promedio previo.'
              : 'Gasto estable vs. meses previos.';
          parts.push(`Tendencia: ${trendText}`);
        }
        const plans = data.categoryPlans?.slice(0, 3) ?? [];
        if (plans.length) {
          parts.push('Categorías clave:');
          plans.forEach((p) => {
            const change =
              typeof p.changePctVsAvg === 'number'
                ? `${p.changePctVsAvg > 0 ? '+' : ''}${Math.round(p.changePctVsAvg)}%`
                : '';
            const over =
              typeof p.overBudgetPct === 'number' && p.overBudgetPct > 0
                ? `, sobre tope ${Math.round(p.overBudgetPct)}%`
                : '';
            parts.push(`• ${p.categoryName}: ${p.advice ?? ''} (cambio ${change}${over})`);
          });
        }
        const actionsSet = new Set<string>();
        (data.top3Actions || []).forEach((a) => actionsSet.add(a));
        const actions = Array.from(actionsSet).slice(0, 3);
        if (actions.length) {
          parts.push('');
          parts.push('Acciones clave:');
          actions.forEach((a) => parts.push(`• ${a}`));
        }
        pushFeedItem({
          from: 'ia',
          text: parts.join('\n'),
          tone: advisorMode,
          kind: 'ia',
        });
      } else {
        const resp = await callAnalyzeSummary({
          mode: advisorMode,
          action,
          summary: {
            month: currentMonth,
            totalExpense: monthlyExpense,
            totalIncome: monthlyIncome,
            topCategories: topExpenses,
            budget: budget?.total,
            lastTransactions: monthTransactions.slice(0, 5),
            previousMonthExpense: previousMonth?.expense,
            previousMonthIncome: previousMonth?.income,
          },
        });
        const data = resp.data as { message?: string };
        pushFeedItem({
          from: 'ia',
          text: data?.message ?? 'Sin respuesta de IA.',
          tone: advisorMode,
          kind: 'ia',
          chartTop: action.toLowerCase().includes('plata')
            ? topExpenses.slice(0, 3).map((t) => ({ category: t.category, amount: t.amount }))
            : undefined,
        });
      }
      const quota = await fetchUsageQuota();
      if (quota) setAiQuota(quota);
    } catch (err) {
      console.error(err);
      pushFeedItem({
        from: 'ia',
        text: mapAiError(err, 'analyze'),
        tone: advisorMode,
        kind: 'ia',
      });
      if (isResourceExhausted(err)) {
        triggerUpgradeOnce('analyze_exhausted');
      }
    } finally {
      setAdvisorLoading(false);
    }
  }, [
    advisorMode,
    budget,
    currentMonth,
    iaQuota,
    isResourceExhausted,
    mapAiError,
    monthTransactions,
    monthlyExpense,
    monthlyIncome,
    openUpgrade,
    previousMonth,
    pushFeedItem,
    topExpenses,
    triggerUpgradeOnce,
    user,
  ]);

  const handleCheckout = useCallback(async (planId: 'plan_byok' | 'plan_pro') => {
    if (!user) {
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
  }, [planPeriods, user]);

  const handleSaveApiKey = useCallback(async () => {
    if (!user) return;
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
  }, [apiKeyInput, refreshQuota, user]);

  const handleClearApiKey = useCallback(async () => {
    if (!user) return;
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
  }, [refreshQuota, user]);

  const handlePreferredKeyChange = useCallback(async (preferred: KeyPreference) => {
    if (!user) return;
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
  }, [refreshQuota, user]);

  const handleAdminChangeRole = useCallback(async (targetUid: string, nextRole: UserRole) => {
    if (!user) return;
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
  }, [adminUsers, refreshAdminUsers, user]);

  const handleAdminSaveUser = useCallback(async (targetUid: string) => {
    if (!user) return;
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
  }, [adminUsers, refreshAdminUsers, user]);

  const handleAdminReload = useCallback(async () => {
    if (!user || userProfile?.role !== 'admin') return;
    setAdminLoading(true);
    try {
      await refreshAdminUsers();
    } catch (err) {
      console.error(err);
      setSettingsMessage('No pudimos recargar la lista de usuarios.');
    } finally {
      setAdminLoading(false);
    }
  }, [refreshAdminUsers, user, userProfile?.role]);

  const handleCopyUid = useCallback(async () => {
    if (!user?.uid) return;
    try {
      await navigator.clipboard.writeText(user.uid);
      setSettingsMessage('UID copiado al portapapeles.');
    } catch (err) {
      console.error(err);
      setSettingsMessage('No se pudo copiar el UID.');
    }
  }, [user?.uid]);

  const loaderMessage = useMemo(() => {
    const pendingTransactions = user && !transactionsReady;
    const pendingProfile = user && profileLoading;
    const pendingAuth = loading;
    const needsLoader = pendingAuth || pendingProfile || pendingTransactions;
    if (needsLoader) return 'Sincronizando datos y configuración...';
    return null;
  }, [loading, profileLoading, transactionsReady, user]);

  if (loaderMessage) {
    return (
      <div
        className="relative flex min-h-screen items-center justify-center overflow-hidden text-[var(--text)]"
        style={{ backgroundColor: 'var(--bg)' }}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(16,185,129,0.14),transparent_35%),radial-gradient(circle_at_80%_25%,rgba(59,130,246,0.12),transparent_35%),radial-gradient(circle_at_50%_80%,rgba(14,165,233,0.08),transparent_40%)]" />
        <div className="relative flex flex-col items-center gap-4 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] px-8 py-6 shadow-2xl backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full border-4 border-[color-mix(in_srgb,var(--accent)_55%,transparent)] border-t-transparent animate-spin" />
            <div className="flex flex-col">
              <p className="text-base font-semibold text-[var(--text)]">Preparando tu espacio</p>
              <p className="text-sm text-[var(--text-muted)]">{loaderMessage}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-[var(--text)]">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--accent)]/85" />
            <span>IA y finanzas listas en segundos</span>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginHero />;
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] pb-24 text-[var(--text)]">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[var(--bg)]/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Gastos personales</p>
            <h1 className="text-xl font-semibold text-white">Tu dinero bajo control</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:border-white/20"
              onClick={logout}
            >
              Salir
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-5 space-y-4">
        {activeTab === 'home' && (
          <HomePage
            monthlyExpense={monthlyExpense}
            monthlyIncome={monthlyIncome}
            availableBalance={availableBalance}
            currentMonth={currentMonth}
            defaultMonth={defaultMonth}
            setCurrentMonth={setCurrentMonth}
            budget={budget}
            handleSaveBudget={handleSaveBudget}
            budgetSaving={budgetSaving}
            categoryBudgetsRef={categoryBudgetsRef}
            handleSaveCategoryBudgets={handleSaveCategoryBudgets}
            topExpenses={topExpenses}
            smartCards={smartCards}
            smartCardIndex={smartCardIndex}
            setSmartCardIndex={setSmartCardIndex}
            handlePrevInsight={handlePrevInsight}
            handleNextInsight={handleNextInsight}
            handleTouchStart={handleTouchStart}
            handleTouchEnd={handleTouchEnd}
            recurringTemplates={recurringTemplates}
            handleUseTemplate={handleUseTemplate}
            handleDeleteTemplate={handleDeleteTemplate}
          />
        )}
        {activeTab === 'transactions' && (
          <TransactionsPage
            transactions={transactions}
            filters={filters}
            handleFiltersChange={handleFiltersChange}
            error={error}
            paginatedTransactions={paginatedTransactions}
            txPageSize={txPageSize}
            txPage={txPage}
            totalTxPages={totalTxPages}
            setTxPage={setTxPage}
            budget={budget}
            categorySpendMap={categorySpendMap}
            setSelectedTx={setSelectedTx}
            handleDeleteTransaction={handleDeleteTransaction}
          />
        )}
        {activeTab === 'advisor' && (
          <AdvisorPage
            advisorMode={advisorMode}
            handleToneChange={handleToneChange}
            advisorQuickActions={advisorQuickActions}
            analyzeExhausted={analyzeExhausted}
            openUpgrade={openUpgrade}
            handleAdvisorAction={handleAdvisorAction}
            featureLocks={featureLocks}
            chatFeed={chatFeed}
            advisorLoading={advisorLoading}
            formatPesos={formatPesos}
          />
        )}
        {activeTab === 'settings' && (
          <SettingsPage
            userUid={user?.uid}
            handleCopyUid={handleCopyUid}
            theme={theme}
            toggleTheme={toggleTheme}
            roleLabel={roleLabel}
            userProfile={userProfile}
            settingsMessage={settingsMessage}
            formatDate={formatDate}
            iaQuota={iaQuota}
            parseProgress={parseProgress}
            analyzeProgress={analyzeProgress}
            openUpgrade={openUpgrade}
            onShowLimitsHelp={handleShowLimitsHelp}
            showKeySettings={showKeySettings}
            profileLoading={profileLoading}
            apiKeyInput={apiKeyInput}
            setApiKeyInput={setApiKeyInput}
            keySaving={keySaving}
            handleSaveApiKey={handleSaveApiKey}
            handleClearApiKey={handleClearApiKey}
            preferenceSaving={preferenceSaving}
            canUseManaged={canUseManaged}
            handlePreferredKeyChange={handlePreferredKeyChange}
            plansRef={plansRef}
            plans={plans}
            planPeriods={planPeriods}
            setPlanPeriods={setPlanPeriods}
            hasActiveSubscription={hasActiveSubscription}
            currentPaidPlan={currentPaidPlan}
            checkoutLoading={checkoutLoading}
            handleCheckout={handleCheckout}
            formatCurrency={formatCurrency}
            formatUsdApprox={formatUsdApprox}
            adminSearch={adminSearch}
            setAdminSearch={setAdminSearch}
            adminLoading={adminLoading}
            handleAdminReload={handleAdminReload}
            adminUsers={adminUsers}
            setAdminUsers={setAdminUsers}
            handleAdminChangeRole={handleAdminChangeRole}
            handleAdminSaveUser={handleAdminSaveUser}
          />
        )}
      </main>

      <button
        onClick={() => setShowQuickAdd(true)}
        className="fixed bottom-20 right-4 z-30 flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 hover:bg-sky-600 sm:bottom-24"
      >
        <span className="text-lg">+</span> Registrar gasto
      </button>

      <BottomNav value={activeTab} onChange={setActiveTab} />

      <QuickAddSheet
        open={showQuickAdd}
        onClose={() => setShowQuickAdd(false)}
        onSave={handleSaveTransaction}
        onInterpret={handleInterpret}
        parseLocked={parseExhausted}
        onParseLocked={() => openUpgrade('parse_exhausted')}
        templates={templates}
        onSaveTemplate={handleSaveTemplate}
        onDeleteTemplate={handleDeleteTemplate}
        onUpdateTemplate={handleUpdateTemplate}
        selectedTemplate={selectedTemplate}
        onClearSelectedTemplate={clearSelectedTemplate}
      />

      <TransactionEditModal
        open={!!selectedTx}
        transaction={selectedTx}
        onClose={() => setSelectedTx(null)}
        onSave={handleUpdateTransaction}
        onDelete={handleDeleteTransaction}
      />

      <UpgradeModal
        open={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        context={upgradeContext}
        role={(iaQuota?.role as UserRole) || userProfile?.role || 'free'}
        plans={plans}
        onGoToPlans={openPlans}
      />

      <LimitsHelpModal open={showLimitsHelp} onClose={() => setShowLimitsHelp(false)} />
    </div>
  );
}

export default App;
