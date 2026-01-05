import { useEffect, useMemo, useState } from 'react';
import { Target } from 'lucide-react';
import { ObjectiveCard } from '../components/objectives/ObjectiveCard';
import { ObjectiveDetailsModal } from '../components/objectives/ObjectiveDetailsModal';
import { ObjectiveEntryModal } from '../components/objectives/ObjectiveEntryModal';
import { ObjectiveFormModal } from '../components/objectives/ObjectiveFormModal';
import { listenObjectiveEntries } from '../services/objectives';
import type {
  Objective,
  ObjectiveEntry,
  ObjectiveEntryInput,
  ObjectiveEntryKind,
  ObjectiveInput,
  ObjectiveType,
  ObjectiveUpdate,
} from '../types';
import { computeObjectivesSummary } from '../utils/objectives';
import { formatPesos } from '../utils/format';

export interface ObjectivesPageProps {
  objectives: Objective[];
  objectivesReady: boolean;
  error: string | null;
  onCreateObjective: (payload: ObjectiveInput) => Promise<void>;
  onUpdateObjective: (id: string, patch: ObjectiveUpdate) => Promise<void>;
  onArchiveObjective: (id: string) => Promise<void>;
  onDeleteObjective: (id: string) => Promise<void>;
  onAddEntry: (objectiveId: string, payload: ObjectiveEntryInput) => Promise<void>;
  onDeleteEntry: (objectiveId: string, entryId: string) => Promise<void>;
}

