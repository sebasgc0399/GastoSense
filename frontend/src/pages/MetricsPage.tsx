import { useCallback, useEffect, useMemo, useState } from 'react';
import type React from 'react';
import { AllCategoriesModal } from '../components/AllCategoriesModal';
import { ReferenceMonthCard } from '../components/ReferenceMonthCard';
import { EvolutionChart } from '../components/charts/EvolutionChart';
import type { CategorySpendItem, CategorySpendMode } from '../components/charts/CategorySpendChart';
import { TopCategoriesChart } from '../components/TopCategoriesChart';
import { CardStat } from '../components/stats/CardStat';
import { StatsSummaryCard } from '../components/stats/StatsSummaryCard';
import { trackEvent } from '../services/analytics';
import type { Budget, Transaction } from '../types';
import type { CategoryResolver } from '../utils/categoryResolver';
import { resolveCanonicalCategoryId, resolveCategoryLabel, truncateCategoryId } from '../utils/categoryResolver';
import { monthRangeIso, todayIso } from '../utils/dates';
import {
  buildCategorySpendMap,
  buildCumulativeSeries,
  buildDailyExpenseSeries,
  buildDailyIncomeSeries,
  buildIdealBudgetPaceSeries,
  topCategories,
} from '../utils/txAgg';

interface MetricsPageProps {
  currentMonth: string;
  defaultMonth: string;
  setCurrentMonth: React.Dispatch<React.SetStateAction<string>>;
  monthTransactions: Transaction[];
  monthlyExpense: number;
  monthlyIncome: number;
  availableBalance: number;
  budget: Budget | null;
  expenseCategories: { category: string; amount: number }[];
  categoryResolver: CategoryResolver;
  previousMonth: { expense: number; income: number } | null;
  onOpenQuickAdd: () => void;
  onViewMovements: (categoryId?: string, opts?: { suppressTxClick?: boolean }) => void;
  onAdjustBudget: () => void;
}

