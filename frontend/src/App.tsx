import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BottomNav, type TabKey } from './components/BottomNav';
import { BudgetCard } from './components/BudgetCard';
import { CategoryBudgets } from './components/CategoryBudgets';
import { QuickAddSheet } from './components/QuickAddSheet';
import { TopExpensesChart } from './components/TopExpensesChart';
import { TransactionEditModal } from './components/TransactionEditModal';
import { TransactionFilters } from './components/TransactionFilters';
import { ResponsiveSelect } from './components/ResponsiveSelect';
import { IaQuotaProgress } from './components/IaQuotaProgress';
import { FeatureLockCard } from './components/FeatureLockCard';
import { UpgradeModal } from './components/UpgradeModal';
import { LimitsHelpModal } from './components/LimitsHelpModal';
import { RobotAvatar } from './components/RobotAvatar';
import { useAuth } from './context/AuthContext';
import { LoginHero } from './components/LoginHero';
import { useThemeMode } from './context/ThemeContext';
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

  // Mes de referencia para la vista "Inicio" y presupuestos (no depende del filtro de la vista Movimientos)
  const currentMonth = todayIso().slice(0, 7);

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
      const range = previousMonthRange();
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

  const monthTransactions = useMemo(
    () => transactions.filter((t) => t.date?.startsWith(currentMonth)),
    [transactions, currentMonth],
  );
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
      return 'Configura tu API key en Configuracion o activa tu membresia para usar la IA.';
    }
    if (code.includes('resource-exhausted')) {
      return `Alcanzaste el limite semanal de IA para tu plan${quotaText}.`;
    }
    return 'No pudimos consultar la IA. Intentalo de nuevo en unos minutos.';
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
  const handlePrevInsight = () => setSmartCardIndex((i) => Math.max(0, i - 1));
  const handleNextInsight = () => setSmartCardIndex((i) => Math.min(smartCards.length - 1, i + 1));
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
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 text-slate-100">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(16,185,129,0.18),transparent_35%),radial-gradient(circle_at_80%_25%,rgba(59,130,246,0.16),transparent_35%),radial-gradient(circle_at_50%_80%,rgba(14,165,233,0.12),transparent_40%)]" />
        <div className="relative flex flex-col items-center gap-4 rounded-2xl border border-white/10 bg-slate-900/80 px-8 py-6 shadow-2xl backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full border-4 border-emerald-400/30 border-t-transparent animate-spin" />
            <div className="flex flex-col">
              <p className="text-base font-semibold text-white">Preparando tu espacio</p>
              <p className="text-sm text-slate-300">{loaderMessage}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-emerald-200">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
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
              onClick={() => setShowQuickAdd(true)}
            >
              + Registro rápido
            </button>
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
          <section className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <CardStat title="Gasto mensual" value={monthlyExpense} tone="danger" subtitle="Objetivo: no pasar presupuesto." />
              <CardStat title="Ingreso mensual" value={monthlyIncome} tone="success" subtitle="Suma ingresos fijos." />
              <CardStat
                title="Saldo disponible"
                value={availableBalance}
                tone={availableBalance >= 0 ? 'success' : 'danger'}
                subtitle="Ingreso - Gasto del mes."
              />
            </div>

            <div className="card p-0">
              <BudgetCard
                month={currentMonth}
                totalExpense={monthlyExpense}
                budget={budget}
                onSave={handleSaveBudget}
                loading={budgetSaving}
              />
            </div>

            <div className="card p-0" ref={categoryBudgetsRef}>
              <CategoryBudgets perCategory={budget?.perCategory} onSave={handleSaveCategoryBudgets} />
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <TopExpensesChart data={topExpenses} />
              <div className="card">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-white">Tarjetas inteligentes</h2>
                  <span className="text-xs text-slate-400">Detectadas con datos reales</span>
                </div>
                <div className="space-y-3">
                  {smartCards.length === 0 && <p className="text-sm text-slate-300">Sin alertas por ahora.</p>}
                  {smartCards.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-slate-300">
                        <span>{smartCards.length > 1 ? 'Desliza para ver más' : 'Sugerencia destacada'}</span>
                        {smartCards.length > 1 && (
                          <div className="flex gap-2">
                            <button
                              onClick={handlePrevInsight}
                              className="h-7 w-7 rounded-full border border-white/15 bg-white/10 text-white hover:border-primary"
                              aria-label="Anterior"
                            >
                              {'<'}
                            </button>
                            <button
                              onClick={handleNextInsight}
                              className="h-7 w-7 rounded-full border border-white/15 bg-white/10 text-white hover:border-primary"
                              aria-label="Siguiente"
                            >
                              {'>'}
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="relative overflow-hidden rounded-xl">
                        <div
                          className="flex transition-transform duration-300 ease-out"
                          style={{ transform: `translateX(-${smartCardIndex * 100}%)` }}
                          onTouchStart={handleTouchStart}
                          onTouchEnd={handleTouchEnd}
                          >
                            {smartCards.map((item) => (
                              <div key={item.id} className="w-full shrink-0 px-2" style={{ maxWidth: '100%' }}>
                                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3">
                                  <p className="text-sm font-semibold text-white">{item.title}</p>
                                  <p className="text-sm text-slate-200">{item.body}</p>
                                  <div className="mt-2 flex gap-2">
                                    <button
                                      className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white"
                                      onClick={item.primaryAction.onClick}
                                    >
                                    {item.primaryAction.label}
                                  </button>
                                  {item.secondaryAction && (
                                    <button
                                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white"
                                      onClick={item.secondaryAction.onClick}
                                    >
                                      {item.secondaryAction.label}
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        {smartCards.length > 1 && (
                          <div className="mt-2 flex justify-center gap-1">
                            {smartCards.map((_, idx) => (
                              <button
                                key={idx}
                                onClick={() => setSmartCardIndex(idx)}
                                className={`h-2 w-2 rounded-full ${idx === smartCardIndex ? 'bg-white' : 'bg-white/30'}`}
                                aria-label={`Ir a tarjeta ${idx + 1}`}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="card">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-[var(--text)]">Recordatorios recurrentes</h2>
                <span className="text-xs text-[var(--text-muted)]">Plantillas marcadas como recurrentes</span>
              </div>
              {recurringTemplates.length === 0 && (
                <p className="text-sm text-[var(--text-muted)]">Aún no tienes plantillas recurrentes.</p>
              )}
              <div className="space-y-3">
                {recurringTemplates.map((tpl) => (
                  <div
                    key={tpl.id}
                    className="flex flex-col gap-3 rounded-xl border border-[var(--card-border)] bg-[var(--card)]/60 px-3 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-[var(--text)]">{tpl.name}</p>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
                        <span className="rounded-full bg-[var(--input-bg)] px-2 py-1 capitalize">
                          {tpl.frequency ?? 'mensual'}
                        </span>
                        {tpl.category && <span className="rounded-full bg-[var(--input-bg)] px-2 py-1">Cat: {tpl.category}</span>}
                        {tpl.amount ? <span className="rounded-full bg-[var(--input-bg)] px-2 py-1">${tpl.amount.toLocaleString()}</span> : null}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
                        onClick={() => handleUseTemplate(tpl)}
                      >
                        Registrar
                      </button>
                      <button
                        className="rounded-lg border border-[var(--card-border)] bg-[var(--input-bg)] px-3 py-2 text-xs font-semibold text-[var(--text)] hover:border-primary"
                        onClick={() => handleUseTemplate(tpl)}
                      >
                        Editar
                      </button>
                      <button
                        className="text-xs font-semibold text-[var(--error-text)] hover:underline"
                        onClick={() => handleDeleteTemplate(tpl.id)}
                      >
                        Borrar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {activeTab === 'transactions' && (
          <section className="space-y-4 pb-5">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-white">Movimientos</h2>
              <p className="text-xs text-slate-400">Filtra por fecha o categoría.</p>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <CardMini title="Gasto (filtro)" value={transactions.filter((t) => t.type === 'expense').reduce((a, t) => a + t.amount, 0)} />
              <CardMini title="Ingreso (filtro)" value={transactions.filter((t) => t.type === 'income').reduce((a, t) => a + t.amount, 0)} tone="success" />
              <CardMini
                title="Saldo (filtro)"
                value={transactions.reduce((a, t) => a + (t.type === 'income' ? t.amount : -t.amount), 0)}
                tone={
                  transactions.reduce((a, t) => a + (t.type === 'income' ? t.amount : -t.amount), 0) >= 0
                    ? 'success'
                    : 'danger'
                }
              />
            </div>

            <TransactionFilters
              startDate={filters.startDate}
              endDate={filters.endDate}
              category={filters.category}
              onChange={(next) => setFilters(next)}
            />

            {error && <p className="text-sm text-red-400">{error}</p>}

            <div className="space-y-2">
              {transactions.length === 0 && (
                <p className="rounded-xl border border-dashed border-white/10 bg-white/5 px-3 py-3 text-sm text-slate-200">
                  Aún no hay movimientos en este rango. Agrega el primero.
                </p>
              )}
              {paginatedTransactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-3 shadow-sm"
                >
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {tx.note || tx.category} • {tx.category}
                    </p>
                    <p className="text-xs text-slate-400">
                      {tx.date} • {tx.paymentMethod}
                    </p>
                    {budget?.perCategory?.[tx.category] && (
                      <p className="text-[11px] text-slate-300">
                        Presupuesto cat: $
                        {budget.perCategory[tx.category].toLocaleString()} • Gastado: $
                        {(categorySpendMap[tx.category] || 0).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p
                      className={`text-base font-bold ${
                        tx.type === 'expense' ? 'text-red-300' : 'text-emerald-300'
                      }`}
                    >
                      {tx.type === 'expense' ? '-' : '+'}${tx.amount.toLocaleString()}
                    </p>
                    <div className="mt-1 flex items-center justify-end gap-2 text-[11px]">
                      <span
                        className={`rounded-full px-2 py-1 ${
                          tx.type === 'income'
                            ? 'bg-emerald-500/10 text-emerald-200'
                            : 'bg-red-500/10 text-red-200'
                        }`}
                      >
                        {tx.type === 'income' ? 'Ingreso' : 'Gasto'}
                      </span>
                      {budget?.perCategory?.[tx.category] && (
                        <span
                          className={`rounded-full px-2 py-1 ${
                            categorySpendMap[tx.category] >= budget.perCategory[tx.category]
                              ? 'bg-red-500/10 text-red-200'
                              : categorySpendMap[tx.category] / budget.perCategory[tx.category] >= 0.8
                                ? 'bg-amber-500/10 text-amber-200'
                                : 'bg-emerald-500/10 text-emerald-200'
                          }`}
                        >
                          Cat{' '}
                          {Math.round(
                            Math.min(
                              (categorySpendMap[tx.category] / budget.perCategory[tx.category]) * 100,
                              150,
                            ),
                          )}
                          %
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex justify-end gap-2 text-[11px]">
                      <button className="text-primary" onClick={() => setSelectedTx(tx)}>
                        Editar
                      </button>
                      <button className="text-red-300" onClick={() => handleDeleteTransaction(tx.id)}>
                        Borrar
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {transactions.length > txPageSize && (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200">
                  <button
                    className="rounded-lg border border-white/20 bg-white/5 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                    onClick={() => setTxPage((p) => Math.max(1, p - 1))}
                    disabled={txPage === 1}
                  >
                    Anterior
                  </button>
                  <span className="text-xs text-slate-300">
                    Página {txPage} de {totalTxPages}
                  </span>
                  <button
                    className="rounded-lg border border-white/20 bg-white/5 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                    onClick={() => setTxPage((p) => Math.min(totalTxPages, p + 1))}
                    disabled={txPage >= totalTxPages}
                  >
                    Siguiente
                  </button>
                </div>
              )}
            </div>
          </section>
        )}

        {activeTab === 'advisor' && (
          <section className="space-y-4">
            <div className="card space-y-3">
              <div className="flex items-start gap-3">
                <RobotAvatar className="h-16 w-16 md:h-20 md:w-20" />
                <div className="flex flex-1 flex-col gap-2">
                  <div className="space-y-1">
                    <p className="text-xs uppercase text-slate-400">Asesor IA</p>
                    <h2 className="text-lg font-semibold text-white">Finanzas chat</h2>
                    <p className="text-xs text-slate-300">Elige el tono y lanza una acción; la respuesta aparece en el feed.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(['amable', 'reganon'] as AdvisorMode[]).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => handleToneChange(mode)}
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          advisorMode === mode
                            ? 'bg-primary text-white'
                            : 'border border-white/10 bg-white/5 text-white'
                        }`}
                      >
                        {mode === 'amable' ? 'Amable' : 'Regañón'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {advisorQuickActions.map((item) => {
                const locked = item.locked || (item.requiresAnalyze && analyzeExhausted);
                const lockedByQuota = item.requiresAnalyze && analyzeExhausted;
                  const badge = item.badge;
                  return (
                    <button
                      key={item.action}
                      onClick={() =>
                        locked
                          ? openUpgrade(lockedByQuota ? 'analyze_exhausted' : 'feature_locked')
                          : handleAdvisorAction(item.action)
                      }
                      className={`flex h-full flex-col rounded-xl border px-3 py-3 text-left transition ${
                        locked
                          ? 'border-dashed border-white/20 bg-white/5 opacity-80'
                          : 'border-white/10 bg-white/5 hover:border-primary'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-white">{item.label}</p>
                        {badge && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-200">
                            {locked && (
                              <span aria-hidden="true" className="text-[11px] leading-none">
                                🔒
                              </span>
                            )}
                            <span>{badge}</span>
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-300">{item.description}</p>
                      {locked && (
                        <p className="text-[11px] font-medium text-primary">
                          {lockedByQuota
                            ? 'Límite semanal alcanzado. Se renueva el lunes.'
                            : 'Toca para ver cómo desbloquearlo'}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>

              {featureLocks.length > 0 && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {featureLocks.map((lock) => (
                    <FeatureLockCard
                      key={lock.id}
                      title={lock.title}
                      description={lock.description}
                      badgeLabel={lock.badge}
                      onUpgradeClick={() => openUpgrade('feature_locked')}
                    />
                  ))}
                </div>
              )}

              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="mb-2 flex items-center justify-between text-xs text-slate-300">
                  <span>Feed IA</span>
                  <span>Tono: {advisorMode === 'amable' ? 'Amable' : 'Regañón'}</span>
                </div>
                <div className="flex flex-col gap-3">
                  {chatFeed.length === 0 && (
                    <div className="rounded-lg border border-dashed border-white/10 bg-white/5 px-3 py-3 text-sm text-slate-200">
                      Aún no hay mensajes. Lanza una acción arriba para ver el estilo chat.
                    </div>
                  )}
                  {chatFeed.map((item) => (
                    <div
                      key={item.id}
                      className={`flex ${item.from === 'ia' ? 'justify-start' : 'justify-end'}`}
                    >
                      <div
                        className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                          item.from === 'ia' ? 'bg-white/10 text-white' : 'bg-primary text-white'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wide opacity-80">
                          <span>{item.from === 'ia' ? 'IA' : 'Tú'}</span>
                          <span>
                            {new Date(item.ts).toLocaleTimeString('es-CO', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                        <p className="whitespace-pre-line">{item.text}</p>
                        {item.chartTop && item.chartTop.length > 0 && (
                          <div className="mt-3 space-y-2">
                            {item.chartTop.map((ct) => {
                              const max = item.chartTop?.[0]?.amount || 1;
                              const pct = Math.round((ct.amount / max) * 100);
                              return (
                                <div key={ct.category} className="space-y-1">
                                  <div className="flex items-center justify-between text-[11px] text-slate-200">
                                    <span>{ct.category}</span>
                                    <span className="font-semibold">{formatPesos(ct.amount)}</span>
                                  </div>
                                  <div className="h-2 rounded-full bg-white/10">
                                    <div
                                      className="h-full rounded-full bg-primary"
                                      style={{ width: `${pct}%`, minWidth: '4%' }}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {item.tone && item.from === 'ia' && (
                          <p className="mt-1 text-[10px] opacity-80">
                            Tono: {item.tone === 'amable' ? 'Amable' : 'Regañón'}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                  {advisorLoading && (
                    <div className="flex items-center gap-2 text-xs text-slate-200">
                      <span className="font-semibold text-white">IA escribiendo</span>
                      <span className="flex items-center gap-1">
                        <span className="h-2 w-2 animate-bounce rounded-full bg-white" />
                        <span
                          className="h-2 w-2 animate-bounce rounded-full bg-white"
                          style={{ animationDelay: '0.15s' }}
                        />
                        <span
                          className="h-2 w-2 animate-bounce rounded-full bg-white"
                          style={{ animationDelay: '0.3s' }}
                        />
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {activeTab === 'settings' && (
          <section className="space-y-4">
            <div className="card flex flex-col gap-3">
              <div className="space-y-1">
                <p className="text-xs uppercase text-slate-400">Cuenta</p>
                <h2 className="text-lg font-semibold text-white">ID de usuario</h2>
                <p className="text-xs text-slate-300">Útil para soporte o auditoría.</p>
              </div>
              <div className="flex w-full items-center gap-2">
                <div className="max-w-full grow overflow-x-auto rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-mono text-white">
                  {user?.uid}
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
                  <p className="text-xs text-slate-300">
                    BYOK se guarda en backend (Secret Manager). El cliente nunca ve la clave.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white">
                    Rol: {roleLabel}
                  </span>
                  <span
                    className={`rounded-full border px-3 py-1 ${
                      userProfile?.subscription?.status === 'active'
                        ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200'
                        : 'border-amber-400/40 bg-amber-500/10 text-amber-200'
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
                      <p className="text-xs text-slate-300">
                        Se renueva cada semana (lunes). Úsalo para registrar por voz y pedir consejos.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowLimitsHelp(true)}
                      className="text-[11px] font-semibold text-primary underline"
                    >
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

              <div
                ref={plansRef}
                id="plans"
                className="space-y-3 rounded-xl border border-indigo-400/30 bg-indigo-500/5 p-4"
              >
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
                      <div
                        key={plan.id}
                        className="rounded-xl border border-white/10 bg-white/5 p-4 shadow-sm flex flex-col gap-2"
                      >
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
                          Periodo: {months} {months === 1 ? 'mes' : 'meses'} (
                          {Math.round((periodInfo?.discount ?? 0) * 100)}% desc.)
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
                          <th className="px-3 py-2">Suscripción</th>
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
                                      prev.map((item) =>
                                        item.uid === u.uid ? { ...item, subscriptionStatus: val } : item,
                                      ),
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
                                        item.uid === u.uid ? { ...item, subscriptionSource: val as AdminSubscriptionSource } : item,
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

function CardStat({
  title,
  value,
  subtitle,
  tone = 'neutral',
}: {
  title: string;
  value: number;
  subtitle?: string;
  tone?: 'neutral' | 'success' | 'danger';
}) {
  const color =
    tone === 'success' ? 'text-emerald-300' : tone === 'danger' ? 'text-red-300' : 'text-white';
  return (
    <div className="card">
      <p className="text-xs uppercase text-[var(--muted)]">{title}</p>
      <p className={`text-2xl font-bold ${color}`}>${value.toLocaleString()}</p>
      {subtitle && <p className="text-sm text-[var(--muted)]">{subtitle}</p>}
    </div>
  );
}

function CardMini({
  title,
  value,
  tone = 'neutral',
}: {
  title: string;
  value: number;
  tone?: 'neutral' | 'success' | 'danger';
}) {
  const color =
    tone === 'success' ? 'text-emerald-300' : tone === 'danger' ? 'text-red-300' : 'text-white';
  return (
    <div className="card">
      <p className="text-xs uppercase text-[var(--muted)]">{title}</p>
      <p className={`text-lg font-bold ${color}`}>${value.toLocaleString()}</p>
    </div>
  );
}

const todayIso = () => new Date().toISOString().slice(0, 10);
const monthStartIso = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
};
const previousMonthRange = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 0);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
};

export default App;


















