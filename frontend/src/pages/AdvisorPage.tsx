import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ArrowDown, Lock, SendHorizontal } from 'lucide-react';
import { FeatureLockCard } from '../components/FeatureLockCard';
import { RobotAvatar } from '../components/RobotAvatar';
import type { AdvisorMode } from '../types';
import { monthStartIso, todayIso } from '../utils/dates';

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

function parseIsoDate(input?: string): Date | null {
  if (!input || typeof input !== 'string') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return null;
  const d = new Date(`${input}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function diffDaysInclusive(from: string, to: string): number | null {
  const start = parseIsoDate(from);
  const end = parseIsoDate(to);
  if (!start || !end) return null;
  const diffMs = end.getTime() - start.getTime();
  if (diffMs < 0) return null;
  return Math.floor(diffMs / 86_400_000) + 1;
}

function validateFreeChatRange(from: string, to: string): string | null {
  if (!from || !to) return 'Selecciona desde y hasta.';
  const days = diffDaysInclusive(from, to);
  if (days === null) return 'La fecha desde no puede ser mayor que hasta.';
  if (days > 31) return 'El rango maximo es 31 dias.';
  return null;
}

export interface AdvisorPageProps {
  advisorMode: AdvisorMode;
  advisorEnvironment: AdvisorEnvironment;
  setAdvisorEnvironment: (env: AdvisorEnvironment) => void;
  canFreeChat: boolean;
  freeChatNeedsKey: boolean;
  onOpenSettings: () => void;
  handleToneChange: (mode: AdvisorMode) => Promise<void>;
  advisorQuickActions: AdvisorQuickAction[];
  analyzeExhausted: boolean;
  openUpgrade: (ctx: 'parse_exhausted' | 'analyze_exhausted' | 'feature_locked') => void;
  handleAdvisorAction: (action: string) => Promise<void>;
  handleFreeChatSend: (payload: { message: string; from: string; to: string }) => Promise<void>;
  handleFreeChatReset: () => void;
  handleFreeChatRecover: () => Promise<{ recovered: boolean; rangeFrom?: string; rangeTo?: string }>;
  onActionClick: (actionData: NonNullable<ChatItem['actionData']>) => void;
  featureLocks: FeatureLock[];
  chatFeed: ChatItem[];
  freeChatFeed: FreeChatItem[];
  advisorLoading: boolean;
  freeChatLoading: boolean;
  formatPesos: (value?: number | null) => string;
}

export function AdvisorPage({
  advisorMode,
  advisorEnvironment,
  setAdvisorEnvironment,
  canFreeChat,
  freeChatNeedsKey,
  onOpenSettings,
  handleToneChange,
  advisorQuickActions,
  analyzeExhausted,
  openUpgrade,
  handleAdvisorAction,
  handleFreeChatSend,
  handleFreeChatReset,
  handleFreeChatRecover,
  onActionClick,
  featureLocks,
  chatFeed,
  freeChatFeed,
  advisorLoading,
  freeChatLoading,
  formatPesos,
}: AdvisorPageProps) {
  const [actionsExpanded, setActionsExpanded] = useState(false);
  const [actionsNearBottom, setActionsNearBottom] = useState(true);
  const [actionsLastSeenCount, setActionsLastSeenCount] = useState(0);
  const actionsFeedRef = useRef<HTMLDivElement | null>(null);
  const [freeChatFrom, setFreeChatFrom] = useState(() => monthStartIso());
  const [freeChatTo, setFreeChatTo] = useState(() => todayIso());
  const [freeChatMessage, setFreeChatMessage] = useState('');
  const [freeChatExpanded, setFreeChatExpanded] = useState(false);
  const [freeChatNearBottom, setFreeChatNearBottom] = useState(true);
  const [freeChatLastSeenCount, setFreeChatLastSeenCount] = useState(0);
  const freeChatFeedRef = useRef<HTMLDivElement | null>(null);
  const freeChatInputRef = useRef<HTMLTextAreaElement | null>(null);
  const actionsMaxVisible = 10;
  const actionsHiddenCount = Math.max(0, chatFeed.length - actionsMaxVisible);
  const actionsVisible = actionsExpanded || actionsHiddenCount === 0 ? chatFeed : chatFeed.slice(-actionsMaxVisible);
  const actionsHasNew = !actionsNearBottom && chatFeed.length > actionsLastSeenCount;
  const freeChatRangeError = useMemo(
    () => validateFreeChatRange(freeChatFrom, freeChatTo),
    [freeChatFrom, freeChatTo],
  );
  const freeChatMaxVisible = 10;
  const freeChatHiddenCount = Math.max(0, freeChatFeed.length - freeChatMaxVisible);
  const freeChatVisible = freeChatExpanded || freeChatHiddenCount === 0 ? freeChatFeed : freeChatFeed.slice(-freeChatMaxVisible);
  const canSendFreeChat = !freeChatRangeError && freeChatMessage.trim().length > 0 && !freeChatLoading;
  const freeChatRangeLabel = freeChatFrom && freeChatTo ? `${freeChatFrom} -> ${freeChatTo}` : 'Rango sin definir';
  const freeChatHasNew = !freeChatNearBottom && freeChatFeed.length > freeChatLastSeenCount;
  const progressStyle = (pct: number) => ({ '--pct': `${pct}%`, minWidth: '4%' } as CSSProperties);

  const handleActionsScroll = useCallback(() => {
    const container = actionsFeedRef.current;
    if (!container) return;
    const distance = container.scrollHeight - container.scrollTop - container.clientHeight;
    const nearBottom = distance < 80;
    setActionsNearBottom(nearBottom);
    if (nearBottom) {
      setActionsLastSeenCount(chatFeed.length);
    }
  }, [chatFeed.length]);

  const scrollActionsToBottom = useCallback(() => {
    const container = actionsFeedRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
    setActionsLastSeenCount(chatFeed.length);
  }, [chatFeed.length]);

  const handleFreeChatScroll = useCallback(() => {
    const container = freeChatFeedRef.current;
    if (!container) return;
    const distance = container.scrollHeight - container.scrollTop - container.clientHeight;
    const nearBottom = distance < 80;
    setFreeChatNearBottom(nearBottom);
    if (nearBottom) {
      setFreeChatLastSeenCount(freeChatFeed.length);
    }
  }, [freeChatFeed.length]);

  const scrollFreeChatToBottom = useCallback(() => {
    const container = freeChatFeedRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
    setFreeChatLastSeenCount(freeChatFeed.length);
  }, [freeChatFeed.length]);

  const resizeFreeChatInput = useCallback(() => {
    const input = freeChatInputRef.current;
    if (!input) return;
    input.style.height = 'auto';
    const nextHeight = Math.min(Math.max(input.scrollHeight, 44), 120);
    input.style.height = `${nextHeight}px`;
  }, []);

  useEffect(() => {
    if (advisorEnvironment !== 'actions') return;
    if (!actionsNearBottom) return;
    requestAnimationFrame(scrollActionsToBottom);
  }, [advisorEnvironment, chatFeed.length, actionsNearBottom, scrollActionsToBottom]);

  useEffect(() => {
    if (advisorEnvironment !== 'free_chat') return;
    if (!freeChatNearBottom) return;
    requestAnimationFrame(scrollFreeChatToBottom);
  }, [advisorEnvironment, freeChatFeed.length, freeChatNearBottom, scrollFreeChatToBottom]);

  useEffect(() => {
    if (advisorEnvironment !== 'free_chat') return;
    resizeFreeChatInput();
  }, [advisorEnvironment, freeChatMessage, resizeFreeChatInput]);

  const handleFreeChatSubmit = async () => {
    if (!canSendFreeChat) return;
    await handleFreeChatSend({ message: freeChatMessage.trim(), from: freeChatFrom, to: freeChatTo });
    setFreeChatMessage('');
  };

  const handleRecoverClick = async () => {
    const result = await handleFreeChatRecover();
    if (result.rangeFrom) setFreeChatFrom(result.rangeFrom);
    if (result.rangeTo) setFreeChatTo(result.rangeTo);
    setFreeChatExpanded(false);
    setFreeChatNearBottom(true);
  };

  return (
    <section className="space-y-4">
      <div className="card space-y-3">
        <div className="flex items-start gap-3">
          <RobotAvatar className="h-16 w-16 md:h-20 md:w-20" />
          <div className="flex flex-1 flex-col gap-2">
            <div className="space-y-1">
              <p className="text-xs uppercase text-muted">Asesor IA</p>
              <h2 className="text-lg font-semibold text-[var(--text)]">Finanzas chat</h2>
              <p className="text-xs text-muted">Elige el tono y lanza una accion; la respuesta aparece en el feed.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(['amable', 'reganon'] as AdvisorMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => handleToneChange(mode)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    advisorMode === mode ? 'bg-primary text-[var(--text)]' : 'surface-soft text-[var(--text)]'
                  }`}
                >
                  {mode === 'amable' ? 'Amable' : 'Rega\u00f1\u00f3n'}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex pill-surface p-1 text-xs font-semibold text-[var(--text)]">
                <button
                  type="button"
                  onClick={() => setAdvisorEnvironment('actions')}
                  className={`rounded-full px-3 py-1 ${
                    advisorEnvironment === 'actions' ? 'bg-primary text-[var(--text)]' : 'text-[var(--text)]'
                  }`}
                >
                  Acciones
                </button>
                {canFreeChat && (
                  <button
                    type="button"
                    onClick={() => setAdvisorEnvironment('free_chat')}
                    className={`rounded-full px-3 py-1 ${
                      advisorEnvironment === 'free_chat' ? 'bg-primary text-[var(--text)]' : 'text-[var(--text)]'
                    }`}
                  >
                    Chat libre
                  </button>
                )}
              </div>
              {!canFreeChat && (
                <button
                  type="button"
                  onClick={() => {
                    if (freeChatNeedsKey) {
                      onOpenSettings();
                      return;
                    }
                    openUpgrade('feature_locked');
                  }}
                  className="inline-flex items-center gap-1 pill-surface px-3 py-1 text-[11px] font-semibold text-[var(--text)]"
                >
                  <Lock aria-hidden="true" className="h-3 w-3" />
                  <span>Chat libre (BYOK)</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {advisorEnvironment === 'actions' ? (
          <>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {advisorQuickActions.map((item) => {
                const lockedByPlan = item.locked;
                const lockedByQuota = !lockedByPlan && item.requiresAnalyze && analyzeExhausted;
                const locked = lockedByPlan || lockedByQuota;
                const badge = item.badge;
                const disabled = advisorLoading;
                return (
                  <button
                    key={item.action}
                    disabled={disabled}
                    aria-disabled={locked}
                    onClick={() => {
                      if (lockedByPlan) {
                        openUpgrade('feature_locked');
                        return;
                      }
                      if (lockedByQuota) return;
                      void handleAdvisorAction(item.action);
                    }}
                    className={`flex h-full flex-col rounded-xl px-3 py-3 text-left transition ${
                      locked
                        ? 'surface-dashed border-[var(--border-20)]'
                        : `surface-soft ${disabled ? '' : 'hover:border-primary'}`
                    } ${disabled ? 'cursor-not-allowed opacity-50' : locked ? 'opacity-80' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-[var(--text)]">{item.label}</p>
                      {badge && (
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase badge-paint">
                          {locked && (
                            <Lock aria-hidden="true" className="h-3 w-3" />
                          )}
                          <span>{badge}</span>
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted">{item.description}</p>
                    {locked && (
                      <p className="text-[11px] font-medium text-primary">
                        {lockedByQuota ? 'Limite semanal alcanzado. Se renueva el lunes.' : 'Toca para ver como desbloquearlo'}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>

            {featureLocks.length > 0 && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {featureLocks.map((lock) => (
                  <FeatureLockCard
                    key={lock.id}
                    title={lock.title}
                    description={lock.description}
                    badgeLabel={lock.badge}
                    onUpgradeClick={() => openUpgrade('feature_locked')}
                  />
                ))}
              </div>
            )}

            <div className="relative flex h-[55vh] max-h-[60vh] flex-col overflow-hidden rounded-xl surface-soft">
              <div className="shrink-0 border-b border-[var(--border-10)] px-3 py-2">
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>Feed IA</span>
                  <span>Tono: {advisorMode === 'amable' ? 'Amable' : 'Rega\u00f1\u00f3n'}</span>
                </div>
              </div>
              <div className="relative flex-1 min-h-0">
                <div
                  ref={actionsFeedRef}
                  onScroll={handleActionsScroll}
                  className={`h-full overflow-y-auto px-3 py-3 ${actionsNearBottom ? 'pb-4' : 'pb-16'}`}
                >
                  <div className="flex min-h-full flex-col">
                    {!actionsExpanded && actionsHiddenCount > 0 && (
                      <button
                        type="button"
                        onClick={() => setActionsExpanded(true)}
                        className="mb-3 self-center pill-surface px-3 py-1 text-[11px] font-semibold text-[var(--text)]"
                      >
                        Ver mensajes anteriores ({actionsHiddenCount})
                      </button>
                    )}
                    {actionsVisible.length === 0 && !advisorLoading ? (
                      <div className="my-auto rounded-lg surface-dashed px-3 py-3 text-sm text-[var(--text)]">
                        Aun no hay mensajes. Lanza una accion arriba para ver el estilo chat.
                      </div>
                    ) : (
                      <>
                        <div className="flex-1" />
                        <div className="flex flex-col gap-3">
                          {actionsVisible.map((item) => (
                            <div key={item.id} className={`flex ${item.from === 'ia' ? 'justify-start' : 'justify-end'}`}>
                              <div
                                className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                                  item.from === 'ia' ? 'bg-[var(--overlay-10)] text-[var(--text)]' : 'bg-primary text-[var(--text)]'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wide opacity-80">
                                  <span>{item.from === 'ia' ? 'IA' : 'Tu'}</span>
                                  <span>
                                    {new Date(item.ts).toLocaleTimeString('es-CO', {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </span>
                                </div>
                                <p className="whitespace-pre-line">{item.text}</p>
                                {item.chartTop && item.chartTop.length > 0 && (
                                  <div className="mt-3 space-y-2">
                                    {item.chartTop.map((ct) => {
                                      const max = item.chartTop?.[0]?.amount || 1;
                                      const pct = Math.round((ct.amount / max) * 100);
                                      return (
                                        <div key={ct.category} className="space-y-1">
                                          <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--text)]">
                                            <span className="truncate">{ct.category}</span>
                                            <span className="whitespace-nowrap font-semibold">{formatPesos(ct.amount)}</span>
                                          </div>
                                          <div className="h-2 rounded-full bg-[var(--overlay-10)]">
                                            <div
                                              className="progress-fill h-full rounded-full bg-primary"
                                              style={progressStyle(pct)}
                                            />
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                                {item.actionData && item.from === 'ia' && (
                                  <div className="mt-3">
                                    <button
                                      type="button"
                                      onClick={() => onActionClick(item.actionData!)}
                                      className="inline-flex items-center pill-surface border-[var(--border-15)] px-3 py-1 text-xs font-semibold text-[var(--text)] transition hover:border-primary"
                                    >
                                      {item.actionData.label}
                                    </button>
                                  </div>
                                )}
                                {item.tone && item.from === 'ia' && (
                                  <p className="mt-1 text-[10px] opacity-80">
                                    Tono: {item.tone === 'amable' ? 'Amable' : 'Rega\u00f1\u00f3n'}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                          {advisorLoading && (
                            <div className="flex justify-start">
                              <div className="max-w-[70%] rounded-2xl bg-[var(--overlay-10)] px-3 py-2 text-sm text-[var(--text)] shadow-sm">
                                <span className="sr-only">IA escribiendo</span>
                                <span className="flex items-center gap-1">
                                  <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--text)]" />
                                  <span
                                    className="h-2 w-2 animate-bounce rounded-full bg-[var(--text)]"
                                    style={{ animationDelay: '0.15s' }}
                                  />
                                  <span
                                    className="h-2 w-2 animate-bounce rounded-full bg-[var(--text)]"
                                    style={{ animationDelay: '0.3s' }}
                                  />
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
                {!actionsNearBottom && (
                  <button
                    type="button"
                    aria-label={actionsHasNew ? 'Bajar a nuevos mensajes' : 'Bajar al final'}
                    onClick={() => {
                      scrollActionsToBottom();
                      setActionsLastSeenCount(chatFeed.length);
                      setActionsNearBottom(true);
                    }}
                    className={`absolute bottom-4 right-4 z-20 flex h-9 w-9 items-center justify-center rounded-full shadow-lg transition-all duration-200 active:scale-90 ${
                      actionsHasNew
                        ? 'bg-primary text-[var(--text)] shadow-primary/40'
                        : 'pill-strong text-[var(--text)] backdrop-blur-sm hover:border-primary'
                    }`}
                  >
                    <ArrowDown className="h-5 w-5" />
                    {actionsHasNew && (
                      <span className="absolute -top-1 -right-1 flex h-3 w-3">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--danger-border)] opacity-75 motion-reduce:animate-none" />
                        <span className="relative inline-flex h-3 w-3 rounded-full border-2 border-[var(--danger-border)] bg-[var(--danger-text)]" />
                      </span>
                    )}
                  </button>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex h-[70vh] max-h-[75vh] flex-col overflow-hidden rounded-xl surface-soft">
            <div className="shrink-0 space-y-2 border-b border-[var(--border-10)] p-3">
              <div className="flex items-center justify-between text-xs text-muted">
                <span>Chat libre</span>
                <span>{freeChatRangeLabel}</span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="space-y-1 text-xs text-muted">
                  <span>Desde</span>
                  <input
                    type="date"
                    value={freeChatFrom}
                    onChange={(event) => setFreeChatFrom(event.target.value)}
                    className="w-full rounded-lg field-soft px-3 py-2 text-sm"
                  />
                </label>
                <label className="space-y-1 text-xs text-muted">
                  <span>Hasta</span>
                  <input
                    type="date"
                    value={freeChatTo}
                    onChange={(event) => setFreeChatTo(event.target.value)}
                    className="w-full rounded-lg field-soft px-3 py-2 text-sm"
                  />
                </label>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
                <span>Max 1 mes (31 dias).</span>
                <span>Tono: {advisorMode === 'amable' ? 'Amable' : 'Rega\u00f1\u00f3n'}</span>
              </div>
              {freeChatRangeError && (
                <p className="text-[11px] font-medium text-primary">{freeChatRangeError}</p>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
                <span>La IA usa un resumen + ultimos 2 intercambios.</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                      disabled={freeChatLoading}
                      onClick={() => {
                        setFreeChatMessage('');
                        setFreeChatExpanded(false);
                        setFreeChatNearBottom(true);
                        setFreeChatLastSeenCount(0);
                        handleFreeChatReset();
                      }}
                    className={`rounded-full px-3 py-2 text-[11px] font-semibold ${
                      freeChatLoading
                        ? 'surface-soft text-muted'
                        : 'border border-[var(--border-10)] text-[var(--text)]'
                    }`}
                  >
                    Nuevo chat
                  </button>
                  <button
                    type="button"
                    disabled={freeChatLoading}
                    onClick={() => {
                      void handleRecoverClick();
                    }}
                    className={`rounded-full px-3 py-2 text-[11px] font-semibold ${
                      freeChatLoading
                        ? 'surface-soft text-muted'
                        : 'border border-[var(--border-10)] text-[var(--text)]'
                    }`}
                  >
                    Recuperar chat
                  </button>
                </div>
              </div>
            </div>

            <div className="relative flex-1 min-h-0">
              <div
                ref={freeChatFeedRef}
                onScroll={handleFreeChatScroll}
                className={`h-full overflow-y-auto px-3 py-3 ${freeChatNearBottom ? 'pb-4' : 'pb-16'}`}
              >
                <div className="flex min-h-full flex-col">
                  {!freeChatExpanded && freeChatHiddenCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setFreeChatExpanded(true)}
                      className="mb-3 self-center pill-surface px-3 py-1 text-[11px] font-semibold text-[var(--text)]"
                    >
                      Ver mensajes anteriores ({freeChatHiddenCount})
                    </button>
                  )}
                  {freeChatVisible.length === 0 ? (
                    <div className="my-auto rounded-lg surface-dashed px-3 py-3 text-sm text-[var(--text)]">
                      Aun no hay mensajes. Envia el primero para iniciar el chat.
                    </div>
                  ) : (
                    <>
                      <div className="flex-1" />
                      <div className="flex flex-col gap-3">
                        {freeChatVisible.map((item) => (
                          <div key={item.id} className={`flex ${item.from === 'ia' ? 'justify-start' : 'justify-end'}`}>
                            <div
                              className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                                item.from === 'ia' ? 'bg-[var(--overlay-10)] text-[var(--text)]' : 'bg-primary text-[var(--text)]'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wide opacity-80">
                                <span>{item.from === 'ia' ? 'IA' : 'Tu'}</span>
                                <span>
                                  {new Date(item.ts).toLocaleTimeString('es-CO', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </span>
                              </div>
                              <p className="whitespace-pre-line">{item.text}</p>
                            </div>
                          </div>
                        ))}
                        {freeChatLoading && (
                          <div className="flex justify-start">
                            <div className="max-w-[70%] rounded-2xl bg-[var(--overlay-10)] px-3 py-2 text-sm text-[var(--text)] shadow-sm">
                              <span className="sr-only">IA escribiendo</span>
                              <span className="flex items-center gap-1">
                                <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--text)]" />
                                <span
                                  className="h-2 w-2 animate-bounce rounded-full bg-[var(--text)]"
                                  style={{ animationDelay: '0.15s' }}
                                />
                                <span
                                  className="h-2 w-2 animate-bounce rounded-full bg-[var(--text)]"
                                  style={{ animationDelay: '0.3s' }}
                                />
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
              {!freeChatNearBottom && (
                <button
                  type="button"
                  aria-label={freeChatHasNew ? 'Bajar a nuevos mensajes' : 'Bajar al final'}
                  onClick={() => {
                    scrollFreeChatToBottom();
                    setFreeChatLastSeenCount(freeChatFeed.length);
                    setFreeChatNearBottom(true);
                  }}
                  className={`absolute bottom-4 right-4 z-20 flex h-9 w-9 items-center justify-center rounded-full shadow-lg transition-all duration-200 active:scale-90 ${
                    freeChatHasNew
                      ? 'bg-primary text-[var(--text)] shadow-primary/40'
                      : 'pill-strong text-[var(--text)] backdrop-blur-sm hover:border-primary'
                  }`}
                >
                  <ArrowDown className="h-5 w-5" />
                  {freeChatHasNew && (
                    <span className="absolute -top-1 -right-1 flex h-3 w-3">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--danger-border)] opacity-75 motion-reduce:animate-none" />
                      <span className="relative inline-flex h-3 w-3 rounded-full border-2 border-[var(--danger-border)] bg-[var(--danger-text)]" />
                    </span>
                  )}
                </button>
              )}
            </div>

            <div className="shrink-0 surface-top px-3 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
              <div className="flex items-end gap-2">
                <textarea
                  ref={freeChatInputRef}
                  value={freeChatMessage}
                  onChange={(event) => setFreeChatMessage(event.target.value)}
                  onInput={resizeFreeChatInput}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' || event.shiftKey) return;
                    if (event.nativeEvent instanceof KeyboardEvent && event.nativeEvent.isComposing) return;
                    event.preventDefault();
                    void handleFreeChatSubmit();
                  }}
                  rows={1}
                  placeholder="Escribe tu mensaje para la IA..."
                  className="min-h-[44px] max-h-[120px] w-full resize-none rounded-2xl field-soft px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  aria-label="Enviar mensaje"
                  disabled={!canSendFreeChat}
                  onClick={() => {
                    void handleFreeChatSubmit();
                  }}
                  className={`flex h-10 w-10 items-center justify-center rounded-full transition ${
                    canSendFreeChat
                      ? 'bg-primary text-[var(--text)] shadow-primary/40'
                      : 'surface-soft text-muted'
                  }`}
                >
                  <SendHorizontal className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
