import { useCallback, useEffect, useMemo, useState } from 'react';
import { callAnalyzeMonthlyDeep, callAnalyzeSummary } from '../services/functions';
import { fetchTransactionsRange } from '../services/transactions';
import { setUserAdvisorMode } from '../services/users';
import type { AdvisorMode, IaQuota, UserRole } from '../types';
import { todayIso } from '../utils/dates';

type ChatItem = {
  id: string;
  from: 'user' | 'ia';
  text: string;
  ts: number;
  tone?: AdvisorMode;
  kind?: 'action' | 'tx' | 'ia';
  chartTop?: { category: string; amount: number }[];
};

type AdvisorQuickAction = {
  label: string;
  description: string;
  action: string;
  locked: boolean;
  requiresAnalyze: boolean;
  badge?: string;
};

type FeatureLock = { id: string; title: string; description: string; badge: string };

export type LastTransactionSummary = {
  amount: number;
  category: string;
  type: 'expense' | 'income';
  date: string;
};

export interface UseAdvisorControllerParams {
  userId: string | null | undefined;
  profileAdvisorMode: AdvisorMode | null | undefined;
  userRole: UserRole | null | undefined;
  iaQuota: IaQuota | null;
  currentMonth: string;
  monthlyExpense: number;
  monthlyIncome: number;
  topCategories: { category: string; amount: number }[];
  budgetTotal: number | null | undefined;
  budgetPerCategory: Record<string, number> | null | undefined;
  previousMonth: { expense: number; income: number } | null;
  lastTransactions: LastTransactionSummary[];
  openUpgrade: (ctx: 'parse_exhausted' | 'analyze_exhausted' | 'feature_locked') => void;
  triggerUpgradeOnce: (ctx: 'parse_exhausted' | 'analyze_exhausted') => void;
  mapAiError: (err: unknown, kind?: 'parse' | 'analyze') => string;
  isResourceExhausted: (err: unknown) => boolean;
  refreshQuota: () => Promise<void>;
}

export interface AdvisorControllerResult {
  advisorMode: AdvisorMode;
  chatFeed: ChatItem[];
  advisorLoading: boolean;
  pushFeedItem: (item: Omit<ChatItem, 'id' | 'ts'> & { id?: string; ts?: number }) => void;
  handleToneChange: (mode: AdvisorMode) => Promise<void>;
  handleAdvisorAction: (action: string) => Promise<void>;
  advisorQuickActions: AdvisorQuickAction[];
  featureLocks: FeatureLock[];
  parseExhausted: boolean;
  analyzeExhausted: boolean;
}

