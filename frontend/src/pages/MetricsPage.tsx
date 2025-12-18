import { useEffect, useMemo, useState } from 'react';
import type React from 'react';
import { AllCategoriesModal } from '../components/AllCategoriesModal';
import { EvolutionChart } from '../components/charts/EvolutionChart';
import type { CategorySpendItem, CategorySpendMode } from '../components/charts/CategorySpendChart';
import { TopExpensesChart } from '../components/TopExpensesChart';
import { CardStat } from '../components/stats/CardStat';
import { shouldShowIncomeAndBalance } from './metricsRules';
import { trackEvent } from '../services/analytics';
import type { Budget, Transaction } from '../types';
import { monthRangeIso, todayIso } from '../utils/dates';
import { buildCumulativeSeries, buildDailyExpenseSeries, buildIdealBudgetPaceSeries, hasType } from '../utils/txAgg';

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
  previousMonth: { expense: number; income: number } | null;
  onOpenQuickAdd: () => void;
  onViewMovements: () => void;
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
  previousMonth,
  onOpenQuickAdd,
  onViewMovements,
  onAdjustBudget,
}: MetricsPageProps) {
  const txCount = monthTransactions.length;
  const hasIncome = shouldShowIncomeAndBalance(monthTransactions, monthlyIncome);
  const hasExpenses = monthlyExpense > 0 || hasType(monthTransactions, 'expense');
  const [showCategoriesModal, setShowCategoriesModal] = useState(false);
  const isCurrentMonth = currentMonth === todayIso().slice(0, 7);
  const expenseTitle = isCurrentMonth ? 'Gasto del mes (hasta hoy)' : 'Gasto del mes';
  const incomeTitle = isCurrentMonth ? 'Ingresos del mes (hasta hoy)' : 'Ingresos del mes';

  const budgetTotal = budget?.total ?? 0;
  const hasBudget = budgetTotal > 0;
  const budgetProgress = hasBudget ? Math.min(monthlyExpense / budgetTotal, 1.2) : 0;
  const budgetAlert = !hasBudget ? 'none' : budgetProgress >= 1 ? 'max' : budgetProgress >= 0.8 ? 'warn' : 'ok';

  const previousMonthExpense = previousMonth?.expense ?? 0;
  const hasPreviousMonthRef = previousMonthExpense > 0;
  const expenseDelta = hasPreviousMonthRef ? monthlyExpense - previousMonthExpense : 0;
  const expenseDeltaPct = hasPreviousMonthRef ? Math.round((expenseDelta / previousMonthExpense) * 100) : 0;
  const trendInsight = !hasPreviousMonthRef
    ? 'Sin referencia del mes anterior.'
    : expenseDelta === 0
      ? '0% (sin cambios) vs mes anterior.'
      : expenseDelta > 0
        ? `\u2191 ${Math.abs(expenseDeltaPct)}% (+$${Math.abs(expenseDelta).toLocaleString('es-CO')}) vs mes anterior.`
        : `\u2193 ${Math.abs(expenseDeltaPct)}% (-$${Math.abs(expenseDelta).toLocaleString('es-CO')}) vs mes anterior.`;

  const budgetModeAvailable = useMemo(() => {
    const perCategory = budget?.perCategory;
    if (!perCategory) return false;
    return Object.values(perCategory).some((value) => Number(value) > 0);
  }, [budget?.perCategory]);

  const [categoriesMode, setCategoriesMode] = useState<CategorySpendMode>('spent');
  const effectiveCategoriesMode: CategorySpendMode = budgetModeAvailable ? categoriesMode : 'spent';

  const spentCategoryItems = useMemo<CategorySpendItem[]>(
    () => expenseCategories.filter((c) => c.amount > 0).map((c) => ({ category: c.category, spent: c.amount })),
    [expenseCategories],
  );

  const budgetCategoryItems = useMemo<CategorySpendItem[]>(() => {
    const spendMap: Record<string, number> = {};
    for (const item of expenseCategories) spendMap[item.category] = item.amount;

    const perCategory = budget?.perCategory ?? {};
    const cats = new Set<string>([...Object.keys(spendMap), ...Object.keys(perCategory)]);

    const union: CategorySpendItem[] = [];
    cats.forEach((category) => {
      const spent = spendMap[category] ?? 0;
      const rawBudget = (perCategory as Record<string, unknown>)[category];
      const budgetValue = typeof rawBudget === 'number' ? rawBudget : Number(rawBudget);
      const normalizedBudget = Number.isFinite(budgetValue) && budgetValue > 0 ? budgetValue : undefined;
      if (spent <= 0 && !normalizedBudget) return;
      union.push({ category, spent, budget: normalizedBudget });
    });

    union.sort((a, b) => {
      if (b.spent !== a.spent) return b.spent - a.spent;
      if (a.spent === 0 && b.spent === 0) return (b.budget ?? 0) - (a.budget ?? 0) || a.category.localeCompare(b.category);
      return a.category.localeCompare(b.category);
    });
    return union;
  }, [budget?.perCategory, expenseCategories]);

  const categoryItems = effectiveCategoriesMode === 'spent' ? spentCategoryItems : budgetCategoryItems;
  const shouldShowViewAll = categoryItems.length > 3;

  type EvolutionView = 'daily' | 'cumulative';
  const [evolutionView, setEvolutionView] = useState<EvolutionView>('daily');
  const effectiveEvolutionView: EvolutionView = hasBudget ? evolutionView : 'daily';
  const { startDate: monthStart, endDate: monthEnd } = useMemo(() => monthRangeIso(currentMonth), [currentMonth]);
  const dailyExpenses = useMemo(
    () => buildDailyExpenseSeries(monthTransactions, monthStart, monthEnd),
    [monthEnd, monthStart, monthTransactions],
  );
  const cumulativeExpenses = useMemo(() => buildCumulativeSeries(dailyExpenses), [dailyExpenses]);

  const dailyChartData = useMemo(
    () => dailyExpenses.map((day) => ({ ...day, day: Number(day.date.slice(8)) })),
    [dailyExpenses],
  );
  const cumulativeChartData = useMemo(
    () => cumulativeExpenses.map((day) => ({ ...day, day: Number(day.date.slice(8)) })),
    [cumulativeExpenses],
  );

  const totalDailyExpense = useMemo(() => dailyExpenses.reduce((acc, day) => acc + day.amount, 0), [dailyExpenses]);
  const avgDailyExpense = dailyExpenses.length ? Math.round(totalDailyExpense / dailyExpenses.length) : 0;

  const paceIdeal = useMemo(() => {
    if (!hasBudget || !isCurrentMonth || !cumulativeExpenses.length) return undefined;
    const raw = buildIdealBudgetPaceSeries(
      cumulativeExpenses.map((day) => day.date),
      currentMonth,
      budgetTotal,
    );
    return raw.map((day) => ({ ...day, day: Number(day.date.slice(8)) }));
  }, [budgetTotal, cumulativeExpenses, currentMonth, hasBudget, isCurrentMonth]);

  const paceDiffCopy = useMemo(() => {
    if (!paceIdeal?.length || !cumulativeExpenses.length) return null;
    const idealAtEnd = paceIdeal[paceIdeal.length - 1].amount;
    const actualAtEnd = cumulativeExpenses[cumulativeExpenses.length - 1].amount;
    const diff = actualAtEnd - idealAtEnd;
    const abs = Math.abs(diff);
    const sign = diff >= 0 ? '+' : '-';
    return `Vas ${sign}$${abs.toLocaleString('es-CO')} vs ritmo ideal.`;
  }, [cumulativeExpenses, paceIdeal]);

  useEffect(() => {
    if (!hasExpenses) return;
    trackEvent('metrics_evolution_viewed', { selectedMonth: currentMonth, hasBudget, hasExpenses });
  }, [currentMonth, hasBudget, hasExpenses]);

  const handleEvolutionToggle = (next: EvolutionView) => {
    if (next === evolutionView) return;
    if (next === 'cumulative' && !hasBudget) return;
    setEvolutionView(next);
    trackEvent('metrics_evolution_toggled', { selectedMonth: currentMonth, view: next });
  };

  const handleCategoriesModeChange = (next: CategorySpendMode) => {
    if (next === categoriesMode) return;
    if (next === 'budget' && !budgetModeAvailable) return;
    setCategoriesMode(next);
  };

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-white">{'M\u00E9tricas'}</h2>
        <p className="text-xs text-slate-400">Visualiza tu mes en segundos.</p>
      </div>

      <div className="card flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase text-[var(--text-muted)]">Mes de referencia</p>
          <p className="text-sm text-[var(--text-muted)]">Cambia el mes para ver totales y comparativos.</p>
        </div>
        <input
          type="month"
          value={currentMonth}
          onChange={(e) => setCurrentMonth(e.target.value || defaultMonth)}
          className="input w-full sm:w-auto sm:min-w-[180px]"
        />
      </div>

      {txCount === 0 ? (
        <div className="card space-y-2">
          <h3 className="text-base font-semibold text-white">{'A\u00FAn no hay datos'}</h3>
          <p className="text-sm text-[var(--text-muted)]">{'Registra tu primer gasto para empezar a ver m\u00E9tricas.'}</p>
          <div className="flex flex-wrap gap-2">
            <button
              className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
              onClick={onOpenQuickAdd}
            >
              Registrar mi primer gasto
            </button>
            <button
              className="rounded-lg border border-[var(--card-border)] bg-[var(--input-bg)] px-3 py-2 text-sm font-semibold text-[var(--text)] hover:border-primary"
              onClick={onViewMovements}
            >
              Ver movimientos
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className={`grid grid-cols-1 gap-3 ${hasIncome ? 'sm:grid-cols-3' : 'sm:grid-cols-1'}`}>
            <CardStat title={expenseTitle} value={monthlyExpense} tone="danger" subtitle="Total de gastos del periodo." />
            {hasIncome && <CardStat title={incomeTitle} value={monthlyIncome} tone="success" subtitle="Total de ingresos." />}
            {hasIncome && (
              <CardStat
                title="Balance"
                value={availableBalance}
                tone={availableBalance >= 0 ? 'success' : 'danger'}
                subtitle="Ingresos - Gastos del periodo."
              />
            )}
          </div>

          <div className="grid grid-cols-1 gap-3">
            <div className="card">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">{hasBudget ? 'Presupuesto total' : 'Define tu presupuesto'}</h3>
                <span className="text-xs text-[var(--muted)]">{hasBudget ? 'Progreso' : 'Sin definir'}</span>
              </div>

              {hasBudget ? (
                <>
                  <div className="flex items-center justify-between text-sm text-[var(--muted)]">
                    <span>Gastado</span>
                    <span className="text-white">
                      ${monthlyExpense.toLocaleString()} / ${budgetTotal.toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className={`h-full rounded-full ${
                        budgetAlert === 'ok' ? 'bg-emerald-500' : budgetAlert === 'warn' ? 'bg-amber-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${Math.min(budgetProgress * 100, 120)}%` }}
                    />
                  </div>
                  {budgetAlert !== 'ok' && (
                    <p className="mt-2 text-xs font-semibold text-red-200">
                      {budgetAlert === 'warn'
                        ? 'Alerta: superaste el 80% de tu presupuesto.'
                        : 'Alerta: alcanzaste o superaste el 100% del presupuesto.'}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-[var(--text-muted)]">Define un presupuesto total para ver tu progreso y alertas.</p>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
                  onClick={onAdjustBudget}
                >
                  Ajustar presupuesto
                </button>
                {hasBudget && (
                  <button
                    className="rounded-lg border border-[var(--card-border)] bg-[var(--input-bg)] px-3 py-2 text-sm font-semibold text-[var(--text)] hover:border-primary"
                    onClick={onViewMovements}
                  >
                    Ver movimientos
                  </button>
                )}
              </div>
            </div>

          </div>

          {hasExpenses && (
            <div className="card">
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white">{'Evoluci\u00F3n del mes'}</h3>
                  {trendInsight && <p className="text-xs text-[var(--muted)]">{trendInsight}</p>}
                </div>

                <div className="flex w-full rounded-lg border border-[var(--card-border)] bg-[var(--input-bg)] p-1 text-xs sm:w-auto">
                  <button
                    type="button"
                    aria-pressed={effectiveEvolutionView === 'daily'}
                    onClick={() => handleEvolutionToggle('daily')}
                    className={`flex-1 rounded-md px-3 py-2 font-semibold sm:flex-none ${
                      effectiveEvolutionView === 'daily' ? 'bg-primary text-white' : 'text-[var(--text)]'
                    }`}
                  >
                    Diario
                  </button>
                  <button
                    type="button"
                    aria-pressed={effectiveEvolutionView === 'cumulative'}
                    disabled={!hasBudget}
                    title={!hasBudget ? 'Define presupuesto para ver el acumulado.' : undefined}
                    onClick={() => handleEvolutionToggle('cumulative')}
                    className={`flex-1 rounded-md px-3 py-2 font-semibold sm:flex-none ${
                      effectiveEvolutionView === 'cumulative' ? 'bg-primary text-white' : 'text-[var(--text)]'
                    } ${!hasBudget ? 'cursor-not-allowed opacity-50' : ''}`}
                  >
                    Acumulado
                  </button>
                </div>
              </div>

              <div>
                <p className="text-xs uppercase text-[var(--muted)]">
                  {effectiveEvolutionView === 'daily' ? 'GASTO DIARIO DEL MES' : 'ACUMULADO VS PRESUPUESTO'}
                </p>
                {effectiveEvolutionView === 'cumulative' && paceDiffCopy && (
                  <p className="mt-1 text-xs text-[var(--muted)]">{paceDiffCopy}</p>
                )}
                <EvolutionChart
                  view={effectiveEvolutionView}
                  selectedMonth={currentMonth}
                  isCurrentMonth={isCurrentMonth}
                  daily={dailyChartData}
                  cumulative={cumulativeChartData}
                  avgDailyExpense={avgDailyExpense}
                  budgetTotal={hasBudget ? budgetTotal : undefined}
                  paceIdeal={paceIdeal}
                />
                {effectiveEvolutionView === 'cumulative' && hasBudget && (
                  <p className="mt-2 text-xs text-[var(--muted)]">Presupuesto: ${budgetTotal.toLocaleString('es-CO')}</p>
                )}
              </div>
            </div>
          )}

          {hasExpenses && (
            <TopExpensesChart
              items={categoryItems}
              mode={effectiveCategoriesMode}
              onModeChange={handleCategoriesModeChange}
              budgetModeAvailable={budgetModeAvailable}
              showViewAll={shouldShowViewAll}
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
            budgetModeAvailable={budgetModeAvailable}
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
