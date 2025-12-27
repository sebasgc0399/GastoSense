import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { callAdvisorFreeChat, callAdvisorFreeChatGetSession, callAnalyzeSummary } from '../services/functions';
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
  actionData?: {
    type: 'NAVIGATE_FILTER' | 'OPEN_BUDGET' | 'OPEN_MODAL';
    label: string;
    payload: Record<string, unknown>;
  };
};

type AdvisorEnvironment = 'actions' | 'free_chat';

type FreeChatItem = {
  id: string;
  from: 'user' | 'ia';
  text: string;
  ts: number;
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

const FREE_CHAT_STORAGE_PREFIX = 'advisor_free_chat_session:';

function createSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getFreeChatStorageKey(userId: string): string {
  return `${FREE_CHAT_STORAGE_PREFIX}${userId}`;
}


export interface UseAdvisorControllerParams {
  userId: string | null | undefined;
  canFreeChat: boolean;
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
  mapAiError: (err: unknown, kind?: 'parse' | 'analyze' | 'free_chat') => string;
  isResourceExhausted: (err: unknown) => boolean;
  refreshQuota: () => Promise<void>;
}

export interface AdvisorControllerResult {
  advisorMode: AdvisorMode;
  advisorEnvironment: AdvisorEnvironment;
  chatFeed: ChatItem[];
  freeChatFeed: FreeChatItem[];
  advisorLoading: boolean;
  freeChatLoading: boolean;
  pushFeedItem: (item: Omit<ChatItem, 'id' | 'ts'> & { id?: string; ts?: number }) => void;
  handleFreeChatSend: (payload: { message: string; from: string; to: string }) => Promise<void>;
  handleFreeChatReset: () => void;
  handleFreeChatRecover: () => Promise<{
    recovered: boolean;
    rangeFrom?: string;
    rangeTo?: string;
  }>;
  setAdvisorEnvironment: (env: AdvisorEnvironment) => void;
  handleToneChange: (mode: AdvisorMode) => Promise<void>;
  handleAdvisorAction: (action: string) => Promise<void>;
  advisorQuickActions: AdvisorQuickAction[];
  featureLocks: FeatureLock[];
  parseExhausted: boolean;
  analyzeExhausted: boolean;
}

export function useAdvisorController({
  userId,
  canFreeChat,
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
  const [advisorEnvironment, setAdvisorEnvironment] = useState<AdvisorEnvironment>('actions');
  const [chatFeed, setChatFeed] = useState<ChatItem[]>([]);
  const [freeChatFeed, setFreeChatFeed] = useState<FreeChatItem[]>([]);
  const [advisorLoading, setAdvisorLoading] = useState(false);
  const [freeChatLoading, setFreeChatLoading] = useState(false);
  const [freeChatSessionId, setFreeChatSessionId] = useState<string | null>(null);
  const activeModeRef = useRef<AdvisorMode>(advisorMode);
  const requestSeqRef = useRef(0);
  const freeChatRequestSeqRef = useRef(0);

  useEffect(() => {
    activeModeRef.current = advisorMode;
  }, [advisorMode]);

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
    const timeoutId = window.setTimeout(() => {
      setChatFeed([]);
      setFreeChatFeed([]);
    }, 0);
    setAdvisorLoading(false);
    setFreeChatLoading(false);
    setFreeChatSessionId(null);
    setAdvisorEnvironment('actions');
    return () => window.clearTimeout(timeoutId);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(getFreeChatStorageKey(userId));
    } catch {
      // ignore storage failures
    }
    if (stored) {
      setFreeChatSessionId(stored);
      return;
    }
    const created = createSessionId();
    setFreeChatSessionId(created);
    try {
      localStorage.setItem(getFreeChatStorageKey(userId), created);
    } catch {
      // ignore storage failures
    }
  }, [userId]);

  useEffect(() => {
    if (!canFreeChat && advisorEnvironment === 'free_chat') {
      setAdvisorEnvironment('actions');
    }
  }, [advisorEnvironment, canFreeChat]);

  const pushFeedItem = useCallback((item: Omit<ChatItem, 'id' | 'ts'> & { id?: string; ts?: number }) => {
    const id = item.id ?? `chat-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const ts = item.ts ?? Date.now();
    setChatFeed((prev) => {
      const next = [...prev, { ...item, id, ts }];
      return next.length > 50 ? next.slice(next.length - 50) : next;
    });
  }, []);

  const pushFreeChatItem = useCallback((item: Omit<FreeChatItem, 'id' | 'ts'> & { id?: string; ts?: number }) => {
    const id = item.id ?? `free-chat-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const ts = item.ts ?? Date.now();
    setFreeChatFeed((prev) => {
      const next = [...prev, { ...item, id, ts }];
      return next.length > 50 ? next.slice(next.length - 50) : next;
    });
  }, []);

  const handleToneChange = useCallback(
    async (mode: AdvisorMode) => {
      if (mode === advisorMode) return;
      // Invalida cualquier respuesta en vuelo para evitar que aparezca en un modo distinto.
      requestSeqRef.current += 1;
      setAdvisorLoading(false);
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

  const handleFreeChatSend = useCallback(
    async ({ message, from, to }: { message: string; from: string; to: string }) => {
      const trimmed = message.trim();
      if (!trimmed) return;
      if (!userId) {
        pushFreeChatItem({
          from: 'ia',
          text: 'Inicia sesion para usar Chat libre.',
        });
        return;
      }
      let sessionId = freeChatSessionId;
      if (!sessionId) {
        sessionId = createSessionId();
        setFreeChatSessionId(sessionId);
        try {
          localStorage.setItem(getFreeChatStorageKey(userId), sessionId);
        } catch {
          // ignore storage failures
        }
      }
      const requestSeq = (freeChatRequestSeqRef.current += 1);
      setFreeChatLoading(true);
      pushFreeChatItem({ from: 'user', text: trimmed });
      try {
        const resp = await callAdvisorFreeChat({
          sessionId,
          message: trimmed,
          tone: advisorMode,
          from,
          to,
        });
        const data = resp.data as { message?: string };
        const cleanText = (data?.message ?? '').trim() || 'Sin respuesta de IA.';
        if (freeChatRequestSeqRef.current !== requestSeq) return;
        pushFreeChatItem({ from: 'ia', text: cleanText });
      } catch (err) {
        if (freeChatRequestSeqRef.current !== requestSeq) return;
        pushFreeChatItem({ from: 'ia', text: mapAiError(err, 'free_chat') });
      } finally {
        if (freeChatRequestSeqRef.current === requestSeq) {
          setFreeChatLoading(false);
        }
      }
    },
    [advisorMode, freeChatSessionId, mapAiError, pushFreeChatItem, userId],
  );

  const handleFreeChatReset = useCallback(() => {
    freeChatRequestSeqRef.current += 1;
    setFreeChatLoading(false);
    setFreeChatFeed([]);
    if (!userId) {
      setFreeChatSessionId(null);
      return;
    }
    const nextSessionId = createSessionId();
    setFreeChatSessionId(nextSessionId);
    try {
      localStorage.setItem(getFreeChatStorageKey(userId), nextSessionId);
    } catch {
      // ignore storage failures
    }
  }, [userId]);

  const handleFreeChatRecover = useCallback(async () => {
    if (!userId) {
      pushFreeChatItem({
        from: 'ia',
        text: 'Inicia sesion para recuperar el chat.',
      });
      return { recovered: false };
    }
    const requestSeq = (freeChatRequestSeqRef.current += 1);
    setFreeChatLoading(true);
    try {
      const resp = await callAdvisorFreeChatGetSession({});
      const data = resp.data as {
        sessionId?: string;
        rangeFrom?: string | null;
        rangeTo?: string | null;
        lastTurns?: Array<{ role?: 'user' | 'assistant'; text?: string; at?: number }>;
      };
      const recoveredSessionId = typeof data?.sessionId === 'string' ? data.sessionId : createSessionId();
      const turns = Array.isArray(data?.lastTurns) ? data.lastTurns : [];
      const mapped: FreeChatItem[] = turns
        .filter((t) => t?.role === 'user' || t?.role === 'assistant')
        .map((t, index) => {
          const from: FreeChatItem['from'] = t.role === 'assistant' ? 'ia' : 'user';
          return {
            id: `recover-${recoveredSessionId}-${index}`,
            from,
            text: typeof t?.text === 'string' ? t.text : '',
            ts: typeof t?.at === 'number' && Number.isFinite(t.at) ? t.at : Date.now(),
          };
        })
        .filter((t) => t.text);

      if (freeChatRequestSeqRef.current !== requestSeq) {
        return { recovered: false };
      }

      setFreeChatFeed(mapped);
      setFreeChatSessionId(recoveredSessionId);
      try {
        localStorage.setItem(getFreeChatStorageKey(userId), recoveredSessionId);
      } catch {
        // ignore storage failures
      }
      return {
        recovered: true,
        rangeFrom: typeof data?.rangeFrom === 'string' ? data.rangeFrom : undefined,
        rangeTo: typeof data?.rangeTo === 'string' ? data.rangeTo : undefined,
      };
    } catch (err) {
      if (freeChatRequestSeqRef.current !== requestSeq) {
        return { recovered: false };
      }
      const codeRaw = (err as { code?: unknown } | null)?.code;
      const code = typeof codeRaw === 'string' ? codeRaw : '';
      if (code.includes('not-found')) {
        pushFreeChatItem({
          from: 'ia',
          text: 'No encontramos un chat anterior para recuperar.',
        });
        return { recovered: false };
      }
      pushFreeChatItem({
        from: 'ia',
        text: mapAiError(err, 'free_chat'),
      });
      return { recovered: false };
    } finally {
      if (freeChatRequestSeqRef.current === requestSeq) {
        setFreeChatLoading(false);
      }
    }
  }, [mapAiError, pushFreeChatItem, userId]);

  const iaRole: UserRole = (userRole as UserRole) || 'free';
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
      const requestMode = advisorMode;
      const requestSeq = (requestSeqRef.current += 1);
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

        const rawText = data?.message ?? 'Sin respuesta de IA.';
        let workingText = rawText;

        const actionRegex = /\[ACTION_DATA\]\s*(\{[\s\S]*\})\s*$/;
        const actionMatch = workingText.match(actionRegex);

        let dynamicActionData: ChatItem['actionData'];
        let dynamicChartData: { category: string; amount: number }[] | undefined;

        if (actionMatch && actionMatch[1]) {
          workingText = workingText.replace(actionMatch[0], '').trim();
          try {
            const rawJson = actionMatch[1];
            let parsed: unknown;
            try {
              parsed = JSON.parse(rawJson);
            } catch {
              parsed = JSON.parse(rawJson.replace(/'/g, '"'));
            }

            const obj = parsed as { type?: unknown; label?: unknown; payload?: unknown } | null;
            const type = typeof obj?.type === 'string' ? obj.type : null;
            const label = typeof obj?.label === 'string' ? obj.label.trim() : null;
            const payload = obj?.payload;

            const allowedTypes = ['NAVIGATE_FILTER', 'OPEN_BUDGET', 'OPEN_MODAL'] as const;
            const isAllowedType = (t: string): t is (typeof allowedTypes)[number] =>
              (allowedTypes as readonly string[]).includes(t);

            if (
              type &&
              isAllowedType(type) &&
              label &&
              payload &&
              typeof payload === 'object' &&
              !Array.isArray(payload)
            ) {
              dynamicActionData = {
                type,
                label,
                payload: payload as Record<string, unknown>,
              };
            }
          } catch (e) {
            console.error('Error parsing action data', e);
          }
        }

        const chartRegex = /\[CHART_DATA\]\s*(\[[\s\S]*?\])\s*$/;
        const chartMatch = workingText.match(chartRegex);

        if (chartMatch && chartMatch[1]) {
          workingText = workingText.replace(chartMatch[0], '').trim();
          try {
            const rawJson = chartMatch[1];
            let parsed: unknown;
            try {
              parsed = JSON.parse(rawJson);
            } catch {
              parsed = JSON.parse(rawJson.replace(/'/g, '"'));
            }

            if (Array.isArray(parsed)) {
              const mapped = parsed
                .map((d) => {
                  const item = (d ?? {}) as { label?: unknown; value?: unknown };
                  const label = typeof item.label === 'string' ? item.label.trim() : '';
                  const valueRaw = item.value;
                  const value =
                    typeof valueRaw === 'number'
                      ? valueRaw
                      : typeof valueRaw === 'string'
                        ? Number(valueRaw)
                        : NaN;
                  if (!label || !Number.isFinite(value)) return null;
                  return { category: label, amount: value };
                })
                .filter((x): x is { category: string; amount: number } => Boolean(x));

              if (mapped.length) {
                dynamicChartData = mapped;
              }
            }
          } catch (e) {
            console.error('Error parsing chart data', e);
          }
        }

        const cleanText = workingText.trim() || 'Sin respuesta de IA.';

        if (activeModeRef.current !== requestMode || requestSeqRef.current !== requestSeq) {
          console.log('Respuesta descartada por cambio de modo');
          await refreshQuota();
          return;
        }

        pushFeedItem({
          from: 'ia',
          text: cleanText,
          tone: advisorMode,
          kind: 'ia',
          chartTop: dynamicChartData,
          actionData: dynamicActionData,
        });

        await refreshQuota();
      } catch (err) {
        console.error(err);
        if (activeModeRef.current !== requestMode || requestSeqRef.current !== requestSeq) {
          console.log('Error descartado por cambio de modo');
          return;
        }
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
        if (requestSeqRef.current === requestSeq) {
          setAdvisorLoading(false);
        }
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
    advisorEnvironment,
    chatFeed,
    freeChatFeed,
    advisorLoading,
    freeChatLoading,
    pushFeedItem,
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
  };
}