export function useAdvisorController({
  userId,
  profileAdvisorMode,
  userRole,
  iaQuota,
  currentMonth,
  monthlyExpense,
  monthlyIncome,
  topCategories,
  budgetTotal,
  budgetPerCategory,
  previousMonth,
  lastTransactions,
  openUpgrade,
  triggerUpgradeOnce,
  mapAiError,
  isResourceExhausted,
  refreshQuota,
}: UseAdvisorControllerParams): AdvisorControllerResult {
  const [advisorMode, setAdvisorMode] = useState<AdvisorMode>(() => {
    try {
      const stored = localStorage.getItem('advisorMode');
      if (stored === 'amable' || stored === 'reganon') return stored;
    } catch {
      // ignore storage failures
    }
    return 'amable';
  });
  const [chatFeed, setChatFeed] = useState<ChatItem[]>([]);
  const [advisorLoading, setAdvisorLoading] = useState(false);

  useEffect(() => {
    if (profileAdvisorMode !== 'amable' && profileAdvisorMode !== 'reganon') return;
    setAdvisorMode(profileAdvisorMode);
    try {
      localStorage.setItem('advisorMode', profileAdvisorMode);
    } catch {
      // ignore storage failures
    }
  }, [profileAdvisorMode]);

  useEffect(() => {
    if (userId) return;
    const timeoutId = window.setTimeout(() => setChatFeed([]), 0);
    setAdvisorLoading(false);
    return () => window.clearTimeout(timeoutId);
  }, [userId]);

  const pushFeedItem = useCallback((item: Omit<ChatItem, 'id' | 'ts'> & { id?: string; ts?: number }) => {
    const id = item.id ?? `chat-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const ts = item.ts ?? Date.now();
    setChatFeed((prev) => {
      const next = [...prev, { ...item, id, ts }];
      return next.length > 50 ? next.slice(next.length - 50) : next;
    });
  }, []);

  const handleToneChange = useCallback(
    async (mode: AdvisorMode) => {
      if (mode === advisorMode) return;
      setAdvisorMode(mode);
      setChatFeed([]);
      try {
        localStorage.setItem('advisorMode', mode);
      } catch {
        // ignore storage failures
      }
      if (userId) {
        try {
          await setUserAdvisorMode(mode);
        } catch (err) {
          console.error('No pudimos guardar el tono en perfil', err);
        }
      }
    },
    [advisorMode, userId],
  );

  const iaRole: UserRole = (userRole as UserRole) || (iaQuota?.role as UserRole) || 'free';
  const isFreeRole = iaRole === 'free';
  const isManagedRole = ['paid_managed', 'gifted_managed', 'admin'].includes(iaRole);

  const parseExhausted =
    iaQuota?.parseLimit !== undefined && iaQuota?.parseLimit !== null ? iaQuota.parseUsed >= iaQuota.parseLimit : false;
  const analyzeExhausted =
    iaQuota?.analyzeLimit !== undefined && iaQuota?.analyzeLimit !== null
      ? iaQuota.analyzeUsed >= iaQuota.analyzeLimit
      : false;

  const advisorQuickActions: AdvisorQuickAction[] = useMemo(
    () => [
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
    ],
    [isFreeRole, isManagedRole],
  );

  const featureLocks: FeatureLock[] = useMemo(() => [], []);

  const handleAdvisorAction = useCallback(
    async (action: string) => {
      if (analyzeExhausted) {
        openUpgrade('analyze_exhausted');
        return;
      }
      try {
        if (!userId) {
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
          const txs = await fetchTransactionsRange({ userId, startDate: rangeStart, endDate: rangeEnd });

          const catMap: Record<string, { name: string; sums: number[]; isIncome?: boolean }> = {};
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
            last3Budgets: months.map((m) => (m === currentMonth && budgetPerCategory ? budgetPerCategory[c.name] ?? null : null)),
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
                typeof p.changePctVsAvg === 'number' ? `${p.changePctVsAvg > 0 ? '+' : ''}${Math.round(p.changePctVsAvg)}%` : '';
              const over =
                typeof p.overBudgetPct === 'number' && p.overBudgetPct > 0 ? `, sobre tope ${Math.round(p.overBudgetPct)}%` : '';
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
              topCategories: topCategories.slice(0, 3),
              budget: budgetTotal ?? undefined,
              lastTransactions: lastTransactions.slice(0, 3),
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
              ? topCategories.slice(0, 3).map((t) => ({ category: t.category, amount: t.amount }))
              : undefined,
          });
        }

        await refreshQuota();
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
    },
    [
      advisorMode,
      analyzeExhausted,
      budgetTotal,
      budgetPerCategory,
      currentMonth,
      isResourceExhausted,
      lastTransactions,
      mapAiError,
      monthlyExpense,
      monthlyIncome,
      openUpgrade,
      previousMonth,
      pushFeedItem,
      refreshQuota,
      topCategories,
      triggerUpgradeOnce,
      userId,
    ],
  );

  return {
    advisorMode,
    chatFeed,
    advisorLoading,
    pushFeedItem,
    handleToneChange,
    handleAdvisorAction,
    advisorQuickActions,
    featureLocks,
    parseExhausted,
    analyzeExhausted,
  };
}
