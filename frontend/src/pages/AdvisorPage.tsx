import { useMemo, useState } from 'react';
import { Lock } from 'lucide-react';
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
  const [freeChatFrom, setFreeChatFrom] = useState(() => monthStartIso());
  const [freeChatTo, setFreeChatTo] = useState(() => todayIso());
  const [freeChatMessage, setFreeChatMessage] = useState('');
  const freeChatRangeError = useMemo(
    () => validateFreeChatRange(freeChatFrom, freeChatTo),
    [freeChatFrom, freeChatTo],
  );
  const canSendFreeChat = !freeChatRangeError && freeChatMessage.trim().length > 0 && !freeChatLoading;

  const handleFreeChatSubmit = async () => {
    if (!canSendFreeChat) return;
    await handleFreeChatSend({ message: freeChatMessage.trim(), from: freeChatFrom, to: freeChatTo });
    setFreeChatMessage('');
  };

  const handleRecoverClick = async () => {
    const result = await handleFreeChatRecover();
    if (result.rangeFrom) setFreeChatFrom(result.rangeFrom);
    if (result.rangeTo) setFreeChatTo(result.rangeTo);
  };

  return (
    <section className="space-y-4">
      <div className="card space-y-3">
        <div className="flex items-start gap-3">
          <RobotAvatar className="h-16 w-16 md:h-20 md:w-20" />
          <div className="flex flex-1 flex-col gap-2">
            <div className="space-y-1">
              <p className="text-xs uppercase text-slate-400">Asesor IA</p>
              <h2 className="text-lg font-semibold text-white">Finanzas chat</h2>
              <p className="text-xs text-slate-300">Elige el tono y lanza una accion; la respuesta aparece en el feed.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(['amable', 'reganon'] as AdvisorMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => handleToneChange(mode)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    advisorMode === mode ? 'bg-primary text-white' : 'border border-white/10 bg-white/5 text-white'
                  }`}
                >
                  {mode === 'amable' ? 'Amable' : 'Reganon'}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-full border border-white/10 bg-white/5 p-1 text-xs font-semibold text-white">
                <button
                  type="button"
                  onClick={() => setAdvisorEnvironment('actions')}
                  className={`rounded-full px-3 py-1 ${
                    advisorEnvironment === 'actions' ? 'bg-primary text-white' : 'text-slate-200'
                  }`}
                >
                  Acciones
                </button>
                {canFreeChat && (
                  <button
                    type="button"
                    onClick={() => setAdvisorEnvironment('free_chat')}
                    className={`rounded-full px-3 py-1 ${
                      advisorEnvironment === 'free_chat' ? 'bg-primary text-white' : 'text-slate-200'
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
                  className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-slate-200"
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
                    className={`flex h-full flex-col rounded-xl border px-3 py-3 text-left transition ${
                      locked
                        ? 'border-dashed border-white/20 bg-white/5'
                        : `border-white/10 bg-white/5 ${disabled ? '' : 'hover:border-primary'}`
                    } ${disabled ? 'cursor-not-allowed opacity-50' : locked ? 'opacity-80' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-white">{item.label}</p>
                      {badge && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-200">
                          {locked && (
                            <Lock aria-hidden="true" className="h-3 w-3" />
                          )}
                          <span>{badge}</span>
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-300">{item.description}</p>
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

            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="mb-2 flex items-center justify-between text-xs text-slate-300">
                <span>Feed IA</span>
                <span>Tono: {advisorMode === 'amable' ? 'Amable' : 'Reganon'}</span>
              </div>
              <div className="flex flex-col gap-3">
                {chatFeed.length === 0 && (
                  <div className="rounded-lg border border-dashed border-white/10 bg-white/5 px-3 py-3 text-sm text-slate-200">
                    Aun no hay mensajes. Lanza una accion arriba para ver el estilo chat.
                  </div>
                )}
                {chatFeed.map((item) => (
                  <div key={item.id} className={`flex ${item.from === 'ia' ? 'justify-start' : 'justify-end'}`}>
                    <div
                      className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                        item.from === 'ia' ? 'bg-white/10 text-white' : 'bg-primary text-white'
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
                                <div className="flex items-center justify-between gap-2 text-[11px] text-slate-200">
                                  <span className="truncate">{ct.category}</span>
                                  <span className="whitespace-nowrap font-semibold">{formatPesos(ct.amount)}</span>
                                </div>
                                <div className="h-2 rounded-full bg-white/10">
                                  <div
                                    className="h-full rounded-full bg-primary"
                                    style={{ width: `${pct}%`, minWidth: '4%' }}
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
                            className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold text-white transition hover:border-primary"
                          >
                            {item.actionData.label}
                          </button>
                        </div>
                      )}
                      {item.tone && item.from === 'ia' && (
                        <p className="mt-1 text-[10px] opacity-80">
                          Tono: {item.tone === 'amable' ? 'Amable' : 'Reganon'}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
                {advisorLoading && (
                  <div className="flex items-center gap-2 text-xs text-slate-200">
                    <span className="font-semibold text-white">IA escribiendo</span>
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 animate-bounce rounded-full bg-white" />
                      <span
                        className="h-2 w-2 animate-bounce rounded-full bg-white"
                        style={{ animationDelay: '0.15s' }}
                      />
                      <span
                        className="h-2 w-2 animate-bounce rounded-full bg-white"
                        style={{ animationDelay: '0.3s' }}
                      />
                    </span>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="space-y-1 text-xs text-slate-300">
                  <span>Desde</span>
                  <input
                    type="date"
                    value={freeChatFrom}
                    onChange={(event) => setFreeChatFrom(event.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                  />
                </label>
                <label className="space-y-1 text-xs text-slate-300">
                  <span>Hasta</span>
                  <input
                    type="date"
                    value={freeChatTo}
                    onChange={(event) => setFreeChatTo(event.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                  />
                </label>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                <span>Max 1 mes (31 dias).</span>
                <span>Tono: {advisorMode === 'amable' ? 'Amable' : 'Reganon'}</span>
              </div>
              {freeChatRangeError && (
                <p className="mt-1 text-[11px] font-medium text-primary">{freeChatRangeError}</p>
              )}
              <div className="mt-3 space-y-2">
                <textarea
                  value={freeChatMessage}
                  onChange={(event) => setFreeChatMessage(event.target.value)}
                  rows={3}
                  placeholder="Escribe tu mensaje para la IA..."
                  className="w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                />
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    disabled={freeChatLoading}
                    onClick={() => {
                      setFreeChatMessage('');
                      handleFreeChatReset();
                    }}
                    className={`rounded-full px-3 py-2 text-[11px] font-semibold ${
                      freeChatLoading ? 'border border-white/10 bg-white/5 text-slate-400' : 'border border-white/10 text-slate-200'
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
                      freeChatLoading ? 'border border-white/10 bg-white/5 text-slate-400' : 'border border-white/10 text-slate-200'
                    }`}
                  >
                    Recuperar chat
                  </button>
                  <button
                    type="button"
                    disabled={!canSendFreeChat}
                    onClick={() => {
                      void handleFreeChatSubmit();
                    }}
                    className={`rounded-full px-4 py-2 text-xs font-semibold ${
                      canSendFreeChat ? 'bg-primary text-white' : 'border border-white/10 bg-white/5 text-slate-400'
                    }`}
                  >
                    Enviar
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="mb-2 flex items-center justify-between text-xs text-slate-300">
                <span>Chat libre</span>
                <span>{freeChatFrom && freeChatTo ? `${freeChatFrom} -> ${freeChatTo}` : 'Rango sin definir'}</span>
              </div>
              <div className="flex flex-col gap-3">
                {freeChatFeed.length === 0 && (
                  <div className="rounded-lg border border-dashed border-white/10 bg-white/5 px-3 py-3 text-sm text-slate-200">
                    Aun no hay mensajes. Envia el primero para iniciar el chat.
                  </div>
                )}
                {freeChatFeed.map((item) => (
                  <div key={item.id} className={`flex ${item.from === 'ia' ? 'justify-start' : 'justify-end'}`}>
                    <div
                      className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                        item.from === 'ia' ? 'bg-white/10 text-white' : 'bg-primary text-white'
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
                  <div className="flex items-center gap-2 text-xs text-slate-200">
                    <span className="font-semibold text-white">IA escribiendo</span>
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 animate-bounce rounded-full bg-white" />
                      <span
                        className="h-2 w-2 animate-bounce rounded-full bg-white"
                        style={{ animationDelay: '0.15s' }}
                      />
                      <span
                        className="h-2 w-2 animate-bounce rounded-full bg-white"
                        style={{ animationDelay: '0.3s' }}
                      />
                    </span>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
