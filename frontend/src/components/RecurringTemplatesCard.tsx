import { useConfirm } from '../hooks/useConfirm';
import type { Template } from '../types';

interface Props {
  templates: Template[];
  title: string;
  subtitle: string;
  emptyState: string;
  onUseTemplate: (tpl: Template) => void;
  onEditTemplate: (tpl: Template) => void;
  onDeleteTemplate: (id: string) => Promise<void>;
}

export function RecurringTemplatesCard({
  templates,
  title,
  subtitle,
  emptyState,
  onUseTemplate,
  onEditTemplate,
  onDeleteTemplate,
}: Props) {
  const confirm = useConfirm();

  const handleDelete = async (id: string) => {
    const confirmed = await confirm({
      title: 'Eliminar plantilla?',
      description: 'Esta accion no se puede deshacer.',
      confirmText: 'Eliminar',
      cancelText: 'Cancelar',
      variant: 'destructive',
    });
    if (!confirmed) return;
    void onDeleteTemplate(id);
  };

  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[var(--text)]">{title}</h2>
        <span className="text-xs text-[var(--text-muted)]">{subtitle}</span>
      </div>
      {templates.length === 0 && <p className="text-sm text-[var(--text-muted)]">{emptyState}</p>}
      <div className="space-y-3">
        {templates.map((tpl) => (
          <div
            key={tpl.id}
            className="flex flex-col gap-3 rounded-xl border border-[var(--card-border)] bg-[var(--card)]/60 px-3 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="space-y-1">
              <p className="text-sm font-semibold text-[var(--text)]">{tpl.name}</p>
              <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
                <span className="rounded-full bg-[var(--input-bg)] px-2 py-1 capitalize">
                  {tpl.frequency ?? 'mensual'}
                </span>
                {tpl.categoryId && (
                  <span className="rounded-full bg-[var(--input-bg)] px-2 py-1">Cat: {tpl.categoryId}</span>
                )}
                {tpl.amount ? (
                  <span className="rounded-full bg-[var(--input-bg)] px-2 py-1">${tpl.amount.toLocaleString()}</span>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
                onClick={() => onUseTemplate(tpl)}
              >
                Registrar
              </button>
              <button
                className="rounded-lg border border-[var(--card-border)] bg-[var(--input-bg)] px-3 py-2 text-xs font-semibold text-[var(--text)] hover:border-primary"
                onClick={() => onEditTemplate(tpl)}
              >
                Editar plantilla
              </button>
              <button
                className="text-xs font-semibold text-[var(--error-text)] hover:underline"
                onClick={() => handleDelete(tpl.id)}
              >
                Borrar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
