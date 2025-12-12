import type React from 'react';
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
import { getBudget, saveBudget } from './services/budgets';
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
  listenTransactions,
  updateTransaction,
} from './services/transactions';
import { deleteTemplate, fetchTemplates, saveTemplate, updateTemplate } from './services/templates';
import type {
  AdvisorMode,
  Budget,
  ParsedTransactionSuggestion,
  Transaction,
  TransactionInput,
  Template,
  UserProfile,
  KeyPreference,
  UserRole,
  PlanInfo,
  PlanPeriod,
} from './types';
import { monthEndIso, monthStartIso, previousMonthRange, todayIso } from './utils/dates';
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
type SmartCard = {
  id: string;
  slot: 1 | 2 | 3 | 4;
  title: string;
  body: string;
  primaryAction: { label: string; onClick: () => void };
  secondaryAction?: { label: string; onClick: () => void };
};
type AdminSubscriptionSource = 'manual' | 'stripe' | 'promo' | 'wompi';
function App() {
  const { user, loading, logout } = useAuth();
  const { theme, toggleTheme } = useThemeMode();
  const [activeTab, setActiveTab] = useState<TabKey>('home');
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [advisorMode, setAdvisorMode] = useState<AdvisorMode>('amable');
  const [chatFeed, setChatFeed] = useState<ChatItem[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filters, setFilters] = useState({ startDate: monthStartIso(), endDate: todayIso(), category: 'all' });
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [budgetSaving, setBudgetSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const userRoleRef = useRef<UserRole | undefined>(undefined);
  const [transactionsReady, setTransactionsReady] = useState(false);
  const transactionsUserRef = useRef<string | null>(null);
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
  const [adminSearch, setAdminSearch] = useState('');
  const [aiQuota, setAiQuota] = useState<UsageQuota | null>(null);
  const [plans, setPlans] = useState<PlanInfo[]>([]);
  const [planPeriods, setPlanPeriods] = useState<Record<string, PlanPeriod>>({});
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [adminLoading, setAdminLoading] = useState(false);
  const [previousMonth, setPreviousMonth] = useState<{ expense: number; income: number } | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [advisorLoading, setAdvisorLoading] = useState(false);
  const [smartCards, setSmartCards] = useState<SmartCard[]>([]);
  const [smartCardIndex, setSmartCardIndex] = useState(0);
  const [homeMonthTransactions, setHomeMonthTransactions] = useState<Transaction[]>([]);
  const { quota: iaQuotaFresh } = useIaQuota();
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeContext, setUpgradeContext] = useState<'parse_exhausted' | 'analyze_exhausted' | 'feature_locked'>(
    'parse_exhausted',
  );
  const [showLimitsHelp, setShowLimitsHelp] = useState(false);
  const plansRef = useRef<HTMLDivElement | null>(null);
  const [txPage, setTxPage] = useState(1);
  const txPageSize = 8;
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
  const refreshQuota = async () => {
    if (!user) return;
    try {
      const quota = await fetchUsageQuota();
      setAiQuota(quota);
    } catch (err) {
      console.error('No pudimos actualizar cuota IA', err);
    }
  };

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
    if (!user) {
      setTransactions([]);
      setTransactionsReady(false);
      transactionsUserRef.current = null;
      return;
    }
    if (transactionsUserRef.current !== user.uid) {
      setTransactionsReady(false);
      transactionsUserRef.current = user.uid;
    }
    const unsubscribe = listenTransactions({
      userId: user.uid,
      startDate: filters.startDate,
      endDate: filters.endDate,
      category: filters.category,
      onChange: (list) => {
        setTransactions(list);
        setTransactionsReady(true);
      },
      onError: (err) => {
        setError(err.message);
        setTransactionsReady(true);
      },
    });
    setTxPage(1);
    return () => unsubscribe();
  }, [filters, user]);

  useEffect(() => {
    if (!user) {
      setHomeMonthTransactions([]);
      return;
    }
    const start = monthStartIso(currentMonth);
    const end = monthEndIso(currentMonth);
    const unsubscribe = listenTransactions({
      userId: user.uid,
      startDate: start,
      endDate: end,
      onChange: (list) => setHomeMonthTransactions(list),
      onError: (err) => console.error('No pudimos cargar movimientos del mes', err),
    });
    return () => unsubscribe();
  }, [user, currentMonth]);

  useEffect(() => {
    const fetchBudgetData = async () => {
      try {
        if (!user) return;
        const data = await getBudget(user.uid, currentMonth);
        setBudget(data);
      } catch (err) {
        console.error(err);
      }
    };
    fetchBudgetData();
  }, [currentMonth, user]);

  useEffect(() => {
    const loadTemplates = async () => {
      try {
        if (!user) return;
        const data = await fetchTemplates(user.uid);
        setTemplates(data);
      } catch (err) {
        console.error(err);
      }
    };
    loadTemplates();
  }, [user]);

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

  useEffect(() => {
    const loadPreviousMonth = async () => {
      if (!user) return;
      const range = previousMonthRange(currentMonth);
      try {
        const prev = await fetchTransactionsRange({ userId: user.uid, startDate: range.start, endDate: range.end });
        const expense = prev.filter((t) => t.type === 'expense').reduce((acc, t) => acc + t.amount, 0);
        const income = prev.filter((t) => t.type === 'income').reduce((acc, t) => acc + t.amount, 0);
        setPreviousMonth({ expense, income });
      } catch (err) {
        console.error(err);
      }
    };
    loadPreviousMonth();
  }, [currentMonth, user]);

  const monthTransactions = useMemo(() => homeMonthTransactions, [homeMonthTransactions]);
  const paginatedTransactions = useMemo(() => {
    const start = (txPage - 1) * txPageSize;
    return transactions.slice(start, start + txPageSize);
  }, [transactions, txPage]);
  const totalTxPages = Math.max(1, Math.ceil(transactions.length / txPageSize));

  const monthlyExpense = useMemo(
    () => monthTransactions.filter((t) => t.type === 'expense').reduce((acc, t) => acc + t.amount, 0),
    [monthTransactions],
  );
  const monthlyIncome = useMemo(
    () => monthTransactions.filter((t) => t.type === 'income').reduce((acc, t) => acc + t.amount, 0),
    [monthTransactions],
  );
  const availableBalance = useMemo(() => monthlyIncome - monthlyExpense, [monthlyIncome, monthlyExpense]);

  const topExpenses = useMemo(() => {
    const byCat: Record<string, number> = {};
    monthTransactions
      .filter((t) => t.type === 'expense')
      .forEach((tx) => {
        byCat[tx.category] = (byCat[tx.category] || 0) + tx.amount;
      });
    return Object.entries(byCat)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([category, amount]) => ({ category, amount }));
  }, [monthTransactions]);

  const recurringTemplates = useMemo(() => templates.filter((t) => t.recurring), [templates]);
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

  const isResourceExhausted = (err: unknown) => {
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
  };

  const mapAiError = (err: unknown) => {
    const codeRaw = (err as { code?: unknown } | null)?.code;
    const code =
      typeof codeRaw === 'string'
        ? codeRaw
        : typeof codeRaw === 'number'
          ? codeRaw.toString()
          : codeRaw && typeof (codeRaw as { toString?: () => string }).toString === 'function'
            ? (codeRaw as { toString: () => string }).toString()
            : '';
    const totalUsed = iaQuota?.parseUsed ?? 0;
    const limit = iaQuota?.parseLimit ?? 0;
    const quotaText = limit ? ` (${totalUsed}/${limit})` : '';
    if (code.includes('permission-denied') || code.includes('failed-precondition')) {
      return 'Configura tu API key en Configuración o activa tu membresía para usar la IA.';
    }
    if (code.includes('resource-exhausted')) {
      return `Alcanzaste el límite semanal de IA para tu plan${quotaText}.`;
    }
    return 'No pudimos consultar la IA. Inténtalo de nuevo en unos minutos.';
  };

  const formatCurrency = (cents?: number | null) => {
    if (!cents && cents !== 0) return '--';
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(
      cents / 100,
    );
  };

  const formatPesos = (value?: number | null) => {
    if (!value && value !== 0) return '--';
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(
      value,
    );
  };

  const formatUsdApprox = (cents?: number | null) => {
    if (!cents && cents !== 0) return '';
    // Aproximación rápida: 1 USD = 4000 COP; ajusta si quieres un tipo de cambio distinto.
    const usd = (cents / 100) / 4000;
    return `(≈ ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(usd)})`;
  };

  const formatDate = (ts?: number | null) => {
    if (!ts) return null;
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  };

  const categorySpendMap = useMemo(() => {
    const map: Record<string, number> = {};
    monthTransactions.forEach((tx) => {
      map[tx.category] = (map[tx.category] || 0) + tx.amount;
    });
    return map;
  }, [monthTransactions]);

  const dayOfMonth = new Date().getDate();
  const daysElapsed = dayOfMonth;
  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
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
    setFilters({ startDate: monthStartIso(), endDate: todayIso(), category: category || 'all' });
    setActiveTab('transactions');
    trackEvent('smart_card_click', { action: 'movements', category });
  }, []);

  const openQuickAdd = useCallback((mode?: 'income' | 'expense') => {
    setShowQuickAdd(true);
    trackEvent('smart_card_click', { action: 'quick_add', mode });
    if (mode === 'income') {
      setSelectedTemplate(null);
      // Podrías setear un estado para preseleccionar tipo ingreso si el formulario lo soporta
    }
  }, []);

  const openAdvisor = useCallback((context?: Record<string, unknown>) => {
    setActiveTab('advisor');
    trackEvent('smart_card_click', { action: 'advisor', ...context });
  }, []);

  const openPlans = useCallback(() => {
    setActiveTab('settings');
    trackEvent('smart_card_click', { action: 'plans' });
    setTimeout(() => scrollToPlans(), 120);
  }, [scrollToPlans]);

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

  const triggerUpgradeOnce = useCallback(
    (ctx: 'parse_exhausted' | 'analyze_exhausted') => {
      const kind = ctx === 'parse_exhausted' ? 'parse' : 'analyze';
      if (hasShownUpgrade(kind)) return;
      markUpgradeShown(kind);
      openUpgrade(ctx);
    },
    [hasShownUpgrade, markUpgradeShown, openUpgrade],
  );

  const addPeriod = useCallback((date: Date, frequency: Template['frequency']) => {
    const next = new Date(date);
    if (frequency === 'weekly') next.setDate(next.getDate() + 7);
    else if (frequency === 'biweekly') next.setDate(next.getDate() + 14);
    else if (frequency === 'monthly') {
      const day = next.getDate();
      next.setMonth(next.getMonth() + 1);
      // Clamp to end of month if needed
      if (next.getDate() < day) {
        next.setDate(0);
      }
    } else if (frequency === 'yearly') next.setFullYear(next.getFullYear() + 1);
    else next.setDate(next.getDate() + 30);
    return next;
  }, []);

  const calcNextDue = useCallback(
    (tpl: Template, reference: Date) => {
      if (!tpl.recurring) return null;
      const freq = tpl.frequency ?? 'monthly';
      const baseIso = tpl.lastUsedAt ?? tpl.createdAt;
      if (!baseIso) return null;
      let next = addPeriod(new Date(baseIso), freq);
      next.setHours(0, 0, 0, 0);
      // avanzar hasta alcanzar hoy o futuro cercano
      while (next < reference) {
        next = addPeriod(next, freq);
        next.setHours(0, 0, 0, 0);
      }
      return next;
    },
    [addPeriod],
  );

  useEffect(() => {
    const cards: SmartCard[] = [];
    const today = new Date();

    const categoryPercents =
      budget?.perCategory && Object.keys(budget.perCategory).length
        ? Object.entries(budget.perCategory).map(([cat, limit]) => {
            const spent = categorySpendMap[cat] || 0;
            const percent = limit ? (spent / limit) * 100 : 0;
            return { cat, spent, limit, percent };
          })
        : [];

    // Slot 1: alerta presupuesto
    const overCat = categoryPercents
      .filter((c) => c.percent > 100)
      .sort((a, b) => b.percent - a.percent)[0];
    const nearCat = categoryPercents
      .filter((c) => c.percent >= 80 && c.percent <= 100)
      .sort((a, b) => b.percent - a.percent)[0];

    if (overCat) {
      cards.push({
        id: 'budget_over_100',
        slot: 1,
        title: 'Presupuesto excedido',
        body: `Te pasaste ${formatPesos(overCat.spent - overCat.limit)} en ${overCat.cat} este mes.`,
        primaryAction: {
          label: 'Ajustar tope',
          onClick: () => openBudgets(overCat.cat),
        },
        secondaryAction: {
          label: 'Ver movimientos',
          onClick: () => openMovements(overCat.cat),
        },
      });
    } else if (nearCat) {
      cards.push({
        id: 'budget_near_100',
        slot: 1,
        title: 'Presupuesto al límite',
        body: `Vas en ${Math.round(nearCat.percent)}% de tu tope en ${nearCat.cat}. Te quedan ${formatPesos(
          nearCat.limit - nearCat.spent,
        )}.`,
        primaryAction: {
          label: 'Ajustar tope',
          onClick: () => openBudgets(nearCat.cat),
        },
        secondaryAction: {
          label: 'Ver movimientos',
          onClick: () => openMovements(nearCat.cat),
        },
      });
    } else if (!budget?.perCategory || Object.keys(budget.perCategory || {}).length === 0) {
      cards.push({
        id: 'create_budget',
        slot: 1,
        title: 'Crea tu primer presupuesto',
        body: 'Elige 1–3 categorías clave y define un tope para este mes.',
        primaryAction: {
          label: 'Crear presupuesto',
          onClick: () => openBudgets(),
        },
      });
    }

    // Slot 2: optimización presupuesto
    const topWithoutBudget = topExpenses.find((t) => !(budget?.perCategory && budget.perCategory[t.category]));
    if (topWithoutBudget) {
      cards.push({
        id: 'set_cap_top_category',
        slot: 2,
        title: `Fija un tope para ${topWithoutBudget.category}`,
        body: `${topWithoutBudget.category} ya suma ${formatPesos(topWithoutBudget.amount)} este mes.`,
        primaryAction: {
          label: 'Ver presupuesto',
          onClick: () => openBudgets(topWithoutBudget.category),
        },
      });
    } else {
      const surplus = categoryPercents.filter((c) => c.percent < 40).sort((a, b) => a.percent - b.percent)[0];
      const deficit = categoryPercents.filter((c) => c.percent > 100).sort((a, b) => b.percent - a.percent)[0];
      if (surplus && deficit) {
        cards.push({
          id: 'redistribute_budget',
          slot: 2,
          title: 'Redistribuye tu presupuesto',
          body: `Te sobra ${formatPesos(surplus.limit - surplus.spent)} en ${surplus.cat} y falta en ${deficit.cat}.`,
          primaryAction: {
            label: 'Mover tope',
            onClick: () => openBudgets(deficit.cat),
          },
        });
      } else if (surplus && dayOfMonth > 15) {
        cards.push({
          id: 'lower_budget',
          slot: 2,
          title: 'Presupuesto holgado',
          body: `En ${surplus.cat} usas menos del 40% del tope. ¿Bajamos para ahorrar más?`,
          primaryAction: {
            label: 'Ajustar tope',
            onClick: () => openBudgets(surplus.cat),
          },
        });
      }
    }

    // Slot 3: hábitos de registro
    let lastTxDate: Date | null = null;
    if (transactions.length > 0) {
      const latest = transactions.reduce((a, b) => (a.date > b.date ? a : b));
      lastTxDate = latest?.date ? new Date(latest.date) : null;
    }
    const daysSinceLast = lastTxDate ? Math.floor((today.getTime() - lastTxDate.getTime()) / 86_400_000) : Infinity;
    if (daysSinceLast >= 3) {
      cards.push({
        id: 'add_recent',
        slot: 3,
        title: 'Registra tus últimos gastos',
        body: `No registras nada hace ${daysSinceLast} días. Antes de que se te olviden 😉`,
        primaryAction: {
          label: 'Registrar ahora',
          onClick: () => openQuickAdd(),
        },
      });
    } else {
      const monthExpenseCount = monthTransactions.filter((t) => t.type === 'expense').length;
      const monthExpenseTotalValue = monthTransactions
        .filter((t) => t.type === 'expense')
        .reduce((acc, t) => acc + t.amount, 0);
      const avgDailyExpense = daysElapsed ? monthExpenseTotalValue / daysElapsed : 0;
      const bigIncome = monthTransactions.some(
        (t) => t.type === 'income' && t.amount >= Math.max(2 * avgDailyExpense, 300_000),
      );
      if (monthExpenseCount >= 5 && !bigIncome) {
        cards.push({
          id: 'add_income',
          slot: 3,
          title: '¿Ya registraste tu ingreso?',
          body: 'Veo varios gastos este mes pero ningún ingreso grande. Añádelo para ver el balance real.',
          primaryAction: {
            label: 'Registrar ingreso',
            onClick: () => openQuickAdd('income'),
          },
        });
      } else if (recurringTemplates[0]) {
        const upcoming = recurringTemplates
          .map((tpl) => {
            const nextDue = calcNextDue(tpl, todayStart);
            if (!nextDue) return null;
            const daysUntil = Math.round((nextDue.getTime() - todayStart.getTime()) / 86_400_000);
            return { tpl, nextDue, daysUntil };
          })
          .filter(Boolean)
          .sort((a, b) => (a as { daysUntil: number }).daysUntil - (b as { daysUntil: number }).daysUntil) as {
          tpl: Template;
          nextDue: Date;
          daysUntil: number;
        }[];
        const nextTemplate = upcoming.find((item) => item.daysUntil <= 3 && item.daysUntil >= -1) || upcoming[0];
        if (nextTemplate) {
          cards.push({
            id: 'remind_recurring',
            slot: 3,
            title: 'Ahorra tiempo con plantillas',
            body:
              nextTemplate.daysUntil === 0
                ? `Hoy suele cobrarse tu plantilla ${nextTemplate.tpl.name}. ¿Ya la registraste?`
                : nextTemplate.daysUntil > 0
                  ? `Pronto toca ${nextTemplate.tpl.name} (${nextTemplate.daysUntil} días).`
                  : `Se cobró hace ${Math.abs(nextTemplate.daysUntil)} días la plantilla ${nextTemplate.tpl.name}.`,
            primaryAction: {
              label: 'Registrar ahora',
              onClick: () => handleUseTemplate(nextTemplate.tpl),
            },
          });
        }
      }
    }

    // Slot 4: storytelling / IA / upsell
    const analyzeLimitReached =
      iaQuota?.analyzeLimit && iaQuota.analyzeLimit > 0 && iaQuota.analyzeUsed >= iaQuota.analyzeLimit;
    if (analyzeLimitReached && (iaQuota?.analyzeUsed ?? 0) > 0) {
      cards.push({
        id: 'ia_limit',
        slot: 4,
        title: 'Te quedaste sin análisis IA',
        body: `Ya usaste tus ${iaQuota?.analyzeLimit ?? 0} análisis de IA de esta semana. Desbloquea más en el plan PRO.`,
        primaryAction: {
          label: 'Ver planes',
          onClick: openPlans,
        },
      });
    } else if (previousMonth) {
      const diff = monthlyExpense - previousMonth.expense;
      const absDiff = Math.abs(diff);
      const diffText = diff === 0 ? 'igual que el mes pasado.' : diff > 0 ? `${formatPesos(absDiff)} más que el mes pasado.` : `${formatPesos(absDiff)} menos que el mes pasado.`;
      cards.push({
        id: 'month_summary',
        slot: 4,
        title: 'Cómo vas este mes',
        body: `Llevas ${formatPesos(monthlyExpense)} en gastos, ${diffText}`,
        primaryAction: {
          label: 'Ver análisis',
          onClick: () => openAdvisor({ context: 'month_summary' }),
        },
      });
    } else if (topExpenses[0]) {
      cards.push({
        id: 'top_category_story',
        slot: 4,
        title: 'Categoría que marca el mes',
        body: `${topExpenses[0].category} es tu gasto principal: ${formatPesos(topExpenses[0].amount)} este mes.`,
        primaryAction: {
          label: 'Pedir consejo',
          onClick: () => openAdvisor({ category: topExpenses[0].category }),
        },
      });
    }

    // Ordenar por slot y mantener máximo uno por slot
    const bySlot: Record<number, SmartCard | undefined> = {};
    cards.forEach((c) => {
      if (!bySlot[c.slot]) bySlot[c.slot] = c;
    });
    const finalCards = [1, 2, 3, 4].map((slot) => bySlot[slot]).filter(Boolean) as SmartCard[];
    setSmartCards(finalCards);
  }, [
    iaQuota?.analyzeLimit,
    iaQuota?.analyzeUsed,
    budget?.perCategory,
    categorySpendMap,
    dayOfMonth,
    monthTransactions,
    monthlyExpense,
    previousMonth,
    recurringTemplates,
    topExpenses,
    transactions,
    daysElapsed,
    openAdvisor,
    openBudgets,
    openMovements,
    openPlans,
    openQuickAdd,
    calcNextDue,
    todayStart,
  ]);

  useEffect(() => {
    setSmartCardIndex(0);
  }, [smartCards.length]);
  const handlePrevInsight = () => {
    if (smartCards.length === 0) return;
    setSmartCardIndex((i) => (i - 1 + smartCards.length) % smartCards.length);
  };
  const handleNextInsight = () => {
    if (smartCards.length === 0) return;
    setSmartCardIndex((i) => (i + 1) % smartCards.length);
  };
  const touchStartX = useRef<number | null>(null);
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) < 30) return;
    if (delta < 0) handleNextInsight();
    else handlePrevInsight();
  };
  const handleFiltersChange = useCallback(
    (next: { startDate: string; endDate: string; category: string }) => {
      const { startDate, endDate, category } = next;
      // Aseguramos orden para evitar consultas vacías si el usuario invierte las fechas
      if (startDate && endDate && startDate > endDate) {
        setFilters({ startDate: endDate, endDate: startDate, category });
      } else {
        setFilters(next);
      }
    },
    [],
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

  const pushFeedItem = (item: Omit<ChatItem, 'id' | 'ts'> & { id?: string; ts?: number }) => {
    const id = item.id ?? `chat-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const ts = item.ts ?? Date.now();
    setChatFeed((prev) => {
      const next = [...prev, { ...item, id, ts }];
      return next.length > 50 ? next.slice(next.length - 50) : next;
    });
  };

  const handleSaveTransaction = async (payload: TransactionInput) => {
    if (!user) return;
    await createTransaction(payload, user.uid);
  };

  const handleUpdateTransaction = async (id: string, payload: TransactionInput) => {
    if (!user) return;
    await updateTransaction(id, payload, user.uid);
  };

  const handleDeleteTransaction = async (id: string) => {
    await deleteTransaction(id);
  };

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
      throw new Error(mapAiError(err));
    }
  };

  const handleToneChange = async (mode: AdvisorMode) => {
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
  };

  const handleAdvisorAction = async (action: string) => {
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
        text: mapAiError(err),
        tone: advisorMode,
        kind: 'ia',
      });
      if (isResourceExhausted(err)) {
        triggerUpgradeOnce('analyze_exhausted');
      }
    } finally {
      setAdvisorLoading(false);
    }
  };

  const handleSaveBudget = async (total: number) => {
    setBudgetSaving(true);
    try {
      if (!user) return;
      await saveBudget(user.uid, currentMonth, { total });
      const updated = await getBudget(user.uid, currentMonth);
      setBudget(updated);
    } catch (err) {
      console.error(err);
    } finally {
      setBudgetSaving(false);
    }
  };

  const handleSaveCategoryBudgets = async (perCategory: Record<string, number>) => {
    setBudgetSaving(true);
    try {
      if (!user) return;
      await saveBudget(user.uid, currentMonth, { total: budget?.total || 0, perCategory });
      const updated = await getBudget(user.uid, currentMonth);
      setBudget(updated);
    } catch (err) {
      console.error(err);
    } finally {
      setBudgetSaving(false);
    }
  };

  const handleSaveTemplate = async (name: string, payload: TransactionInput) => {
    if (!user) return;
    await saveTemplate(name, payload, user.uid);
    const data = await fetchTemplates(user.uid);
    setTemplates(data);
  };

  const handleCheckout = async (planId: 'plan_byok' | 'plan_pro') => {
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
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!user) return;
    await deleteTemplate(id);
    const data = await fetchTemplates(user.uid);
    setTemplates(data);
  };

  const handleUpdateTemplate = async (
    id: string,
    payload: TransactionInput & { name?: string; recurring?: boolean; frequency?: Template['frequency'] },
  ) => {
    if (!user) return;
    await updateTemplate(id, payload, user.uid);
    const data = await fetchTemplates(user.uid);
    setTemplates(data);
  };

  const handleUseTemplate = (tpl: Template) => {
    setSelectedTemplate(tpl);
    setShowQuickAdd(true);
  };

  const handleSaveApiKey = async () => {
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
  };

  const handleClearApiKey = async () => {
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
  };

  const handlePreferredKeyChange = async (preferred: KeyPreference) => {
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
  };

  const handleAdminChangeRole = async (targetUid: string, nextRole: UserRole) => {
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
  };

  const handleAdminSaveUser = async (targetUid: string) => {
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
  };

  const handleAdminReload = async () => {
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
  };

  const handleCopyUid = async () => {
    if (!user?.uid) return;
    try {
      await navigator.clipboard.writeText(user.uid);
      setSettingsMessage('UID copiado al portapapeles.');
    } catch (err) {
      console.error(err);
      setSettingsMessage('No se pudo copiar el UID.');
    }
  };

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
            onShowLimitsHelp={() => setShowLimitsHelp(true)}
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
        onClearSelectedTemplate={() => setSelectedTemplate(null)}
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