export function ObjectivesPage({
  objectives,
  objectivesReady,
  error,
  onCreateObjective,
  onUpdateObjective,
  onArchiveObjective,
  onDeleteObjective,
  onAddEntry,
  onDeleteEntry,
}: ObjectivesPageProps) {
  const [activeType, setActiveType] = useState<ObjectiveType>('goal');
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [editingObjective, setEditingObjective] = useState<Objective | null>(null);
  const [detailsObjective, setDetailsObjective] = useState<Objective | null>(null);
  const [entryTarget, setEntryTarget] = useState<{ objective: Objective; kind: ObjectiveEntryKind } | null>(null);
  const [entries, setEntries] = useState<ObjectiveEntry[]>([]);
  const [entriesError, setEntriesError] = useState<string | null>(null);
  const detailsObjectiveId = detailsObjective?.id ?? null;

  useEffect(() => {
    if (!detailsObjectiveId) {
      const timeoutId = window.setTimeout(() => {
        setEntries([]);
        setEntriesError(null);
      }, 0);
      return () => window.clearTimeout(timeoutId);
    }
    const unsubscribe = listenObjectiveEntries({
      objectiveId: detailsObjectiveId,
      onChange: (list) => {
        setEntries(list);
        setEntriesError(null);
      },
      onError: (err) => setEntriesError(err.message),
    });
    return () => unsubscribe();
  }, [detailsObjectiveId]);

  const visibleObjectives = useMemo(
    () => objectives.filter((item) => item.type === activeType && item.status === 'active'),
    [activeType, objectives],
  );
  const summary = useMemo(() => computeObjectivesSummary(objectives), [objectives]);
  const summaryValue = activeType === 'goal' ? summary.totalSaved : summary.totalRemaining;
  const summaryCount = activeType === 'goal' ? summary.activeGoals.length : summary.activeDebts.length;
  const summaryLabel =
    activeType === 'goal'
      ? summaryCount === 1
        ? 'meta activa'
        : 'metas activas'
      : summaryCount === 1
        ? 'deuda activa'
        : 'deudas activas';
  const emptyTitle = activeType === 'goal' ? 'Aun no tienes metas' : 'Aun no tienes deudas';
  const emptyDescription =
    activeType === 'goal'
      ? 'Crea una meta para empezar a ahorrar.'
      : 'Registra una deuda para llevar control de pagos.';
  const emptyCta = activeType === 'goal' ? 'Crear meta' : 'Registrar deuda';

  const openCreate = () => {
    setFormMode('create');
    setEditingObjective(null);
    setFormOpen(true);
  };

  const openEdit = (objective: Objective) => {
    setFormMode('edit');
    setEditingObjective(objective);
    setFormOpen(true);
  };

  const handleQuickAction = (objective: Objective, kind: ObjectiveEntryKind) => {
    setEntryTarget({ objective, kind });
  };

  return (
    <section className="space-y-4 pb-5">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-[var(--text)]">Objetivos</h2>
          <p className="text-xs text-[var(--text-muted)]">Ahorros y deudas en un solo lugar.</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-[var(--text)] hover:opacity-90"
        >
          Nuevo
        </button>
      </div>

      <div className="rounded-2xl border border-[var(--border-10)] bg-[var(--overlay-5)] p-1">
        <div className="flex w-full gap-1 text-sm font-semibold">
          <button
            type="button"
            aria-pressed={activeType === 'goal'}
            onClick={() => setActiveType('goal')}
            className={`flex-1 rounded-xl px-3 py-2 transition ${
              activeType === 'goal' ? 'bg-emerald-500 text-[var(--text)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            Ahorros
          </button>
          <button
            type="button"
            aria-pressed={activeType === 'debt'}
            onClick={() => setActiveType('debt')}
            className={`flex-1 rounded-xl px-3 py-2 transition ${
              activeType === 'debt' ? 'bg-sky-500 text-[var(--text)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            Deudas
          </button>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-[var(--text)]">
              {activeType === 'goal' ? 'Total ahorrado' : 'Deuda restante'}
            </h3>
            <p className="text-xs text-[var(--text-muted)]">
              {summaryCount} {summaryLabel}
            </p>
          </div>
          <p className="text-2xl font-semibold text-[var(--text)]">{formatPesos(summaryValue)}</p>
        </div>
      </div>

      {error && <p className="text-sm text-[var(--error-text)]">{error}</p>}

      {!objectivesReady ? (
        <div className="card">
          <p className="text-sm text-[var(--text-muted)]">Cargando objetivos...</p>
        </div>
      ) : visibleObjectives.length === 0 ? (
        <button
          type="button"
          onClick={openCreate}
          className="w-full rounded-3xl border border-dashed border-[var(--border-15)] bg-[var(--overlay-5)] px-6 py-8 text-left transition hover:border-primary/60 hover:bg-[var(--overlay-10)]"
        >
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[var(--border-10)] bg-[var(--overlay-5)] text-white/70">
              <Target className="h-7 w-7" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-[var(--text)]">{emptyTitle}</h3>
              <p className="text-sm text-[var(--text-muted)]">{emptyDescription}</p>
            </div>
            <span className="text-sm font-semibold text-primary">{emptyCta}</span>
          </div>
        </button>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {visibleObjectives.map((objective) => (
            <ObjectiveCard
              key={objective.id}
              objective={objective}
              onOpenDetails={setDetailsObjective}
              onQuickAction={handleQuickAction}
            />
          ))}
        </div>
      )}

      <ObjectiveFormModal
        open={formOpen}
        mode={formMode}
        objective={editingObjective}
        initialType={activeType}
        onClose={() => setFormOpen(false)}
        onCreate={onCreateObjective}
        onUpdate={onUpdateObjective}
      />

      <ObjectiveEntryModal
        open={!!entryTarget}
        objective={entryTarget?.objective ?? null}
        kind={entryTarget?.kind ?? null}
        onClose={() => setEntryTarget(null)}
        onSave={onAddEntry}
      />

      <ObjectiveDetailsModal
        open={!!detailsObjective}
        objective={detailsObjective}
        entries={entries}
        entriesError={entriesError}
        onClose={() => setDetailsObjective(null)}
        onEdit={(objective) => {
          setDetailsObjective(null);
          openEdit(objective);
        }}
        onArchive={onArchiveObjective}
        onDelete={onDeleteObjective}
        onDeleteEntry={onDeleteEntry}
        onQuickAction={(kind) => {
          if (!detailsObjective) return;
          const targetObjective = detailsObjective;
          setDetailsObjective(null);
          setEntryTarget({ objective: targetObjective, kind });
        }}
      />
    </section>
  );
}



