import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchTransactionsRange, listenTransactions } from '../services/transactions';
import type { Budget, IaQuota, Template, Transaction } from '../types';
import { monthRangeIso, previousMonthRange } from '../utils/dates';
import { buildCategorySpendMap, sumByType, topCategories } from '../utils/txAgg';

export type SmartCard = {
  id: string;
  slot: 1 | 2 | 3 | 4;
  title: string;
  body: string;
  primaryAction: { label: string; onClick: () => void };
  secondaryAction?: { label: string; onClick: () => void };
};

export interface UseHomeMonthControllerParams {
  userId: string | null | undefined;
  currentMonth: string;
  budget: Budget | null;
  templates: Template[];
  transactions: Transaction[];
  iaQuota: IaQuota | null;
  formatPesos: (value?: number | null) => string;
  openBudgets: (category?: string) => void;
  openMovements: (category?: string) => void;
  openQuickAdd: (mode?: 'income' | 'expense') => void;
  openPlans: () => void;
  openAdvisor: (context?: Record<string, unknown>) => void;
  handleUseTemplate: (tpl: Template) => void;
}

export interface HomeMonthControllerResult {
  monthTransactions: Transaction[];
  monthlyExpense: number;
  monthlyIncome: number;
  availableBalance: number;
  topExpenses: { category: string; amount: number }[];
  categorySpendMap: Record<string, number>;
  previousMonth: { expense: number; income: number } | null;
  recurringTemplates: Template[];
  smartCards: SmartCard[];
  smartCardIndex: number;
  setSmartCardIndex: React.Dispatch<React.SetStateAction<number>>;
  handlePrevInsight: () => void;
  handleNextInsight: () => void;
  handleTouchStart: (e: React.TouchEvent<HTMLDivElement>) => void;
  handleTouchEnd: (e: React.TouchEvent<HTMLDivElement>) => void;
}

export function useHomeMonthController({
  userId,
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
}: UseHomeMonthControllerParams): HomeMonthControllerResult {
  const [homeMonthTransactions, setHomeMonthTransactions] = useState<Transaction[]>([]);
  const [previousMonth, setPreviousMonth] = useState<{ expense: number; income: number } | null>(null);
  const [smartCards, setSmartCards] = useState<SmartCard[]>([]);
  const [smartCardIndex, setSmartCardIndex] = useState(0);

  useEffect(() => {
    if (userId) return;
    const timeoutId = window.setTimeout(() => setHomeMonthTransactions([]), 0);
    return () => window.clearTimeout(timeoutId);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const { startDate: start, endDate: end } = monthRangeIso(currentMonth);
    const unsubscribe = listenTransactions({
      userId,
      startDate: start,
      endDate: end,
      onChange: (list) => setHomeMonthTransactions(list),
      onError: (err) => console.error('No pudimos cargar movimientos del mes', err),
    });
    return () => unsubscribe();
  }, [userId, currentMonth]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const range = previousMonthRange(currentMonth);
    fetchTransactionsRange({ userId, startDate: range.start, endDate: range.end })
      .then((prev) => {
        if (cancelled) return;
        const expense = sumByType(prev, 'expense');
        const income = sumByType(prev, 'income');
        setPreviousMonth({ expense, income });
      })
      .catch((err) => console.error(err));
    return () => {
      cancelled = true;
    };
  }, [currentMonth, userId]);

  const monthTransactions = useMemo(() => (userId ? homeMonthTransactions : []), [homeMonthTransactions, userId]);

  const monthlyExpense = useMemo(() => sumByType(monthTransactions, 'expense'), [monthTransactions]);
  const monthlyIncome = useMemo(() => sumByType(monthTransactions, 'income'), [monthTransactions]);
  const availableBalance = useMemo(() => monthlyIncome - monthlyExpense, [monthlyIncome, monthlyExpense]);

  const categorySpendMap = useMemo(() => buildCategorySpendMap(monthTransactions), [monthTransactions]);

  const topExpenses = useMemo(() => topCategories(categorySpendMap, 3), [categorySpendMap]);

  const recurringTemplates = useMemo(() => templates.filter((t) => t.recurring), [templates]);

  const [dayTick, setDayTick] = useState(0);

  useEffect(() => {
    const now = new Date();
    const nextMidnight = new Date(now);
    // Re-render una vez al día para recalcular cards si la app quedó abierta.
    nextMidnight.setHours(24, 0, 5, 0);
    const waitMs = Math.max(0, nextMidnight.getTime() - now.getTime());
    const timeoutId = window.setTimeout(() => setDayTick((t) => t + 1), waitMs);
    return () => window.clearTimeout(timeoutId);
  }, [dayTick]);

  const dayOfMonth = useMemo(() => {
    void dayTick;
    return new Date().getDate();
  }, [dayTick]);
  const daysElapsed = dayOfMonth;
  const todayStart = useMemo(() => {
    void dayTick;
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, [dayTick]);

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
        body: 'Elige 1-3 categorías clave y define un tope para este mes.',
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
        body: `No registras nada hace ${daysSinceLast} días. Antes de que se te olviden 👀`,
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
    const analyzeLimitReached = iaQuota?.analyzeLimit && iaQuota.analyzeLimit > 0 && iaQuota.analyzeUsed >= iaQuota.analyzeLimit;
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
      const diffText =
        diff === 0
          ? 'igual que el mes pasado.'
          : diff > 0
            ? `${formatPesos(absDiff)} más que el mes pasado.`
            : `${formatPesos(absDiff)} menos que el mes pasado.`;
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

    const timeoutId = window.setTimeout(() => setSmartCards(finalCards), 0);
    return () => window.clearTimeout(timeoutId);
  }, [
    budget?.perCategory,
    categorySpendMap,
    dayOfMonth,
    daysElapsed,
    calcNextDue,
    formatPesos,
    handleUseTemplate,
    iaQuota?.analyzeLimit,
    iaQuota?.analyzeUsed,
    monthTransactions,
    monthlyExpense,
    openAdvisor,
    openBudgets,
    openMovements,
    openPlans,
    openQuickAdd,
    previousMonth,
    recurringTemplates,
    topExpenses,
    todayStart,
    transactions,
  ]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setSmartCardIndex(0), 0);
    return () => window.clearTimeout(timeoutId);
  }, [smartCards.length]);

  const handlePrevInsight = useCallback(() => {
    if (smartCards.length === 0) return;
    setSmartCardIndex((i) => (i - 1 + smartCards.length) % smartCards.length);
  }, [smartCards.length]);

  const handleNextInsight = useCallback(() => {
    if (smartCards.length === 0) return;
    setSmartCardIndex((i) => (i + 1) % smartCards.length);
  }, [smartCards.length]);

  const touchStartX = useRef<number | null>(null);
  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (touchStartX.current === null) return;
      const delta = e.changedTouches[0].clientX - touchStartX.current;
      touchStartX.current = null;
      if (Math.abs(delta) < 30) return;
      if (delta < 0) handleNextInsight();
      else handlePrevInsight();
    },
    [handleNextInsight, handlePrevInsight],
  );

  return {
    monthTransactions,
    monthlyExpense,
    monthlyIncome,
    availableBalance,
    topExpenses,
    categorySpendMap,
    previousMonth,
    recurringTemplates,
    smartCards,
    smartCardIndex,
    setSmartCardIndex,
    handlePrevInsight,
    handleNextInsight,
    handleTouchStart,
    handleTouchEnd,
  };
}
