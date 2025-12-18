import { FeatureLockCard } from '../components/FeatureLockCard';
import { RobotAvatar } from '../components/RobotAvatar';
import type { AdvisorMode } from '../types';

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

type AdvisorQuickAction = {
  label: string;
  description: string;
  action: string;
  locked: boolean;
  requiresAnalyze: boolean;
  badge?: string;
};

type FeatureLock = { id: string; title: string; description: string; badge: string };

export interface AdvisorPageProps {
  advisorMode: AdvisorMode;
  handleToneChange: (mode: AdvisorMode) => Promise<void>;
  advisorQuickActions: AdvisorQuickAction[];
  analyzeExhausted: boolean;
  openUpgrade: (ctx: 'parse_exhausted' | 'analyze_exhausted' | 'feature_locked') => void;
  handleAdvisorAction: (action: string) => Promise<void>;
  onActionClick: (actionData: NonNullable<ChatItem['actionData']>) => void;
  featureLocks: FeatureLock[];
  chatFeed: ChatItem[];
  advisorLoading: boolean;
  formatPesos: (value?: number | null) => string;
}

export function AdvisorPage({
  advisorMode,
  handleToneChange,
  advisorQuickActions,
  analyzeExhausted,
  openUpgrade,
  handleAdvisorAction,
  onActionClick,
  featureLocks,
  chatFeed,
  advisorLoading,
  formatPesos,
}: AdvisorPageProps) {
  return (
    <section className="space-y-4">
      <div className="card space-y-3">
        <div className="flex items-start gap-3">
          <RobotAvatar className="h-16 w-16 md:h-20 md:w-20" />
          <div className="flex flex-1 flex-col gap-2">
            <div className="space-y-1">
              <p className="text-xs uppercase text-slate-400">Asesor IA</p>
              <h2 className="text-lg font-semibold text-white">Finanzas chat</h2>
              <p className="text-xs text-slate-300">Elige el tono y lanza una acción; la respuesta aparece en el feed.</p>
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
                  {mode === 'amable' ? 'Amable' : 'Regañón'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {advisorQuickActions.map((item) => {
            const locked = item.locked || (item.requiresAnalyze && analyzeExhausted);
            const lockedByQuota = item.requiresAnalyze && analyzeExhausted;
            const badge = item.badge;
            return (
              <button
                key={item.action}
                onClick={() =>
                  locked
                    ? openUpgrade(lockedByQuota ? 'analyze_exhausted' : 'feature_locked')
                    : handleAdvisorAction(item.action)
                }
                className={`flex h-full flex-col rounded-xl border px-3 py-3 text-left transition ${
                  locked
                    ? 'border-dashed border-white/20 bg-white/5 opacity-80'
                    : 'border-white/10 bg-white/5 hover:border-primary'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-white">{item.label}</p>
                  {badge && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-200">
                      {locked && (
                        <span aria-hidden="true" className="text-[11px] leading-none">
                          ??
                        </span>
                      )}
                      <span>{badge}</span>
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-300">{item.description}</p>
                {locked && (
                  <p className="text-[11px] font-medium text-primary">
                    {lockedByQuota ? 'Límite semanal alcanzado. Se renueva el lunes.' : 'Toca para ver cómo desbloquearlo'}
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
            <span>Tono: {advisorMode === 'amable' ? 'Amable' : 'Regañón'}</span>
          </div>
          <div className="flex flex-col gap-3">
            {chatFeed.length === 0 && (
              <div className="rounded-lg border border-dashed border-white/10 bg-white/5 px-3 py-3 text-sm text-slate-200">
                Aún no hay mensajes. Lanza una acción arriba para ver el estilo chat.
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
                    <span>{item.from === 'ia' ? 'IA' : 'Tú'}</span>
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
                            <div className="flex items-center justify-between text-[11px] text-slate-200">
                              <span>{ct.category}</span>
                              <span className="font-semibold">{formatPesos(ct.amount)}</span>
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
                      Tono: {item.tone === 'amable' ? 'Amable' : 'Regañón'}
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
      </div>
    </section>
  );
}
