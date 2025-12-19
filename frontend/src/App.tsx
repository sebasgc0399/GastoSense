import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BottomNav, type TabKey } from './components/BottomNav';
import { QuickAddSheet } from './components/QuickAddSheet';
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
import { SettingsPage } from './pages/SettingsPage';
import { TransactionsPage } from './pages/TransactionsPage';
import { callParseTransactionPhrase } from './services/functions';
import { trackEvent } from './services/analytics';
import {
  useAdvisorController,
  useBudgetController,
  useHomeMonthController,
  useSettingsController,
  useTemplatesController,
  useTransactionsController,
} from './hooks';
import { topCategories } from './utils/txAgg';
import {
  createTransaction,
  deleteTransaction,
  updateTransaction,
} from './services/transactions';
import type {
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
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  type TransactionsSortBy = 'date_desc' | 'amount_desc';
  const [txSortBy, setTxSortBy] = useState<TransactionsSortBy>('date_desc');
  const openQuickAddSheet = useCallback(() => setShowQuickAdd(true), []);
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
    (err: unknown, kind: 'parse' | 'analyze' = 'parse') => mapAiErrorMessage(err, kind, iaQuota),
    [iaQuota],
  );

  const categoryBudgetsRef = useRef<HTMLDivElement | null>(null);
  const [budgetFocusCategory, setBudgetFocusCategory] = useState<string | null>(null);
  const scrollToPlans = useCallback(
    () => plansRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    [plansRef],
  );
  const scrollToBudgets = useCallback(
    () => categoryBudgetsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    [categoryBudgetsRef],
  );

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
    // Scroll al bloque de presupuestos; si ya está en pantalla, hará scroll suave
    setTimeout(() => scrollToBudgets(), 100);
  }, [scrollToBudgets]);

  const openMovements = useCallback(
    (category?: string, opts?: { sortBy?: TransactionsSortBy }) => {
      const { startDate, endDate } = monthRangeIso(selectedMonth);
      setTxSortBy(opts?.sortBy ?? 'date_desc');
      txHandleFiltersChange({ startDate, endDate, category: category || 'all', search: '' });
      setActiveTab('transactions');
      trackEvent('smart_card_click', { action: 'movements', category });
    },
    [selectedMonth, txHandleFiltersChange],
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

          setTxSortBy('date_desc');
          txHandleFiltersChange({
            startDate,
            endDate: monthEnd,
            category: categoryNormalized || 'all',
            search,
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
    [normalizeTextForMatch, openBudgets, selectedMonth, subtractDaysIso, txHandleFiltersChange],
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
    (next: { startDate: string; endDate: string; category: string; search: string }) => {
      const { startDate, endDate, category, search } = next;
      // Aseguramos orden para evitar consultas vacías si el usuario invierte las fechas
      if (startDate && endDate && startDate > endDate) {
        txHandleFiltersChange({ startDate: endDate, endDate: startDate, category, search });
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
        category: t.category,
        note: t.note,
        type: t.type,
        date: t.date,
      })),
    [monthTransactions],
  );

  const {
    advisorMode,
    chatFeed,
    advisorLoading,
    handleToneChange,
    handleAdvisorAction,
    advisorQuickActions,
    featureLocks,
    parseExhausted,
    analyzeExhausted,
  } = useAdvisorController({
    userId: user?.uid,
    profileAdvisorMode: userProfile?.advisorMode,
    userRole: userProfile?.role,
    iaQuota,
    currentMonth: selectedMonth,
    monthlyExpense,
    monthlyIncome,
    topCategories: topExpenses,
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
      return data.parsed;
    } catch (err) {
      if (isResourceExhausted(err)) {
        triggerUpgradeOnce('parse_exhausted');
      }
      throw new Error(mapAiError(err, 'parse'));
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
              className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:border-white/20"
              onClick={() => openSettings('header')}
            >
              <img src="/icons/Gear_64.svg" alt="" aria-hidden="true" className="h-4 w-4 opacity-90" />
              <span>Config</span>
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
            categoryBudgetsRef={categoryBudgetsRef}
            budgetFocusCategory={budgetFocusCategory}
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
            setSelectedTx={setSelectedTx}
            handleDeleteTransaction={handleDeleteTransaction}
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
            previousMonth={previousMonth}
            onOpenQuickAdd={() => openQuickAdd('expense')}
            onViewMovements={() => openMovements()}
            onAdjustBudget={() => openBudgets()}
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
            onActionClick={handleAiActionClick}
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

      {!(activeTab === 'metrics' && monthTransactions.length === 0) && (
        <button
          onClick={() => setShowQuickAdd(true)}
          className="fixed bottom-20 right-4 z-30 flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 hover:bg-sky-600 sm:bottom-24"
        >
          <span className="text-lg">+</span> Registrar gasto
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
        onOpenSettings={() => setShowCategoryManager(true)}
        selectedTemplate={selectedTemplate}
        selectedTemplateIntent={selectedTemplateIntent}
        onClearSelectedTemplate={clearSelectedTemplate}
        onClearTemplate={clearSelectedTemplate}
      />

      <CategoryManagerModal
        open={showCategoryManager}
        onClose={() => setShowCategoryManager(false)}
        userId={user?.uid}
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
        onGoToPlans={() => openPlans('upgrade_modal')}
      />

      <LimitsHelpModal open={showLimitsHelp} onClose={() => setShowLimitsHelp(false)} />
    </div>
  );
}

export default App;
