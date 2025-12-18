import { useCallback, useEffect, useMemo, useState } from 'react';
import { callAnalyzeSummary } from '../services/functions';
import { setUserAdvisorMode } from '../services/users';
import type { AdvisorMode, IaQuota, UserRole } from '../types';

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
  note?: string;
  type: 'expense' | 'income';
  date: string;
};

function compactNote(note?: string): string | undefined {
  if (typeof note !== 'string') return undefined;
  const cleaned = note.replace(/\s+/g, ' ').trim();
  if (!cleaned) return undefined;
  return cleaned.slice(0, 60);
}

function safeParseDateYYYYMMDD(input?: string): Date | null {
  if (!input || typeof input !== 'string') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return null;
  const d = new Date(`${input}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function subtractDaysIso(isoDate: string, days: number): string | null {
  const d = safeParseDateYYYYMMDD(isoDate);
  if (!d) return null;
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function selectLastDays(txs: LastTransactionSummary[], days: number): LastTransactionSummary[] {
  if (!Array.isArray(txs) || !txs.length) return [];
  let endDate: string | null = null;
  for (const t of txs) {
    if (!t?.date || typeof t.date !== 'string') continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t.date)) continue;
    if (!endDate || t.date > endDate) endDate = t.date;
  }
  if (!endDate) return txs;
  const startDate = subtractDaysIso(endDate, Math.max(0, days - 1));
  if (!startDate) return txs;
  return txs.filter((t) => typeof t.date === 'string' && t.date >= startDate && t.date <= endDate);
}

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
    ],
    [isFreeRole],
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

        const txsForAdvisor = action === 'Resumen semanal' ? selectLastDays(lastTransactions, 14) : lastTransactions;
        const resp = await callAnalyzeSummary({
          mode: advisorMode,
          action,
          summary: {
            month: currentMonth,
            totalExpense: monthlyExpense,
            totalIncome: monthlyIncome,
            topCategories: topCategories.slice(0, 3),
            budget: budgetTotal ?? undefined,
            lastTransactions: txsForAdvisor.map((tx) => {
              const note = compactNote(tx.note);
              return {
                amount: tx.amount,
                category: tx.category,
                type: tx.type,
                date: tx.date,
                ...(note ? { note } : {}),
              };
            }),
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
