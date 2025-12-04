import { useEffect, useMemo, useState } from 'react';
import { BottomNav, type TabKey } from './components/BottomNav';
import { BudgetCard } from './components/BudgetCard';
import { CategoryBudgets } from './components/CategoryBudgets';
import { QuickAddSheet } from './components/QuickAddSheet';
import { TopExpensesChart } from './components/TopExpensesChart';
import { TransactionEditModal } from './components/TransactionEditModal';
import { TransactionFilters } from './components/TransactionFilters';
import { useAuth } from './context/AuthContext';
import { LoginHero } from './components/LoginHero';
import { useThemeMode } from './context/ThemeContext';
import { callAnalyzeSummary, callParseTransactionPhrase } from './services/functions';
import { getBudget, saveBudget } from './services/budgets';
import {
  adminSetUserRole,
  clearUserOpenAIKey,
  fetchUserProfile,
  fetchUsersList,
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

function App() {
  const { user, loading, logout } = useAuth();
  const { theme, toggleTheme } = useThemeMode();
  const [activeTab, setActiveTab] = useState<TabKey>('home');
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [advisorMode, setAdvisorMode] = useState<AdvisorMode>('amable');
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filters, setFilters] = useState({ startDate: monthStartIso(), endDate: todayIso(), category: 'all' });
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [budgetSaving, setBudgetSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
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

  // Mes de referencia para la vista "Inicio" y presupuestos (no depende del filtro de la vista Movimientos)
  const currentMonth = todayIso().slice(0, 7);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = listenTransactions({
      userId: user.uid,
      startDate: filters.startDate,
      endDate: filters.endDate,
      category: filters.category,
      onChange: setTransactions,
      onError: (err) => setError(err.message),
    });
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
        return;
      }
      try {
        setProfileLoading(true);
        setSettingsMessage(null);
        // Reservamos entrada y creamos perfil respetando límite de capacidad
        const profile = (await registerUserEntry()) || (await fetchUserProfile());
        setUserProfile(profile);
        try {
          const quota = await fetchUsageQuota();
          setAiQuota(quota);
        } catch (err) {
          console.error('No pudimos obtener cuota IA', err);
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
          const list = await fetchUsersList();
          setAdminUsers(
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
            })),
          );
          if (adminSearch) {
            setAdminSearch('');
          }
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
  }, [user]);

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
  const canUseManaged =
    !!userProfile && ['paid_managed', 'gifted_managed', 'admin'].includes(userProfile.role);
  const managedActive =
    !!userProfile &&
    (userProfile.role === 'admin' ||
      userProfile.role === 'gifted_managed' ||
      (userProfile.role === 'paid_managed' && userProfile.subscription?.status === 'active'));

  const mapAiError = (err: unknown) => {
    const code = (err as any)?.code?.toString() ?? '';
    const totalUsed = aiQuota?.parse.used ?? 0;
    const limit = aiQuota?.parse.limit ?? 0;
    const quotaText = limit ? ` (${totalUsed}/${limit})` : '';
    if (code.includes('permission-denied') || code.includes('failed-precondition')) {
      return 'Configura tu API key en Configuración o activa tu membresía para usar la IA.';
    }
    if (code.includes('resource-exhausted')) {
      return `Alcanzaste el límite diario de IA para tu plan${quotaText}.`;
    }
    return 'No pudimos consultar la IA. Inténtalo de nuevo en unos minutos.';
  };

  const formatCurrency = (cents?: number | null) => {
    if (!cents && cents !== 0) return '—';
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(
      cents / 100,
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

  const insights = useMemo(() => {
    const cards = [];
    if (topExpenses[0]) {
      cards.push({
        title: 'Categoría top',
        detail: `Estás gastando más en ${topExpenses[0].category} ($${topExpenses[0].amount.toLocaleString()}).`,
        action: 'Revisa límites semanales',
      });
    }
    if (budget?.total) {
      const progress = monthlyExpense / budget.total;
      if (progress >= 1) {
        cards.push({
          title: 'Presupuesto superado',
          detail: 'Alcanzaste el 100% del presupuesto mensual.',
          action: 'Congela gastos no esenciales',
        });
      } else if (progress >= 0.8) {
        cards.push({
          title: 'Alerta 80%',
          detail: 'Vas por encima del 80% del presupuesto.',
          action: 'Define un tope semanal menor',
        });
      }
    }
    return cards;
  }, [topExpenses, budget?.total, monthlyExpense]);

  const categorySpendMap = useMemo(() => {
    const map: Record<string, number> = {};
    monthTransactions.forEach((tx) => {
      map[tx.category] = (map[tx.category] || 0) + tx.amount;
    });
    return map;
  }, [monthTransactions]);

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
      const resp = await callParseTransactionPhrase({ text });
      const data = resp.data as { parsed: ParsedTransactionSuggestion };
      const quota = await fetchUsageQuota();
      if (quota) setAiQuota(quota);
      return data.parsed;
    } catch (err) {
      throw new Error(mapAiError(err));
    }
  };

  const handleAdvisorAction = async (action: string) => {
    try {
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
      setAiResponse(data?.message ?? 'Sin respuesta de IA.');
      const quota = await fetchUsageQuota();
      if (quota) setAiQuota(quota);
    } catch (err) {
      console.error(err);
      setAiResponse(mapAiError(err));
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
      const list = await fetchUsersList();
      setAdminUsers(
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
        })),
      );
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
      const list = await fetchUsersList();
      setAdminUsers(
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
        })),
      );
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
      const list = await fetchUsersList();
      setAdminUsers(
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
        })),
      );
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

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 text-slate-200">
        Cargando sesión...
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

            <div className="card p-0">
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
                  {insights.length === 0 && <p className="text-sm text-slate-300">Sin alertas por ahora.</p>}
                  {insights.map((item) => (
                    <div key={item.title} className="rounded-xl border border-white/10 bg-white/5 px-3 py-3">
                      <p className="text-sm font-semibold text-white">{item.title}</p>
                      <p className="text-sm text-slate-200">{item.detail}</p>
                      <div className="mt-2 flex gap-2">
                        <button className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white">
                          {item.action}
                        </button>
                        <button
                          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white"
                          onClick={() => setShowQuickAdd(true)}
                        >
                          Registrar ahora
                        </button>
                      </div>
                    </div>
                  ))}
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
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Movimientos</h2>
                <p className="text-xs text-slate-400">Filtra por fecha o categoría.</p>
              </div>
              <button
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white shadow-sm"
                onClick={() => setShowQuickAdd(true)}
              >
                + Añadir
              </button>
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
              {transactions.map((tx) => (
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
            </div>
          </section>
        )}

        {activeTab === 'advisor' && (
          <section className="space-y-4">
            <div className="card">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs uppercase text-slate-400">Asesor IA</p>
                  <h2 className="text-lg font-semibold text-white">Recomendaciones rápidas</h2>
                </div>
                <div className="flex gap-2">
                  {(['amable', 'directo', 'exigente', 'regañon'] as AdvisorMode[]).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setAdvisorMode(mode)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        advisorMode === mode
                          ? 'bg-primary text-white'
                          : 'border border-white/10 bg-white/5 text-white'
                      }`}
                    >
                      {mode === 'amable'
                        ? 'Amable'
                        : mode === 'directo'
                          ? 'Directo'
                          : mode === 'exigente'
                            ? 'Exigente'
                            : 'Regañón'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {['Resumen de hoy', 'Resumen de la semana', 'En que se va la plata', 'Que recortar sin sufrir'].map(
                  (label) => (
                    <button
                      key={label}
                      onClick={() => handleAdvisorAction(label)}
                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-left text-sm font-semibold text-white hover:border-primary"
                    >
                      {label}
                    </button>
                  ),
                )}
              </div>

              <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-slate-100">
                {aiResponse ? (
                  <div className="space-y-2">
                    <p className="font-semibold text-white">Respuesta del asesor</p>
                    <p>{aiResponse}</p>
                    <p className="text-xs text-slate-400">
                      Estas recomendaciones son solo una guía y no reemplazan asesoría financiera profesional.
                    </p>
                  </div>
                ) : (
                  <p className="text-slate-200">Pide un resumen rápido para ver sugerencias.</p>
                )}
              </div>
            </div>
          </section>
        )}

        {activeTab === 'settings' && (
          <section className="space-y-4">
            <div className="card flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase text-slate-400">Cuenta</p>
                <h2 className="text-lg font-semibold text-white">ID de usuario</h2>
                <p className="text-xs text-slate-300">Útil para soporte o auditoría.</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-mono text-white">
                  {user?.uid}
                </div>
                <button
                  onClick={handleCopyUid}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-semibold text-white hover:border-primary"
                >
                  Copiar
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
                  {aiQuota && (
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white">
                      IA hoy: {aiQuota.parse.used}/{aiQuota.parse.limit}
                    </span>
                  )}
                  {userProfile?.subscription?.expiresAt ? (
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white">
                      Expira: {formatDate(userProfile.subscription.expiresAt) || '—'}
                    </span>
                  ) : null}
                </div>
              </div>

              {settingsMessage && (
                <div className="rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
                  {settingsMessage}
                </div>
              )}

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
                    disabled={!canUseManaged || !managedActive || preferenceSaving}
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
                  El backend decide la clave permitida según rol y estado. Free solo usa BYOK; la clave administrada requiere membresía.
                </p>
              </div>

              <div className="space-y-3 rounded-xl border border-indigo-400/30 bg-indigo-500/5 p-4">
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
                        <select
                          value={selectedPeriod}
                          onChange={(e) =>
                            setPlanPeriods((prev) => ({
                              ...prev,
                              [plan.id]: e.target.value as PlanPeriod,
                            }))
                          }
                          className="rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-sm text-white outline-none"
                        >
                          <option value="monthly">Mensual</option>
                          <option value="quarterly">Trimestral (-5%)</option>
                          <option value="semiannual">Semestral (-10%)</option>
                          <option value="annual">Anual (-15%)</option>
                        </select>
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
                          .slice(0, 5)
                          .map((u) => (
                            <tr key={u.uid} className="border-t border-white/5">
                              <td className="px-3 py-2 font-mono text-[11px] text-slate-200">{u.uid}</td>
                              <td className="px-3 py-2">
                                <select
                                  value={u.role}
                                  onChange={(e) => handleAdminChangeRole(u.uid, e.target.value as UserRole)}
                                  className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white"
                                  disabled={adminLoading}
                                >
                                  <option value="free">free</option>
                                  <option value="paid_byok">paid_byok</option>
                                  <option value="paid_managed">paid_managed</option>
                                  <option value="gifted_managed">gifted_managed</option>
                                  <option value="admin">admin</option>
                                </select>
                              </td>
                              <td className="px-3 py-2 text-[11px] text-slate-200 space-y-1">
                                <select
                                  value={u.subscriptionStatus || 'expired'}
                                  onChange={(e) =>
                                    setAdminUsers((prev) =>
                                      prev.map((item) =>
                                        item.uid === u.uid ? { ...item, subscriptionStatus: e.target.value } : item,
                                      ),
                                    )
                                  }
                                  className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white"
                                  disabled={adminLoading}
                                >
                                  <option value="active">Activa</option>
                                  <option value="expired">Inactiva</option>
                                </select>
                                <select
                                  value={u.subscriptionSource || 'manual'}
                                  onChange={(e) =>
                                    setAdminUsers((prev) =>
                                      prev.map((item) =>
                                        item.uid === u.uid ? { ...item, subscriptionSource: e.target.value as any } : item,
                                      ),
                                    )
                                  }
                                className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white"
                                disabled={adminLoading}
                              >
                                <option value="manual">Manual</option>
                                <option value="stripe">Stripe</option>
                                <option value="promo">Promo</option>
                                <option value="wompi">Wompi</option>
                              </select>
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
        <span className="text-lg">＋</span> Registrar gasto
      </button>

      <BottomNav value={activeTab} onChange={setActiveTab} />

      <QuickAddSheet
        open={showQuickAdd}
        onClose={() => setShowQuickAdd(false)}
        onSave={handleSaveTransaction}
        onInterpret={handleInterpret}
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
