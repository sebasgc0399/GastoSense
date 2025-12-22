import type React from 'react';
import { BudgetCard } from '../components/BudgetCard';
import { RecurringTemplatesCard } from '../components/RecurringTemplatesCard';
import { ReferenceMonthCard } from '../components/ReferenceMonthCard';
import { TopExpensesChart } from '../components/TopExpensesChart';
import { CardStat } from '../components/stats/CardStat';
import { StatsSummaryCard } from '../components/stats/StatsSummaryCard';
import type { CategorySpendItem } from '../components/charts/CategorySpendChart';
import type { Budget, Template } from '../types';

type SmartCard = {
  id: string;
  slot: 1 | 2 | 3 | 4;
  title: string;
  body: string;
  primaryAction: { label: string; onClick: () => void };
  secondaryAction?: { label: string; onClick: () => void };
};

export interface HomePageProps {
  monthlyExpense: number;
  monthlyIncome: number;
  availableBalance: number;
  currentMonth: string;
  defaultMonth: string;
  setCurrentMonth: React.Dispatch<React.SetStateAction<string>>;
  budget: Budget | null;
  handleSaveBudget: (total: number) => Promise<void>;
  budgetSaving: boolean;
  onEditCategoryBudgets: () => void;
  topExpenseItems: CategorySpendItem[];
  smartCards: SmartCard[];
  smartCardIndex: number;
  setSmartCardIndex: React.Dispatch<React.SetStateAction<number>>;
  handlePrevInsight: () => void;
  handleNextInsight: () => void;
  handleTouchStart: (e: React.TouchEvent<HTMLDivElement>) => void;
  handleTouchEnd: (e: React.TouchEvent<HTMLDivElement>) => void;
  recurringTemplates: Template[];
  handleUseTemplate: (tpl: Template) => void;
  handleEditTemplate: (tpl: Template) => void;
  handleDeleteTemplate: (id: string) => Promise<void>;
}

export function HomePage({
  monthlyExpense,
  monthlyIncome,
  availableBalance,
  currentMonth,
  defaultMonth,
  setCurrentMonth,
  budget,
  handleSaveBudget,
  budgetSaving,
  onEditCategoryBudgets,
  topExpenseItems,
  smartCards,
  smartCardIndex,
  setSmartCardIndex,
  handlePrevInsight,
  handleNextInsight,
  handleTouchStart,
  handleTouchEnd,
  recurringTemplates,
  handleUseTemplate,
  handleEditTemplate,
  handleDeleteTemplate,
}: HomePageProps) {
  const summaryItems = [
    { label: 'Gasto mensual', value: monthlyExpense, tone: 'danger' as const },
    { label: 'Ingreso mensual', value: monthlyIncome, tone: 'success' as const },
    {
      label: 'Saldo disponible',
      value: availableBalance,
      tone: availableBalance >= 0 ? ('success' as const) : ('danger' as const),
    },
  ];

  return (
    <section className="space-y-4">
      <ReferenceMonthCard
        currentMonth={currentMonth}
        defaultMonth={defaultMonth}
        onChange={setCurrentMonth}
        description="Cambia el mes para ver presupuestos y totales."
      />

      <StatsSummaryCard className="sm:hidden" items={summaryItems} />

      <div className="hidden gap-3 sm:grid sm:grid-cols-3">
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

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <TopExpensesChart
          items={topExpenseItems}
          mode="spent"
          onModeChange={() => {}}
          budgetModeAvailable={false}
          showModeToggle={false}
          onEditBudgets={onEditCategoryBudgets}
        />
        <div className="card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[var(--text)]">Tarjetas inteligentes</h2>
            <span className="text-xs text-[var(--text-muted)]">Detectadas con datos reales</span>
          </div>
          <div className="space-y-3">
            {smartCards.length === 0 && <p className="text-sm text-[var(--text-muted)]">Sin alertas por ahora.</p>}
            {smartCards.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                  <span>{smartCards.length > 1 ? 'Desliza para ver más' : 'Sugerencia destacada'}</span>
                  {smartCards.length > 1 && (
                    <div className="flex gap-2">
                      <button
                        onClick={handlePrevInsight}
                        className="h-7 w-7 rounded-full border border-[var(--card-border)] bg-[var(--input-bg)] text-[var(--text)] hover:border-primary"
                        aria-label="Anterior"
                      >
                        <span aria-hidden="true" className="inline-block rotate-180">
                          ➜
                        </span>
                      </button>
                      <button
                        onClick={handleNextInsight}
                        className="h-7 w-7 rounded-full border border-[var(--card-border)] bg-[var(--input-bg)] text-[var(--text)] hover:border-primary"
                        aria-label="Siguiente"
                      >
                        <span aria-hidden="true">➜</span>
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
                        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-3 py-3">
                          <p className="text-sm font-semibold text-[var(--text)]">{item.title}</p>
                          <p className="text-sm text-[var(--text-muted)]">{item.body}</p>
                          <div className="mt-2 flex gap-2">
                            <button
                              className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white"
                              onClick={item.primaryAction.onClick}
                            >
                              {item.primaryAction.label}
                            </button>
                            {item.secondaryAction && (
                              <button
                                className="rounded-lg border border-[var(--card-border)] bg-[var(--input-bg)] px-3 py-2 text-xs font-semibold text-[var(--text)]"
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
                          className={`h-2 w-2 rounded-full border ${
                            idx === smartCardIndex
                              ? 'bg-primary border-primary'
                              : 'bg-[var(--input-bg)] border-[var(--card-border)]'
                          }`}
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

      <RecurringTemplatesCard
        templates={recurringTemplates}
        title="Recordatorios recurrentes"
        subtitle="Plantillas marcadas como recurrentes"
        emptyState="A£n no tienes plantillas recurrentes."
        onUseTemplate={handleUseTemplate}
        onEditTemplate={handleEditTemplate}
        onDeleteTemplate={handleDeleteTemplate}
      />
    </section>
  );
}
