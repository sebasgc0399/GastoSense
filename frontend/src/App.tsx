import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BottomNav, type TabKey } from './components/BottomNav';
import { QuickAddSheet } from './components/QuickAddSheet';
import { BudgetManagerSheet } from './components/BudgetManagerSheet';
import { CategoryManagerModal } from './components/CategoryManagerModal';
import { TransactionEditModal } from './components/TransactionEditModal';
import { UpgradeModal } from './components/UpgradeModal';
import { LimitsHelpModal } from './components/LimitsHelpModal';
import { useAuth } from './context/AuthContext';
import { LoginHero } from './components/LoginHero';
import { useThemeMode } from './context/ThemeContext';
import { AdvisorPage, type AdvisorPageProps } from './pages/AdvisorPage';
import { HomePage } from './pages/HomePage';
import { MetricsPage } from './pages/MetricsPage';
import { ObjectivesPage } from './pages/ObjectivesPage';
import { SettingsPage } from './pages/SettingsPage';
import { TransactionsPage } from './pages/TransactionsPage';
import { callParseTransactionPhrase, callSuggestCategoryIcon } from './services/functions';
import { trackEvent } from './services/analytics';
import {
  useAdvisorController,
  useBudgetController,
  useCategoriesController,
  useHomeMonthController,
  useObjectivesController,
  useSettingsController,
  useTemplatesController,
  useTransactionsController,
} from './hooks';
import type { TransactionsFilters, TransactionTypeFilter } from './hooks/useTransactionsController';
import { topCategories } from './utils/txAgg';
import { resolveCanonicalCategoryId, resolveCategoryLabel, truncateCategoryId } from './utils/categoryResolver';
import {
  createTransaction,
  deleteTransaction,
  updateTransaction,
} from './services/transactions';
import type {
  CategoryKind,
  ParsedTransactionSuggestion,
  Transaction,
  TransactionInput,
  UserRole,
} from './types';
import { monthRangeIso, todayIso } from './utils/dates';
import { isResourceExhausted as isResourceExhaustedError, mapAiError as mapAiErrorMessage } from './utils/aiErrors';
import { formatPesos } from './utils/format';
function App() {
  const { user, loading, logout } = useAuth();
  const { theme, toggleTheme } = useThemeMode();
  const [activeTab, setActiveTab] = useState<TabKey>('home');
  type SettingsOpenSource = 'header' | 'upgrade_modal' | 'other';
  const prevTabRef = useRef<TabKey>('home');
  const settingsOpenSourceRef = useRef<SettingsOpenSource>('other');
  const suppressTxClickUntilRef = useRef(0);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [categoryManagerInitialKind, setCategoryManagerInitialKind] = useState<CategoryKind>('expense');
  type TransactionsSortBy = 'date_desc' | 'amount_desc';
  const [txSortBy, setTxSortBy] = useState<TransactionsSortBy>('date_desc');
  const openQuickAddSheet = useCallback(() => setShowQuickAdd(true), []);
  const openCategoryManager = useCallback((kind: CategoryKind) => {
    setCategoryManagerInitialKind(kind);
    setShowCategoryManager(true);
  }, []);
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
  } = useTransactionsController({ userId: user?.uid, sortBy: txSortBy });
  const { categories: allCategories } = useCategoriesController({ userId: user?.uid, includeArchived: true });
  const {
    objectives,
    objectivesReady,
    error: objectivesError,
    createObjective: handleCreateObjective,
    updateObjective: handleUpdateObjective,
    archiveObjective: handleArchiveObjective,
    deleteObjective: handleDeleteObjective,
    addEntry: handleObjectiveEntry,
    deleteEntry: handleDeleteObjectiveEntry,
  } = useObjectivesController({ userId: user?.uid });
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const defaultMonth = todayIso().slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState(defaultMonth);

  const setSelectedMonthFromMetrics = useCallback((next: string | ((prev: string) => string)) => {
    setSelectedMonth((prev) => {
      const nextMonth = typeof next === 'function' ? next(prev) : next;
      if (prev !== nextMonth) {
        trackEvent('metrics_month_changed', { fromMonth: prev, toMonth: nextMonth });
      }
      return nextMonth;
    });
  }, []);
  const { budget, budgetSaving, handleSaveBudget, handleSaveCategoryBudgets } = useBudgetController({
    userId: user?.uid,
    currentMonth: selectedMonth,
  });
  const {
    templates,
    recurringTemplates,
    selectedTemplate,
    selectedTemplateIntent,
    clearSelectedTemplate,
    saveTemplate: handleSaveTemplate,
    updateTemplate: handleUpdateTemplate,
    deleteTemplate: handleDeleteTemplate,
    handleUseTemplate,
    handleEditTemplate,
  } = useTemplatesController({ userId: user?.uid, onOpenQuickAdd: openQuickAddSheet });
  const {
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
  } = useSettingsController({ userUid: user?.uid, logout });
  const roleFromProfile = userProfile?.role as UserRole | undefined;
  const roleFromQuota = iaQuota?.role as UserRole | undefined;
  const hasActiveMembership = hasActiveSubscription;
  const isPrivilegedRole = (role?: UserRole) => role === 'admin';
  const isPaidRole = (role?: UserRole) =>
    role === 'paid_byok' || role === 'paid_managed' || role === 'gifted_managed';
  const resolveAdvisorRoleBase = (profileRole?: UserRole, quotaRole?: UserRole): UserRole => {
    if (profileRole === 'admin' || quotaRole === 'admin') return 'admin';
    if (isPaidRole(profileRole)) return profileRole as UserRole;
    if (isPaidRole(quotaRole)) return quotaRole as UserRole;
    return 'free';
  };
  const canExport = isPrivilegedRole(roleFromProfile) || isPrivilegedRole(roleFromQuota)
    ? true
    : isPaidRole(roleFromProfile)
      ? hasActiveMembership
      : false;
  const advisorRoleBase = resolveAdvisorRoleBase(roleFromProfile, roleFromQuota);
  const advisorEffectiveRole: UserRole =
    advisorRoleBase === 'admin'
      ? 'admin'
      : isPaidRole(advisorRoleBase)
        ? hasActiveMembership
          ? advisorRoleBase
          : 'free'
        : 'free';
  const isAdminRole = userProfile?.role === 'admin';
  const hasByokRole = userProfile?.role === 'paid_byok';
  const hasByokKey = userProfile?.openaiKeyStored === true;
  const byokPreference = userProfile?.preferredKey;
  const byokPreferenceAllowed = !byokPreference || byokPreference === 'byok';
  const canFreeChat = isAdminRole
    ? Boolean(byokPreference !== 'byok' || hasByokKey)
    : Boolean(hasByokRole && hasActiveMembership && hasByokKey && byokPreferenceAllowed);
  const freeChatNeedsKey = isAdminRole
    ? Boolean(byokPreference === 'byok' && !hasByokKey)
    : Boolean(hasByokRole && hasActiveMembership && (!hasByokKey || byokPreference === 'managed'));
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeContext, setUpgradeContext] = useState<'parse_exhausted' | 'analyze_exhausted' | 'feature_locked'>(
    'parse_exhausted',
  );
  const [showLimitsHelp, setShowLimitsHelp] = useState(false);

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

  const isResourceExhausted = isResourceExhaustedError;

  const mapAiError = useCallback(
    (err: unknown, kind: 'parse' | 'analyze' | 'free_chat' = 'parse') => mapAiErrorMessage(err, kind, iaQuota),
    [iaQuota],
  );

  const [showCategoryBudgets, setShowCategoryBudgets] = useState(false);
  const [budgetFocusCategory, setBudgetFocusCategory] = useState<string | null>(null);
  const scrollToPlans = useCallback(
    () => plansRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    [plansRef],
  );
  const scrollToMonthlyBudget = useCallback(() => {
    if (typeof document === 'undefined') return;
    const target = document.getElementById('monthly-budget-card');
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const targetCenter = rect.top + scrollTop + rect.height / 2;
    const desiredTop = targetCenter - window.innerHeight / 2;
    const maxTop = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const clampedTop = Math.min(Math.max(0, desiredTop), maxTop);

    window.scrollTo({ top: clampedTop, behavior: 'smooth' });
  }, []);

  const openSettings = useCallback((source: SettingsOpenSource = 'other') => {
    settingsOpenSourceRef.current = source;
    setActiveTab('settings');
  }, []);

  type AiActionData = Parameters<AdvisorPageProps['onActionClick']>[0];

  const normalizeTextForMatch = useCallback((value: string) => {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-')
      .trim();
  }, []);

  const subtractDaysIso = useCallback((iso: string, days: number) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
    const d = new Date(`${iso}T00:00:00.000Z`);
    if (Number.isNaN(d.getTime())) return iso;
    d.setUTCDate(d.getUTCDate() - days);
    return d.toISOString().slice(0, 10);
  }, []);

  const openBudgets = useCallback((category?: string) => {
    setBudgetFocusCategory(category ?? null);
    setActiveTab('home');
    trackEvent('smart_card_click', { action: 'budgets', category });
    setShowCategoryBudgets(true);
  }, []);

  const closeCategoryBudgets = useCallback(() => {
    setShowCategoryBudgets(false);
    setBudgetFocusCategory(null);
  }, []);

  const openMonthlyBudget = useCallback(() => {
    closeCategoryBudgets();
    setActiveTab('home');
    setTimeout(() => scrollToMonthlyBudget(), 120);
  }, [closeCategoryBudgets, scrollToMonthlyBudget]);

  const resolveFilterTypeFromCategory = useCallback(
    (categoryId?: string | null): TransactionTypeFilter => {
      if (!categoryId || categoryId === 'all') return 'all';
      if (categoryId === 'ingreso') return 'income';
      if (categoryId === 'otros') return 'expense';
      const match = allCategories.find((cat) => cat.id === categoryId);
      if (!match) return 'all';
      return match.kind === 'income' ? 'income' : 'expense';
    },
    [allCategories],
  );

  const openMovements = useCallback(
    (category?: string, opts?: { sortBy?: TransactionsSortBy; suppressTxClick?: boolean }) => {
      const { startDate, endDate } = monthRangeIso(selectedMonth);
      if (opts?.suppressTxClick) {
        suppressTxClickUntilRef.current = Date.now() + 500;
      }
      setTxSortBy(opts?.sortBy ?? 'date_desc');
      const resolvedType = resolveFilterTypeFromCategory(category ?? null);
      txHandleFiltersChange({
        startDate,
        endDate,
        category: category || 'all',
        search: '',
        type: resolvedType,
      });
      setActiveTab('transactions');
      trackEvent('smart_card_click', { action: 'movements', category });
    },
    [resolveFilterTypeFromCategory, selectedMonth, txHandleFiltersChange],
  );
  const shouldIgnoreTransactionClick = useCallback(
    () => Date.now() < suppressTxClickUntilRef.current,
    [],
  );
  const handleViewCategory = useCallback(
    (categoryId: string) => {
      openMovements(categoryId);
      closeCategoryBudgets();
    },
    [closeCategoryBudgets, openMovements],
  );

  const handleAiActionClick = useCallback(
    (actionData: AiActionData) => {
      const fail = () => window.alert('No pudimos ejecutar esta acción automáticamente.');
      if (!actionData) return;

      try {
        if (actionData.type === 'NAVIGATE_FILTER') {
          const payload = (actionData.payload ?? {}) as Record<string, unknown>;
          const period = typeof payload.period === 'string' ? payload.period : null;
          const categoryRaw = typeof payload.category === 'string' ? payload.category : null;
          const noteRaw = typeof payload.note === 'string' ? payload.note : null;

          const nowIso = todayIso();
          const { startDate: monthStart, endDate: monthEnd } = monthRangeIso(selectedMonth, nowIso);

          const startDate =
            period === 'last_7_days'
              ? (() => {
                  const candidate = subtractDaysIso(monthEnd, 6);
                  return candidate < monthStart ? monthStart : candidate;
                })()
              : monthStart;

            const categoryNormalized = categoryRaw ? normalizeTextForMatch(categoryRaw) : 'all';
            const search = noteRaw ? noteRaw.trim() : '';
            const resolvedType = resolveFilterTypeFromCategory(categoryNormalized || null);

            setTxSortBy('date_desc');
            txHandleFiltersChange({
              startDate,
              endDate: monthEnd,
              category: categoryNormalized || 'all',
              search,
              type: resolvedType,
            });
          setActiveTab('transactions');
          trackEvent('advisor_action_click', {
            type: actionData.type,
            period: period ?? 'current_month',
            category: categoryNormalized || 'all',
            hasSearch: Boolean(search),
          });
          return;
        }

        if (actionData.type === 'OPEN_BUDGET') {
          const payload = (actionData.payload ?? {}) as Record<string, unknown>;
          const categoryRaw = typeof payload.category === 'string' ? payload.category : undefined;
          const category = categoryRaw ? normalizeTextForMatch(categoryRaw) : undefined;
          openBudgets(category);
          trackEvent('advisor_action_click', { type: actionData.type, category: category ?? null });
          return;
        }

        if (actionData.type === 'OPEN_MODAL') {
          window.alert('Esta acción aún no está disponible.');
          trackEvent('advisor_action_click', { type: actionData.type });
          return;
        }

        console.warn('Acción de IA no soportada:', actionData);
        fail();
      } catch (err) {
        console.error('Error ejecutando acción de IA', err);
        fail();
      }
    },
    [
      normalizeTextForMatch,
      openBudgets,
      resolveFilterTypeFromCategory,
      selectedMonth,
      subtractDaysIso,
      txHandleFiltersChange,
    ],
  );

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

  const openPlans = useCallback((source: SettingsOpenSource = 'other') => {
    openSettings(source);
    trackEvent('smart_card_click', { action: 'plans' });
    setTimeout(() => scrollToPlans(), 120);
  }, [openSettings, scrollToPlans]);

  const {
    monthTransactions,
    monthlyExpense,
    monthlyIncome,
    availableBalance,
    topExpenses,
    categorySpendMap,
    categoryResolver,
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
    currentMonth: selectedMonth,
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

  const expenseCategories = useMemo(() => topCategories(categorySpendMap, Number.POSITIVE_INFINITY), [categorySpendMap]);
  const topExpenseItems = useMemo(
    () =>
      topExpenses.map((item) => {
        const label = resolveCategoryLabel(item.category, categoryResolver);
        return {
          categoryId: item.category,
          label: label ?? 'Categoría eliminada',
          fallbackId: label ? undefined : truncateCategoryId(item.category),
          spent: item.amount,
        };
      }),
    [categoryResolver, topExpenses],
  );
  const advisorTopCategories = useMemo(
    () =>
      topExpenseItems.map((item) => ({
        category: item.label,
        amount: item.spent,
      })),
    [topExpenseItems],
  );

  const metricsViewedPayload = useMemo(
    () => ({
      month: selectedMonth,
      selectedMonth,
      txCount: monthTransactions.length,
      hasIncome: monthlyIncome > 0 || monthTransactions.some((t) => t.type === 'income'),
      hasBudget: (budget?.total ?? 0) > 0,
      expense: monthlyExpense,
      income: monthlyIncome,
    }),
    [budget?.total, monthTransactions, monthlyExpense, monthlyIncome, selectedMonth],
  );

  useEffect(() => {
    const prev = prevTabRef.current;
    if (prev === activeTab) return;

    trackEvent('tab_changed', { from: prev, to: activeTab });

    if (activeTab === 'metrics') {
      trackEvent('metrics_viewed', metricsViewedPayload);
    }

    if (activeTab === 'settings') {
      trackEvent('settings_opened', { source: settingsOpenSourceRef.current });
      settingsOpenSourceRef.current = 'other';
    }

    prevTabRef.current = activeTab;
  }, [activeTab, metricsViewedPayload]);

  const getWeekKey = useCallback(() => {
    if (iaQuota?.week) return iaQuota.week;
    if (iaQuota?.resetAt) return iaQuota.resetAt.slice(0, 10);
    return todayIso();
  }, [iaQuota]);

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
    (next: TransactionsFilters) => {
      const { startDate, endDate, category, search, type } = next;
      // Aseguramos orden para evitar consultas vacías si el usuario invierte las fechas
      if (startDate && endDate && startDate > endDate) {
        txHandleFiltersChange({ startDate: endDate, endDate: startDate, category, search, type });
      } else {
        txHandleFiltersChange(next);
      }
    },
    [txHandleFiltersChange],
  );

  const lastTransactionsSummary = useMemo(
    () =>
      monthTransactions.map((t) => ({
        amount: t.amount,
        category: resolveCategoryLabel(t.categoryId, categoryResolver) ?? t.categoryId,
        note: t.note,
        type: t.type,
        date: t.date,
      })),
    [categoryResolver, monthTransactions],
  );

  const {
    advisorMode,
    advisorEnvironment,
    chatFeed,
    freeChatFeed,
    advisorLoading,
    freeChatLoading,
    handleFreeChatSend,
    handleFreeChatReset,
    handleFreeChatRecover,
    setAdvisorEnvironment,
    handleToneChange,
    handleAdvisorAction,
    advisorQuickActions,
    featureLocks,
    parseExhausted,
    analyzeExhausted,
  } = useAdvisorController({
    userId: user?.uid,
    canFreeChat,
    profileAdvisorMode: userProfile?.advisorMode,
    userRole: advisorEffectiveRole,
    iaQuota,
    currentMonth: selectedMonth,
    monthlyExpense,
    monthlyIncome,
    topCategories: advisorTopCategories,
    budgetTotal: budget?.total,
    budgetPerCategory: budget?.perCategory,
    previousMonth,
    lastTransactions: lastTransactionsSummary,
    openUpgrade,
    triggerUpgradeOnce,
    mapAiError,
    isResourceExhausted,
    refreshQuota,
  });

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
      await refreshQuota();
        const raw = data.parsed as ParsedTransactionSuggestion & {
          category?: string;
          categoryId?: string;
          categoryFallback?: boolean;
          categoryFallbackReason?: ParsedTransactionSuggestion['categoryFallbackReason'];
        };
        const parsedType = raw.type === 'income' ? 'income' : 'expense';
        const rawCategoryId =
          typeof raw.categoryId === 'string' ? raw.categoryId.trim() : '';
        const rawCategory =
          rawCategoryId || (typeof raw.category === 'string' ? raw.category : '');
        const normalizedRawCategory = typeof rawCategory === 'string' ? rawCategory.trim().toLowerCase() : '';
        const hasCategories = Object.keys(categoryResolver?.categoriesById ?? {}).length > 0;
        let categoryId = '';
        let categoryFallbackReason = raw.categoryFallbackReason;
        const fallbackId = parsedType === 'income' ? 'ingreso' : 'otros';
        const resolvedCategoryId = rawCategoryId || resolveCanonicalCategoryId(rawCategory, categoryResolver);
        if (parsedType === 'expense') {
          if (normalizedRawCategory === 'otros') {
            categoryId = 'otros';
            categoryFallbackReason = categoryFallbackReason ?? 'explicit_other';
          } else {
            const isValid = !hasCategories || !!categoryResolver?.categoriesById?.[resolvedCategoryId];
            if (!resolvedCategoryId || resolvedCategoryId === 'ingreso' || !isValid) {
              categoryId = 'otros';
              if (!categoryFallbackReason) {
                categoryFallbackReason = normalizedRawCategory ? 'no_match' : 'empty';
              }
            } else {
              categoryId = resolvedCategoryId;
            }
          }
        } else {
          if (normalizedRawCategory === 'ingreso') {
            categoryId = 'ingreso';
            categoryFallbackReason = categoryFallbackReason ?? 'explicit_other';
          } else if (!resolvedCategoryId || resolvedCategoryId === 'otros') {
            categoryId = 'ingreso';
            if (!categoryFallbackReason) {
              categoryFallbackReason = normalizedRawCategory ? 'no_match' : 'empty';
            }
          } else {
            categoryId = resolvedCategoryId;
          }
        }
        const categoryFallback = categoryId === fallbackId;
        if (!categoryFallback) {
          categoryFallbackReason = undefined;
        } else if (!categoryFallbackReason) {
          categoryFallbackReason = normalizedRawCategory ? 'no_match' : 'empty';
        }
        const baseConfidence = typeof raw.confidence === 'number' ? raw.confidence : 0.6;
        const confidence = categoryFallback ? Math.min(baseConfidence, 0.4) : baseConfidence;
        return { ...raw, type: parsedType, categoryId, categoryFallback, categoryFallbackReason, confidence };
      } catch (err) {
        if (isResourceExhausted(err)) {
          triggerUpgradeOnce('parse_exhausted');
        }
      throw new Error(mapAiError(err, 'parse'));
    }
  };

  const handleSuggestCategoryIcon = useCallback(
    async (label: string): Promise<string> => {
      const trimmed = label.trim();
      if (!trimmed) {
        throw new Error('Escribe el nombre primero.');
      }
      try {
        const resp = await callSuggestCategoryIcon({ label: trimmed });
        const data = resp.data as { icon?: string };
        await refreshQuota();
        const icon = typeof data.icon === 'string' ? data.icon.trim() : '';
        return icon || 'Tag';
      } catch (err) {
        if (isResourceExhausted(err)) {
          openUpgrade('parse_exhausted');
        }
        throw new Error(mapAiError(err, 'parse'));
      }
    },
    [isResourceExhausted, mapAiError, openUpgrade, refreshQuota],
  );

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
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,var(--glow-1),transparent_35%),radial-gradient(circle_at_80%_25%,var(--glow-2),transparent_35%),radial-gradient(circle_at_50%_80%,var(--glow-3),transparent_40%)]" />
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
      <header className="sticky top-0 z-20 border-b surface-divider bg-[var(--bg)]/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Gastos personales</p>
            <h1 className="text-xl font-semibold text-[var(--text)]">Tu dinero bajo control</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="btn btn-secondary btn-compact rounded-full text-xs shadow-sm"
              onClick={() => openSettings('header')}
            >
              <img src="/icons/Gear_64.svg" alt="" aria-hidden="true" className="h-4 w-4 opacity-90" />
              <span>Config</span>
            </button>
            <button
              className="btn btn-secondary btn-compact rounded-full text-xs shadow-sm"
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
            currentMonth={selectedMonth}
            defaultMonth={defaultMonth}
            setCurrentMonth={setSelectedMonth}
            budget={budget}
            handleSaveBudget={handleSaveBudget}
            budgetSaving={budgetSaving}
            onEditCategoryBudgets={openBudgets}
            topExpenseItems={topExpenseItems}
            smartCards={smartCards}
            smartCardIndex={smartCardIndex}
            setSmartCardIndex={setSmartCardIndex}
            handlePrevInsight={handlePrevInsight}
            handleNextInsight={handleNextInsight}
            handleTouchStart={handleTouchStart}
            handleTouchEnd={handleTouchEnd}
            categoryResolver={categoryResolver}
            recurringTemplates={recurringTemplates}
            handleUseTemplate={handleUseTemplate}
            handleEditTemplate={handleEditTemplate}
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
            categoryResolver={categoryResolver}
            userId={user?.uid}
            setSelectedTx={setSelectedTx}
            handleDeleteTransaction={handleDeleteTransaction}
            shouldIgnoreTransactionClick={shouldIgnoreTransactionClick}
            canExport={canExport}
            onExportLocked={() => openUpgrade('feature_locked')}
          />
        )}
        {activeTab === 'objectives' && (
          <ObjectivesPage
            objectives={objectives}
            objectivesReady={objectivesReady}
            error={objectivesError}
            onCreateObjective={handleCreateObjective}
            onUpdateObjective={handleUpdateObjective}
            onArchiveObjective={handleArchiveObjective}
            onDeleteObjective={handleDeleteObjective}
            onAddEntry={handleObjectiveEntry}
            onDeleteEntry={handleDeleteObjectiveEntry}
          />
        )}
        {activeTab === 'metrics' && (
          <MetricsPage
            currentMonth={selectedMonth}
            defaultMonth={defaultMonth}
            setCurrentMonth={setSelectedMonthFromMetrics}
            monthTransactions={monthTransactions}
            monthlyExpense={monthlyExpense}
            monthlyIncome={monthlyIncome}
            availableBalance={availableBalance}
            budget={budget}
            expenseCategories={expenseCategories}
            categoryResolver={categoryResolver}
            previousMonth={previousMonth}
            onOpenQuickAdd={() => openQuickAdd('expense')}
            onViewMovements={(categoryId, opts) => openMovements(categoryId, opts)}
            onAdjustBudget={openMonthlyBudget}
          />
        )}
        {activeTab === 'advisor' && (
          <AdvisorPage
            advisorMode={advisorMode}
            advisorEnvironment={advisorEnvironment}
            setAdvisorEnvironment={setAdvisorEnvironment}
            canFreeChat={canFreeChat}
            freeChatNeedsKey={freeChatNeedsKey}
            onOpenSettings={() => openSettings('other')}
            handleToneChange={handleToneChange}
            advisorQuickActions={advisorQuickActions}
            analyzeExhausted={analyzeExhausted}
            openUpgrade={openUpgrade}
            handleAdvisorAction={handleAdvisorAction}
            handleFreeChatSend={handleFreeChatSend}
            handleFreeChatReset={handleFreeChatReset}
            handleFreeChatRecover={handleFreeChatRecover}
            onActionClick={handleAiActionClick}
            featureLocks={featureLocks}
            chatFeed={chatFeed}
            freeChatFeed={freeChatFeed}
            advisorLoading={advisorLoading}
            freeChatLoading={freeChatLoading}
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

      {!(activeTab === 'metrics' && monthTransactions.length === 0) && (
        <button
          onClick={() => setShowQuickAdd(true)}
          className="btn btn-primary fixed bottom-20 right-4 z-30 rounded-full shadow-[0_12px_32px_var(--success-border)] gap-2 sm:bottom-24"
        >
          <span className="text-lg">+</span> Registrar
        </button>
      )}

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
        userId={user?.uid}
        onOpenSettings={openCategoryManager}
        selectedTemplate={selectedTemplate}
        selectedTemplateIntent={selectedTemplateIntent}
        onClearSelectedTemplate={clearSelectedTemplate}
        onClearTemplate={clearSelectedTemplate}
      />

      {showCategoryManager && (
        <CategoryManagerModal
          key={categoryManagerInitialKind}
          open={showCategoryManager}
          onClose={() => setShowCategoryManager(false)}
          userId={user?.uid}
          onSuggestIcon={handleSuggestCategoryIcon}
          initialKind={categoryManagerInitialKind}
        />
      )}

      <BudgetManagerSheet
        open={showCategoryBudgets}
        onClose={closeCategoryBudgets}
        userId={user?.uid}
        perCategory={budget?.perCategory}
        categorySpendMap={categorySpendMap}
        onSave={handleSaveCategoryBudgets}
        focusCategoryId={budgetFocusCategory}
        onViewCategory={handleViewCategory}
      />

        <TransactionEditModal
          open={!!selectedTx}
          transaction={selectedTx}
          userId={user?.uid}
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
        onGoToPlans={() => openPlans('upgrade_modal')}
      />

      <LimitsHelpModal open={showLimitsHelp} onClose={() => setShowLimitsHelp(false)} />
    </div>
  );
}

export default App;