export function MetricsPage({
  currentMonth,
  defaultMonth,
  setCurrentMonth,
  monthTransactions,
  monthlyExpense,
  monthlyIncome,
  availableBalance,
  budget,
  expenseCategories,
  categoryResolver,
  previousMonth,
  onOpenQuickAdd,
  onViewMovements,
  onAdjustBudget,
}: MetricsPageProps) {
  const txCount = monthTransactions.length;
  const { expenseTxCount, incomeTxCount } = useMemo(() => {
    let expenseCount = 0;
    let incomeCount = 0;
    for (const tx of monthTransactions) {
      if (tx.type === 'expense') expenseCount += 1;
      else if (tx.type === 'income') incomeCount += 1;
    }
    return { expenseTxCount: expenseCount, incomeTxCount: incomeCount };
  }, [monthTransactions]);
  const hasExpenses = expenseTxCount > 0;
  const hasIncome = incomeTxCount > 0;
  const [showCategoriesModal, setShowCategoriesModal] = useState(false);
  const [metricsType, setMetricsType] = useState<'expense' | 'income'>('expense');
  const [userSelected, setUserSelected] = useState(false);
  const [emptyTabOverrideMonth, setEmptyTabOverrideMonth] = useState<string | null>(null);
  const isCurrentMonth = currentMonth === todayIso().slice(0, 7);
  const autoPreferredType = hasExpenses ? 'expense' : hasIncome ? 'income' : metricsType;
  const baseMetricsType = userSelected ? metricsType : autoPreferredType;
  const suppressAutoSwitch = emptyTabOverrideMonth === currentMonth;
  const activeMetricsType = suppressAutoSwitch
    ? baseMetricsType
    : baseMetricsType === 'expense' && !hasExpenses && hasIncome
      ? 'income'
      : baseMetricsType === 'income' && !hasIncome && hasExpenses
        ? 'expense'
        : baseMetricsType;
  const isExpenseView = activeMetricsType === 'expense';
  const expenseTitle = isCurrentMonth ? 'Gasto del mes (hasta hoy)' : 'Gasto del mes';
  const incomeTitle = isCurrentMonth ? 'Ingresos del mes (hasta hoy)' : 'Ingresos del mes';
  const summaryItems = hasIncome
    ? [
        { label: expenseTitle, value: monthlyExpense, tone: 'danger' as const },
        { label: incomeTitle, value: monthlyIncome, tone: 'success' as const },
        {
          label: 'Saldo disponible',
          value: availableBalance,
          tone: availableBalance >= 0 ? ('success' as const) : ('danger' as const),
        },
      ]
    : [{ label: expenseTitle, value: monthlyExpense, tone: 'danger' as const }];

  const budgetTotal = budget?.total ?? 0;
  const hasBudget = budgetTotal > 0;
  const budgetProgress = hasBudget ? Math.min(monthlyExpense / budgetTotal, 1.2) : 0;
  const budgetAlert = !hasBudget ? 'none' : budgetProgress >= 1 ? 'max' : budgetProgress >= 0.8 ? 'warn' : 'ok';
  const budgetProgressStyle = { '--pct': `${Math.min(budgetProgress * 100, 120)}%` } as React.CSSProperties;

  const currentAmount = isExpenseView ? monthlyExpense : monthlyIncome;
  const previousMonthExpense = previousMonth?.expense ?? 0;
  const previousMonthIncome = previousMonth?.income ?? 0;
  const previousMonthValue = isExpenseView ? previousMonthExpense : previousMonthIncome;
  const hasPreviousMonthRef = previousMonthValue > 0;
  const amountDelta = hasPreviousMonthRef ? currentAmount - previousMonthValue : 0;
  const amountDeltaPct = hasPreviousMonthRef ? Math.round((amountDelta / previousMonthValue) * 100) : 0;
  const trendInsight = !hasPreviousMonthRef
    ? 'Sin referencia del mes anterior.'
    : amountDelta === 0
      ? '0% (sin cambios) vs mes anterior.'
      : amountDelta > 0
        ? `\u2191 ${Math.abs(amountDeltaPct)}% (+$${Math.abs(amountDelta).toLocaleString('es-CO')}) vs mes anterior.`
        : `\u2193 ${Math.abs(amountDeltaPct)}% (-$${Math.abs(amountDelta).toLocaleString('es-CO')}) vs mes anterior.`;

  const budgetModeAvailable = useMemo(() => {
    const perCategory = budget?.perCategory;
    if (!perCategory) return false;
    return Object.values(perCategory).some((value) => Number(value) > 0);
  }, [budget?.perCategory]);

  const [categoriesMode, setCategoriesMode] = useState<CategorySpendMode>('spent');
  const effectiveCategoriesMode: CategorySpendMode = isExpenseView && budgetModeAvailable ? categoriesMode : 'spent';

  const getItemMeta = useCallback(
    (categoryId: string) => {
      const label = resolveCategoryLabel(categoryId, categoryResolver);
      return {
        label: label ?? 'Categoría eliminada',
        fallbackId: label ? undefined : truncateCategoryId(categoryId),
      };
    },
    [categoryResolver],
  );

  const spentCategoryItems = useMemo<CategorySpendItem[]>(
    () =>
      expenseCategories
        .filter((c) => c.amount > 0)
        .map((c) => ({ categoryId: c.category, spent: c.amount, ...getItemMeta(c.category) })),
    [expenseCategories, getItemMeta],
  );

  const incomeCategories = useMemo(
    () => topCategories(buildCategorySpendMap(monthTransactions, categoryResolver, 'income'), Number.POSITIVE_INFINITY),
    [categoryResolver, monthTransactions],
  );

  const incomeCategoryItems = useMemo<CategorySpendItem[]>(
    () =>
      incomeCategories
        .filter((c) => c.amount > 0)
        .map((c) => ({ categoryId: c.category, spent: c.amount, ...getItemMeta(c.category) })),
    [getItemMeta, incomeCategories],
  );

  const budgetCategoryItems = useMemo<CategorySpendItem[]>(() => {
    const spendMap: Record<string, number> = {};
    for (const item of expenseCategories) spendMap[item.category] = item.amount;

    const perCategory = budget?.perCategory ?? {};
    const normalizedBudgets: Record<string, number> = {};
    for (const [rawId, rawBudget] of Object.entries(perCategory)) {
      const canonicalId = resolveCanonicalCategoryId(rawId, categoryResolver);
      const budgetValue = typeof rawBudget === 'number' ? rawBudget : Number(rawBudget);
      if (!Number.isFinite(budgetValue)) continue;
      const prev = normalizedBudgets[canonicalId];
      if (prev === undefined) normalizedBudgets[canonicalId] = budgetValue;
      else normalizedBudgets[canonicalId] = Math.max(prev, budgetValue);
    }

    const cats = new Set<string>([...Object.keys(spendMap), ...Object.keys(normalizedBudgets)]);

    const union: CategorySpendItem[] = [];
    cats.forEach((categoryId) => {
      const spent = spendMap[categoryId] ?? 0;
      const rawBudget = normalizedBudgets[categoryId];
      const normalizedBudget = Number.isFinite(rawBudget) && rawBudget > 0 ? rawBudget : undefined;
      if (spent <= 0 && !normalizedBudget) return;
      union.push({ categoryId, spent, budget: normalizedBudget, ...getItemMeta(categoryId) });
    });

    union.sort((a, b) => {
      if (b.spent !== a.spent) return b.spent - a.spent;
      if (a.spent === 0 && b.spent === 0) {
        const budgetDiff = (b.budget ?? 0) - (a.budget ?? 0);
        if (budgetDiff !== 0) return budgetDiff;
      }
      const labelDiff = a.label.localeCompare(b.label, 'es-CO');
      if (labelDiff !== 0) return labelDiff;
      return a.categoryId.localeCompare(b.categoryId);
    });
    return union;
  }, [budget?.perCategory, categoryResolver, expenseCategories, getItemMeta]);

  const categoryItems = isExpenseView
    ? effectiveCategoriesMode === 'spent'
      ? spentCategoryItems
      : budgetCategoryItems
    : incomeCategoryItems;
  const shouldShowViewAll = categoryItems.length > 3;

  type EvolutionView = 'daily' | 'cumulative';
  const [evolutionView, setEvolutionView] = useState<EvolutionView>('daily');
  const canUseCumulative = !isExpenseView || hasBudget;
  const effectiveEvolutionView: EvolutionView = canUseCumulative ? evolutionView : 'daily';
  const { startDate: monthStart, endDate: monthEnd } = useMemo(() => monthRangeIso(currentMonth), [currentMonth]);
  const dailyExpenses = useMemo(
    () => buildDailyExpenseSeries(monthTransactions, monthStart, monthEnd),
    [monthEnd, monthStart, monthTransactions],
  );
  const dailyIncome = useMemo(
    () => buildDailyIncomeSeries(monthTransactions, monthStart, monthEnd),
    [monthEnd, monthStart, monthTransactions],
  );
  const dailySeries = isExpenseView ? dailyExpenses : dailyIncome;
  const cumulativeSeries = useMemo(() => buildCumulativeSeries(dailySeries), [dailySeries]);

  const dailyChartData = useMemo(
    () => dailySeries.map((day) => ({ ...day, day: Number(day.date.slice(8)) })),
    [dailySeries],
  );
  const cumulativeChartData = useMemo(
    () => cumulativeSeries.map((day) => ({ ...day, day: Number(day.date.slice(8)) })),
    [cumulativeSeries],
  );

  const totalDailyAmount = useMemo(() => dailySeries.reduce((acc, day) => acc + day.amount, 0), [dailySeries]);
  const avgDailyAmount = dailySeries.length ? Math.round(totalDailyAmount / dailySeries.length) : 0;

  const paceIdeal = useMemo(() => {
    if (!isExpenseView || !hasBudget || !isCurrentMonth || !cumulativeSeries.length) return undefined;
    const raw = buildIdealBudgetPaceSeries(
      cumulativeSeries.map((day) => day.date),
      currentMonth,
      budgetTotal,
    );
    return raw.map((day) => ({ ...day, day: Number(day.date.slice(8)) }));
  }, [budgetTotal, cumulativeSeries, currentMonth, hasBudget, isCurrentMonth, isExpenseView]);

  const paceDiffCopy = useMemo(() => {
    if (!isExpenseView || !paceIdeal?.length || !cumulativeSeries.length) return null;
    const idealAtEnd = paceIdeal[paceIdeal.length - 1].amount;
    const actualAtEnd = cumulativeSeries[cumulativeSeries.length - 1].amount;
    const diff = actualAtEnd - idealAtEnd;
    const abs = Math.abs(diff);
    const sign = diff >= 0 ? '+' : '-';
    return `Vas ${sign}$${abs.toLocaleString('es-CO')} vs ritmo ideal.`;
  }, [cumulativeSeries, isExpenseView, paceIdeal]);

  const evolutionLabel =
    effectiveEvolutionView === 'daily'
      ? isExpenseView
        ? 'GASTO DIARIO DEL MES'
        : 'INGRESO DIARIO DEL MES'
      : isExpenseView
        ? 'ACUMULADO VS PRESUPUESTO'
        : 'ACUMULADO DE INGRESOS';
  const topCategoriesTitle = isExpenseView ? '\u00bfEn qu\u00e9 gastaste?' : '\u00bfC\u00f3mo ganaste?';
  const categoryValueLabel = isExpenseView ? 'Gastado' : 'Ingreso';
  const evolutionMetricLabel = isExpenseView ? 'Gasto' : 'Ingreso';

  const hasMetricsData = isExpenseView ? hasExpenses : hasIncome;
  const showTabEmptyState = txCount > 0 && !hasMetricsData;
  const emptyTabTitle = isExpenseView ? 'Este mes no registraste gastos' : 'Este mes no registraste ingresos';
  const emptyTabSwitchLabel = isExpenseView ? 'Ver Ingresos' : 'Ver Gastos';
  const canSwitchToOtherTab = isExpenseView ? hasIncome : hasExpenses;

  const handleMetricsTypeChange = (next: 'expense' | 'income') => {
    setUserSelected(true);
    setMetricsType(next);
    const nextHasData = next === 'expense' ? hasExpenses : hasIncome;
    const otherHasData = next === 'expense' ? hasIncome : hasExpenses;
    if (!nextHasData && otherHasData) {
      setEmptyTabOverrideMonth(currentMonth);
    } else {
      setEmptyTabOverrideMonth(null);
    }
  };

  useEffect(() => {
    if (!hasMetricsData) return;
    trackEvent('metrics_evolution_viewed', { selectedMonth: currentMonth, hasBudget, metricsType: activeMetricsType });
  }, [currentMonth, hasBudget, hasMetricsData, activeMetricsType]);

  const handleEvolutionToggle = (next: EvolutionView) => {
    if (next === evolutionView) return;
    if (next === 'cumulative' && !canUseCumulative) return;
    setEvolutionView(next);
    trackEvent('metrics_evolution_toggled', { selectedMonth: currentMonth, view: next, metricsType: activeMetricsType });
  };

  const handleCategoriesModeChange = (next: CategorySpendMode) => {
    if (!isExpenseView) return;
    if (next === categoriesMode) return;
    if (next === 'budget' && !budgetModeAvailable) return;
    setCategoriesMode(next);
  };

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-[var(--text)]">Métricas</h2>
        <p className="text-xs text-[var(--text-muted)]">Visualiza tu mes en segundos.</p>
      </div>

      <ReferenceMonthCard
        currentMonth={currentMonth}
        defaultMonth={defaultMonth}
        onChange={setCurrentMonth}
        description="Cambia el mes para ver totales y comparativos."
      />

      {txCount === 0 ? (
        <div className="card space-y-2">
          <h3 className="text-base font-semibold text-[var(--text)]">Aún no hay datos</h3>
          <p className="text-sm text-[var(--text-muted)]">Registra tu primer movimiento (gasto o ingreso) para empezar a ver métricas.</p>
          <div className="flex flex-wrap gap-2">
            <button
              className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-[var(--text)] hover:opacity-90"
              onClick={onOpenQuickAdd}
            >
              Registrar
            </button>
            <button
              className="rounded-lg border border-[var(--card-border)] bg-[var(--input-bg)] px-3 py-2 text-sm font-semibold text-[var(--text)] hover:border-primary"
              onClick={() => onViewMovements()}
            >
              Ver movimientos
            </button>
          </div>
        </div>
      ) : (
        <>
          <StatsSummaryCard className="sm:hidden" items={summaryItems} />

          <div className={`hidden grid-cols-1 gap-3 sm:grid ${hasIncome ? 'sm:grid-cols-3' : 'sm:grid-cols-1'}`}>
            <CardStat title={expenseTitle} value={monthlyExpense} tone="danger" subtitle="Total de gastos del periodo." />
            {hasIncome && <CardStat title={incomeTitle} value={monthlyIncome} tone="success" subtitle="Total de ingresos." />}
            {hasIncome && (
              <CardStat
                title="Saldo disponible"
                value={availableBalance}
                tone={availableBalance >= 0 ? 'success' : 'danger'}
                subtitle="Ingresos - Gastos del periodo."
              />
            )}
          </div>

          <div className="rounded-2xl surface-soft p-1">
            <div className="flex w-full gap-1 text-sm font-semibold">
              <button
                type="button"
                aria-pressed={isExpenseView}
                onClick={() => handleMetricsTypeChange('expense')}
                className={`flex-1 rounded-xl px-3 py-2 transition ${
                  isExpenseView ? 'state-danger text-[var(--text)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                }`}
              >
                Gastos
              </button>
              <button
                type="button"
                aria-pressed={!isExpenseView}
                onClick={() => handleMetricsTypeChange('income')}
                className={`flex-1 rounded-xl px-3 py-2 transition ${
                  isExpenseView ? 'text-[var(--text-muted)] hover:text-[var(--text)]' : 'state-success text-[var(--text)] shadow-sm'
                }`}
              >
                Ingresos
              </button>
            </div>
          </div>

          {showTabEmptyState ? (
            <div className="card space-y-3">
              <h3 className="text-base font-semibold text-[var(--text)]">{emptyTabTitle}</h3>
              <div className="flex flex-wrap gap-2">
                {canSwitchToOtherTab && (
                  <button
                    className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-[var(--text)] hover:opacity-90"
                    onClick={() => handleMetricsTypeChange(isExpenseView ? 'income' : 'expense')}
                  >
                    {emptyTabSwitchLabel}
                  </button>
                )}
                <button
                  className="rounded-lg border border-[var(--card-border)] bg-[var(--input-bg)] px-3 py-2 text-sm font-semibold text-[var(--text)] hover:border-primary"
                  onClick={() => onViewMovements()}
                >
                  Ver movimientos
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {isExpenseView ? (
                <div className="card">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-[var(--text)]">
                      {hasBudget ? 'Presupuesto total' : 'Define tu presupuesto'}
                    </h3>
                    <span className="text-xs text-[var(--text-muted)]">{hasBudget ? 'Progreso' : 'Sin definir'}</span>
                  </div>

                  {hasBudget ? (
                    <>
                      <div className="flex items-center justify-between text-sm text-[var(--text-muted)]">
                        <span>Gastado</span>
                        <span className="text-[var(--text)]">
                          ${monthlyExpense.toLocaleString()} / ${budgetTotal.toLocaleString()}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-[var(--text-muted)]">
                        {budgetTotal - monthlyExpense >= 0
                          ? `Te quedan: $${Math.abs(budgetTotal - monthlyExpense).toLocaleString()}`
                          : `Exceso: $${Math.abs(budgetTotal - monthlyExpense).toLocaleString()}`}
                      </p>
                      <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-[var(--overlay-10)]">
                        <div
                          className={`progress-fill h-full rounded-full ${
                            budgetAlert === 'ok'
                              ? 'state-success'
                              : budgetAlert === 'warn'
                                ? 'state-warn'
                                : 'state-danger'
                          }`}
                          style={budgetProgressStyle}
                        />
                      </div>
                      {budgetAlert !== 'ok' && (
                        <p className="mt-2 text-xs font-semibold text-[var(--error-text)]">
                          {budgetAlert === 'warn'
                            ? 'Alerta: superaste el 80% de tu presupuesto.'
                            : 'Alerta: alcanzaste o superaste el 100% del presupuesto.'}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-[var(--text-muted)]">
                      Define un presupuesto total para ver tu progreso y alertas.
                    </p>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-[var(--text)] hover:opacity-90"
                      onClick={onAdjustBudget}
                    >
                      {hasBudget ? 'Editar presupuesto' : 'Definir presupuesto'}
                    </button>
                    {hasBudget && (
                      <button
                        className="rounded-lg border border-[var(--card-border)] bg-[var(--input-bg)] px-3 py-2 text-sm font-semibold text-[var(--text)] hover:border-primary"
                        onClick={() => onViewMovements()}
                      >
                        Ver movimientos
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="card">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-[var(--text)]">Ingresos del mes</h3>
                    <span className="text-xs text-[var(--text-muted)]">Resumen</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-[var(--overlay-5)] p-3">
                      <p className="text-xs text-[var(--text-muted)]">Total</p>
                      <p className="mt-1 text-base font-extrabold text-[var(--accent)]">
                        ${monthlyIncome.toLocaleString('es-CO')}
                      </p>
                    </div>
                    <div className="rounded-xl bg-[var(--overlay-5)] p-3">
                      <p className="text-xs text-[var(--text-muted)]">Promedio diario</p>
                      <p className="mt-1 text-base font-extrabold text-[var(--text)]">
                        ${avgDailyAmount.toLocaleString('es-CO')}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      className="rounded-lg border border-[var(--card-border)] bg-[var(--input-bg)] px-3 py-2 text-sm font-semibold text-[var(--text)] hover:border-primary"
                      onClick={() => onViewMovements()}
                    >
                      Ver movimientos
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {hasMetricsData && (
            <div className="card">
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-[var(--text)]">Evolución del mes</h3>
                  {trendInsight && <p className="text-xs text-[var(--text-muted)]">{trendInsight}</p>}
                </div>

                <div className="flex w-full rounded-lg border border-[var(--card-border)] bg-[var(--input-bg)] p-1 text-xs sm:w-auto">
                  <button
                    type="button"
                    aria-pressed={effectiveEvolutionView === 'daily'}
                    onClick={() => handleEvolutionToggle('daily')}
                    className={`flex-1 rounded-md px-3 py-2 font-semibold sm:flex-none ${
                      effectiveEvolutionView === 'daily' ? 'bg-primary text-[var(--text)]' : 'text-[var(--text)]'
                    }`}
                  >
                    Diario
                  </button>
                  <button
                    type="button"
                    aria-pressed={effectiveEvolutionView === 'cumulative'}
                    disabled={!canUseCumulative}
                    title={!canUseCumulative ? 'Define presupuesto para ver el acumulado.' : undefined}
                    onClick={() => handleEvolutionToggle('cumulative')}
                    className={`flex-1 rounded-md px-3 py-2 font-semibold sm:flex-none ${
                      effectiveEvolutionView === 'cumulative' ? 'bg-primary text-[var(--text)]' : 'text-[var(--text)]'
                    } ${!canUseCumulative ? 'cursor-not-allowed opacity-50' : ''}`}
                  >
                    Acumulado
                  </button>
                </div>
              </div>

              <div>
                <p className="text-xs uppercase text-[var(--text-muted)]">
                  {evolutionLabel}
                </p>
                {effectiveEvolutionView === 'cumulative' && isExpenseView && paceDiffCopy && (
                  <p className="mt-1 text-xs text-[var(--text-muted)]">{paceDiffCopy}</p>
                )}
                <EvolutionChart
                  view={effectiveEvolutionView}
                  selectedMonth={currentMonth}
                  isCurrentMonth={isCurrentMonth}
                  daily={dailyChartData}
                  cumulative={cumulativeChartData}
                  avgDailyAmount={avgDailyAmount}
                  budgetTotal={isExpenseView && hasBudget ? budgetTotal : undefined}
                  paceIdeal={isExpenseView ? paceIdeal : undefined}
                  metricLabel={evolutionMetricLabel}
                  tone={isExpenseView ? 'expense' : 'income'}
                />
                {effectiveEvolutionView === 'cumulative' && isExpenseView && hasBudget && (
                  <p className="mt-2 text-xs text-[var(--text-muted)]">Presupuesto: ${budgetTotal.toLocaleString('es-CO')}</p>
                )}
              </div>
            </div>
          )}

          {hasMetricsData && (
            <TopCategoriesChart
              title={topCategoriesTitle}
              items={categoryItems}
              mode={effectiveCategoriesMode}
              onModeChange={handleCategoriesModeChange}
              budgetModeAvailable={isExpenseView && budgetModeAvailable}
              onCategoryNavigate={(categoryId) => onViewMovements(categoryId, { suppressTxClick: true })}
              showViewAll={shouldShowViewAll}
              showModeToggle={isExpenseView}
              valueLabel={categoryValueLabel}
              onViewAll={() => {
                trackEvent('metrics_top_categories_modal_opened', {
                  selectedMonth: currentMonth,
                  categoryCount: categoryItems.length,
                });
                setShowCategoriesModal(true);
              }}
            />
          )}

          <AllCategoriesModal
            open={showCategoriesModal}
            selectedMonth={currentMonth}
            items={categoryItems}
            mode={effectiveCategoriesMode}
            onModeChange={handleCategoriesModeChange}
            budgetModeAvailable={isExpenseView && budgetModeAvailable}
            showModeToggle={isExpenseView}
            valueLabel={categoryValueLabel}
            onClose={() => {
              trackEvent('metrics_top_categories_modal_closed', { selectedMonth: currentMonth });
              setShowCategoriesModal(false);
            }}
            onViewMovements={onViewMovements}
          />
        </>
      )}
    </section>
  );
}









