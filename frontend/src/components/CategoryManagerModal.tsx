import { useCallback, useEffect, useMemo, useState, type DragEvent } from 'react';
import { ArrowLeft, GripVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import { useCategoriesController } from '../hooks/useCategoriesController';
import { updateCategory as updateCategoryDoc } from '../services/categories';
import type { Category } from '../types';
import { CategoryIcon } from './ui/CategoryIcon';
import { IconPicker } from './ui/IconPicker';

interface Props {
  open: boolean;
  onClose: () => void;
  userId?: string | null;
}

type ViewMode = 'list' | 'form' | 'icons';

const DEFAULT_ICON = 'Tag';

export function CategoryManagerModal({ open, onClose, userId }: Props) {
  const {
    categories,
    loading,
    error,
    addCategory,
    updateCategory: updateCategoryAction,
    deleteCategory,
    refreshCategories,
  } = useCategoriesController({
    userId,
    includeArchived: true,
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formState, setFormState] = useState({ label: '', icon: DEFAULT_ICON });
  const [view, setView] = useState<ViewMode>('list');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [orderedCategories, setOrderedCategories] = useState<Category[]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const headerTitle = useMemo(() => {
    if (view === 'icons') return 'Selecciona un ícono';
    if (view === 'form') return editingId ? 'Editar categoría' : 'Nueva categoría';
    return 'Administrar categorías';
  }, [editingId, view]);

  const headerSubtitle = useMemo(() => {
    if (view === 'list') return 'Ordena y activa las categorías del acceso rápido.';
    if (view === 'icons') return 'Elige un ícono para tu categoría.';
    return editingId ? 'Actualiza el nombre e ícono.' : 'Crea una nueva categoría.';
  }, [editingId, view]);

  const inactiveCategories = useMemo(() => categories.filter((cat) => cat.isArchived), [categories]);

  const resetForm = useCallback(() => {
    setEditingId(null);
    setFormState({ label: '', icon: DEFAULT_ICON });
    setFormError(null);
    setView('list');
  }, []);

  useEffect(() => {
    if (!open) {
      resetForm();
    }
  }, [open, resetForm]);

  useEffect(() => {
    if (!open) return;

    const body = document.body;
    const previousOverflow = body.style.overflow;
    body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, open]);

  useEffect(() => {
    const active = categories.filter((cat) => !cat.isArchived);
    setOrderedCategories(active);
  }, [categories]);

  const handleEdit = useCallback((cat: Category) => {
    setEditingId(cat.id);
    setFormState({ label: cat.label, icon: cat.icon });
    setFormError(null);
    setView('form');
  }, []);

  const handleNew = useCallback(() => {
    setEditingId(null);
    setFormState({ label: '', icon: DEFAULT_ICON });
    setFormError(null);
    setView('form');
  }, []);

  const reorderCategories = useCallback((list: Category[], fromId: string, toId: string) => {
    const fromIndex = list.findIndex((cat) => cat.id === fromId);
    const toIndex = list.findIndex((cat) => cat.id === toId);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return list;
    const next = [...list];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    return next;
  }, []);

  const persistOrder = useCallback(
    async (list: Category[]) => {
      if (!userId) return;
      setSaving(true);
      setFormError(null);
      try {
        const updates = list
          .map((cat, index) => (cat.order === index ? null : updateCategoryDoc(userId, cat.id, { order: index })))
          .filter(Boolean);
        if (updates.length > 0) {
          await Promise.all(updates);
          await refreshCategories();
        }
      } catch (err) {
        console.error(err);
        setFormError('No se pudo reordenar las categorías.');
      } finally {
        setSaving(false);
      }
    },
    [refreshCategories, userId],
  );

  const handleDragStart = (id: string) => (event: DragEvent<HTMLButtonElement>) => {
    if (saving) return;
    setDraggingId(id);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', id);
  };

  const handleDragOver = (id: string) => (event: DragEvent<HTMLDivElement>) => {
    if (saving) return;
    event.preventDefault();
    setDragOverId(id);
  };

  const handleDrop = (id: string) => async (event: DragEvent<HTMLDivElement>) => {
    if (saving) return;
    event.preventDefault();
    const draggedId = event.dataTransfer.getData('text/plain') || draggingId;
    if (!draggedId || draggedId === id) {
      setDraggingId(null);
      setDragOverId(null);
      return;
    }
    const next = reorderCategories(orderedCategories, draggedId, id);
    setOrderedCategories(next);
    setDraggingId(null);
    setDragOverId(null);
    await persistOrder(next);
  };

  const handleDragEnd = () => {
    setDraggingId(null);
    setDragOverId(null);
  };

  const handleBack = () => {
    if (view === 'icons') {
      setView('form');
      return;
    }
    resetForm();
  };

  const handleSave = async () => {
    if (saving) return;
    const label = formState.label.trim();
    if (!label) {
      setFormError('Ingresa un nombre de categoría.');
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      if (editingId) {
        await updateCategoryAction(editingId, { label, icon: formState.icon });
      } else {
        const nextOrder = categories.reduce((max, cat) => Math.max(max, cat.order ?? 0), -1) + 1;
        await addCategory({ label, icon: formState.icon, order: nextOrder });
      }
      resetForm();
    } catch (err) {
      console.error(err);
      setFormError('No se pudo guardar la categoría.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (cat: Category) => {
    if (saving) return;
    const nextArchived = !cat.isArchived;
    if (nextArchived) {
      const confirmed = window.confirm('Desactivar categoría?');
      if (!confirmed) return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const updates: Partial<Omit<Category, 'id'>> = { isArchived: nextArchived };
      if (!nextArchived) {
        updates.order = orderedCategories.length;
      }
      await updateCategoryAction(cat.id, updates);
    } catch (err) {
      console.error(err);
      setFormError('No se pudo actualizar la categoría.');
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (cat: Category) => {
    if (saving) return;
    if (cat.isSystem) {
      setFormError('Las categorías base no se pueden borrar.');
      return;
    }
    const confirmed = window.confirm('Archivar categoría?');
    if (!confirmed) return;
    setSaving(true);
    setFormError(null);
    try {
      await deleteCategory(cat.id);
      if (editingId === cat.id) {
        resetForm();
      }
    } catch (err) {
      console.error(err);
      setFormError('No se pudo archivar la categoría.');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center px-0 sm:items-center sm:px-3">
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="relative flex h-[92vh] w-full max-w-none flex-col overflow-hidden rounded-t-2xl border border-[var(--modal-border)] bg-[var(--modal-surface)] text-[var(--text)] shadow-2xl backdrop-blur sm:h-auto sm:max-h-[85vh] sm:max-w-3xl sm:rounded-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Administrar categorías"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-[var(--modal-border)] px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              {view !== 'list' && (
                <button
                  type="button"
                  onClick={handleBack}
                  className="mt-1 flex h-10 w-10 items-center justify-center rounded-full border border-[var(--card-border)] bg-[var(--input-bg)] text-[var(--text)] hover:border-primary"
                  aria-label="Volver"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
              )}
              <div>
                <h3 className="text-lg font-semibold text-[var(--text)]">{headerTitle}</h3>
                <p className="text-sm text-[var(--text-muted)]">{headerSubtitle}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-full border border-[var(--card-border)] bg-[var(--input-bg)] px-3 py-1 text-xs font-semibold text-[var(--text)] hover:border-[var(--primary)]"
            >
              Cerrar
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {view === 'list' && (
            <div className="space-y-4">
              {error && <p className="text-xs text-[var(--error-text)]">{error}</p>}
              {formError && <p className="text-xs text-[var(--error-text)]">{formError}</p>}
              {loading && categories.length === 0 ? (
                <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)]/40 p-3 text-sm text-[var(--text-muted)]">
                  Cargando categorías...
                </div>
              ) : categories.length === 0 ? (
                <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)]/40 p-3 text-sm text-[var(--text-muted)]">
                  No hay categorías.
                </div>
              ) : (
                <>
                  <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)]/30 px-3 py-2 text-xs text-[var(--text-muted)]">
                    Arrastra para ordenar. Solo las primeras 19 activas aparecen en el acceso rápido.
                  </div>

                  <div className="space-y-3">
                    <div className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">Activas</div>
                    {orderedCategories.length === 0 ? (
                      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)]/40 p-3 text-sm text-[var(--text-muted)]">
                        No hay categorías activas.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {orderedCategories.map((cat) => {
                          const isEditing = editingId === cat.id;
                          const isDragOver = dragOverId === cat.id;
                          return (
                            <div
                              key={cat.id}
                              onDragOver={handleDragOver(cat.id)}
                              onDrop={handleDrop(cat.id)}
                              className={`flex flex-col gap-3 rounded-xl border px-3 py-3 transition sm:flex-row sm:items-center sm:justify-between ${
                                isEditing
                                  ? 'border-primary/60 bg-primary/10'
                                  : 'border-[var(--card-border)] bg-[var(--card)]/40 hover:border-primary/40'
                              } ${isDragOver ? 'border-primary/70 ring-1 ring-primary/30' : ''}`}
                            >
                              <div className="flex min-w-0 items-center gap-3">
                                <button
                                  type="button"
                                  draggable={!saving}
                                  onDragStart={handleDragStart(cat.id)}
                                  onDragEnd={handleDragEnd}
                                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--card-border)] bg-[var(--input-bg)] text-[var(--text-muted)] hover:border-primary cursor-grab active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
                                  aria-label="Reordenar categoría"
                                  disabled={saving}
                                >
                                  <GripVertical className="h-4 w-4" />
                                </button>
                                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--input-bg)]">
                                  <CategoryIcon name={cat.icon} size={18} />
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-[var(--text)]">{cat.label}</p>
                                  {cat.isSystem && (
                                    <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                                      Base
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                                <button
                                  type="button"
                                  onClick={() => handleToggleActive(cat)}
                                  className={`flex items-center gap-2 rounded-full border px-2 py-1 text-[11px] font-semibold transition ${
                                    cat.isArchived
                                      ? 'border-white/10 text-[var(--text-muted)]'
                                      : 'border-primary/40 text-[var(--text)]'
                                  }`}
                                  aria-pressed={!cat.isArchived}
                                  disabled={saving}
                                >
                                  <span>Activa</span>
                                  <span
                                    className={`relative inline-flex h-4 w-7 items-center rounded-full ${
                                      cat.isArchived ? 'bg-white/10' : 'bg-primary/70'
                                    }`}
                                  >
                                    <span
                                      className={`inline-block h-3 w-3 transform rounded-full bg-white ${
                                        cat.isArchived ? 'translate-x-1' : 'translate-x-3'
                                      }`}
                                    />
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleEdit(cat)}
                                  className="flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--card-border)] bg-[var(--input-bg)] text-[var(--text)] hover:border-primary disabled:opacity-60"
                                  title="Editar categoría"
                                  disabled={saving}
                                >
                                  <Pencil className="h-4 w-4" />
                                </button>
                                {!cat.isSystem && (
                                  <button
                                    type="button"
                                    onClick={() => handleArchive(cat)}
                                    className="flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--card-border)] bg-[var(--input-bg)] text-[var(--error-text)] hover:border-[var(--danger-border)] disabled:opacity-60"
                                    title="Archivar categoría"
                                    disabled={saving}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {inactiveCategories.length > 0 && (
                    <div className="space-y-3">
                      <div className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">Inactivas</div>
                      <div className="space-y-2">
                        {inactiveCategories.map((cat) => (
                          <div
                            key={cat.id}
                            className="flex flex-col gap-3 rounded-xl border border-[var(--card-border)] bg-[var(--card)]/30 px-3 py-3 opacity-80 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--input-bg)]">
                                <CategoryIcon name={cat.icon} size={18} />
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-[var(--text)]">{cat.label}</p>
                                <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                                  Inactiva
                                </span>
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                              <button
                                type="button"
                                onClick={() => handleToggleActive(cat)}
                                className="flex items-center gap-2 rounded-full border border-white/10 px-2 py-1 text-[11px] font-semibold text-[var(--text-muted)] transition"
                                aria-pressed={!cat.isArchived}
                                disabled={saving}
                              >
                                <span>Inactiva</span>
                                <span className="relative inline-flex h-4 w-7 items-center rounded-full bg-white/10">
                                  <span className="inline-block h-3 w-3 translate-x-1 transform rounded-full bg-white" />
                                </span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleEdit(cat)}
                                className="flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--card-border)] bg-[var(--input-bg)] text-[var(--text)] hover:border-primary disabled:opacity-60"
                                title="Editar categoría"
                                disabled={saving}
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {(view === 'form' || view === 'icons') && (
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--text-muted)]">Nombre</label>
                <input
                  type="text"
                  value={formState.label}
                  onChange={(e) => setFormState((prev) => ({ ...prev, label: e.target.value }))}
                  placeholder="Ej. Suscripciones"
                  className="w-full rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text)] focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--text-muted)]">Ícono</label>
                <button
                  type="button"
                  onClick={() => setView('icons')}
                  className="flex w-full items-center justify-between rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text)] hover:border-primary"
                >
                  <span className="flex items-center gap-2">
                    <CategoryIcon name={formState.icon} size={18} />
                    <span className="text-xs font-semibold">Seleccionar ícono</span>
                  </span>
                  <span className="text-[11px] text-[var(--text-muted)]">{formState.icon}</span>
                </button>
              </div>

              {formError && <p className="text-xs text-[var(--error-text)]">{formError}</p>}
            </div>
          )}
        </div>

        {view === 'list' && (
          <div className="shrink-0 border-t border-[var(--modal-border)] px-4 py-3">
            <button
              type="button"
              onClick={handleNew}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white shadow hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              Nueva categoría
            </button>
          </div>
        )}

        {view === 'form' && (
          <div className="shrink-0 border-t border-[var(--modal-border)] px-4 py-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={handleBack}
                className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--input-bg)] px-4 py-3 text-sm font-semibold text-[var(--text)] hover:border-primary"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !userId}
                className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white shadow hover:opacity-90 disabled:opacity-60"
              >
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        )}

        {view === 'icons' && (
          <div className="absolute inset-0 z-20 flex items-end justify-center sm:items-center">
            <div
              className="absolute inset-0 bg-black/70"
              onClick={() => setView('form')}
              aria-hidden="true"
            />
            <div className="relative w-full max-w-none rounded-t-2xl border border-[var(--card-border)] bg-[var(--modal-surface)] shadow-2xl sm:max-w-md sm:rounded-2xl">
              <div className="flex items-center justify-between border-b border-[var(--card-border)] px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--text)]">Selecciona un ícono</p>
                  <p className="text-xs text-[var(--text-muted)]">Toca un ícono para elegirlo.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setView('form')}
                  className="rounded-full border border-[var(--card-border)] bg-[var(--input-bg)] px-3 py-1 text-xs font-semibold text-[var(--text)] hover:border-primary"
                >
                  Cerrar
                </button>
              </div>
              <div className="max-h-[60vh] overflow-y-auto px-4 py-4">
                <IconPicker
                  selectedIcon={formState.icon}
                  onSelect={(icon) => {
                    setFormState((prev) => ({ ...prev, icon }));
                    setView('form');
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
