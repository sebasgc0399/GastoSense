import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ChevronDown, ChevronUp, GripVertical, Loader2, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { isCategoryDuplicateError, useCategoriesController } from '../hooks/useCategoriesController';
import { useConfirm } from '../hooks/useConfirm';
import { updateCategory as updateCategoryDoc } from '../services/categories';
import type { Category, CategoryKind } from '../types';
import { isValidAiIconName } from '../utils/iconLibrary';
import { CategoryIcon } from './ui/CategoryIcon';
import { IconPicker } from './ui/IconPicker';

interface Props {
  open: boolean;
  onClose: () => void;
  userId?: string | null;
  onSuggestIcon?: (label: string) => Promise<string>;
  initialKind?: CategoryKind;
}

type ViewMode = 'list' | 'form' | 'icons';

const DEFAULT_ICON = 'Tag';
const FALLBACK_BY_KIND: Record<CategoryKind, { id: string; label: string }> = {
  expense: { id: 'otros', label: 'Otros' },
  income: { id: 'ingreso', label: 'Ingreso' },
};
const resolveCategoryKind = (value: CategoryKind | undefined) => (value === 'income' ? 'income' : 'expense');
const ensureFallbackLast = (list: Category[], fallbackId: string) => {
  const fallback = list.find((cat) => cat.id === fallbackId);
  if (!fallback) return list;
  const rest = list.filter((cat) => cat.id !== fallbackId);
  return [...rest, fallback];
};

export function CategoryManagerModal({ open, onClose, userId, onSuggestIcon, initialKind }: Props) {
  const {
    categories,
    loading,
    error,
    addCategory,
    updateCategory: updateCategoryAction,
    deleteCategory,
    refreshCategories,
    ensureIncomeCategories,
  } = useCategoriesController({
    userId,
    includeArchived: true,
  });
  const confirm = useConfirm();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formState, setFormState] = useState({ label: '', icon: DEFAULT_ICON });
  const [view, setView] = useState<ViewMode>('list');
  const [selectedKind, setSelectedKind] = useState<CategoryKind>(() => initialKind ?? 'expense');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [iconSuggesting, setIconSuggesting] = useState(false);
  const [iconSuggestError, setIconSuggestError] = useState<string | null>(null);
  const [iconSuggestNotice, setIconSuggestNotice] = useState<string | null>(null);
  const iconSuggestTimeoutRef = useRef<number | null>(null);
  const [duplicateArchivedId, setDuplicateArchivedId] = useState<string | null>(null);
  const [orderedCategories, setOrderedCategories] = useState<Category[]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const editingCategory = useMemo(
    () => categories.find((cat) => cat.id === editingId) ?? null,
    [categories, editingId],
  );
  const showSuggestButton = Boolean(onSuggestIcon);
  const fallbackConfig = FALLBACK_BY_KIND[selectedKind];
  const fallbackId = fallbackConfig.id;
  const fallbackLabel = fallbackConfig.label;
  const isEditingFallback = editingCategory?.id === fallbackId;


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

  const inactiveCategories = useMemo(
    () =>
      categories.filter(
        (cat) =>
          cat.isArchived && resolveCategoryKind(cat.kind) === selectedKind && cat.id !== fallbackId,
      ),
    [categories, fallbackId, selectedKind],
  );

  const resetForm = useCallback(() => {
    setEditingId(null);
    setFormState({ label: '', icon: DEFAULT_ICON });
    setFormError(null);
    setDuplicateArchivedId(null);
    setIconSuggesting(false);
    setIconSuggestError(null);
    setIconSuggestNotice(null);
    if (iconSuggestTimeoutRef.current) {
      window.clearTimeout(iconSuggestTimeoutRef.current);
      iconSuggestTimeoutRef.current = null;
    }
    setView('list');
  }, []);

  useEffect(() => {
    if (!open) {
      resetForm();
    }
  }, [open, resetForm]);

  useEffect(() => {
    return () => {
      if (iconSuggestTimeoutRef.current) {
        window.clearTimeout(iconSuggestTimeoutRef.current);
      }
    };
  }, []);

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
    if (!open || selectedKind !== 'income') return;
    void ensureIncomeCategories();
  }, [ensureIncomeCategories, open, selectedKind]);

  useEffect(() => {
    const active = categories.filter(
      (cat) =>
        !cat.isArchived && resolveCategoryKind(cat.kind) === selectedKind && cat.id !== fallbackId,
    );
    setOrderedCategories(active);
    setDraggingId(null);
    setDragOverId(null);
  }, [categories, fallbackId, selectedKind]);

  const handleEdit = useCallback(
    (cat: Category) => {
      setEditingId(cat.id);
      const label = cat.id === fallbackId ? fallbackLabel : cat.label;
      setFormState({ label, icon: cat.icon });
      setFormError(null);
      setDuplicateArchivedId(null);
      setView('form');
    },
    [fallbackId, fallbackLabel],
  );

  const handleNew = useCallback(() => {
    setEditingId(null);
    setFormState({ label: '', icon: DEFAULT_ICON });
    setFormError(null);
    setDuplicateArchivedId(null);
    setView('form');
  }, []);

  const reorderCategories = useCallback(
    (list: Category[], fromId: string, toId: string) => {
      const fromIndex = list.findIndex((cat) => cat.id === fromId);
      const rawToIndex = list.findIndex((cat) => cat.id === toId);
      const fallbackIndex = list.findIndex((cat) => cat.id === fallbackId);
      if (fromIndex < 0 || rawToIndex < 0 || fromIndex === rawToIndex) return list;
      if (fromId === fallbackId) return list;

      let toIndex = rawToIndex;
      if (fallbackIndex >= 0 && toIndex >= fallbackIndex) {
        if (fallbackIndex <= 0) return list;
        toIndex = fallbackIndex - 1;
      }

      const next = [...list];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return ensureFallbackLast(next, fallbackId);
    },
    [fallbackId],
  );

  const persistOrder = useCallback(
    async (list: Category[]) => {
      if (!userId) return;
      const orderedList = ensureFallbackLast(list, fallbackId);
      setSaving(true);
      setFormError(null);
      try {
        const updates = orderedList
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
    [fallbackId, refreshCategories, userId],
  );

  const moveCategory = useCallback(
    async (fromIndex: number, toIndex: number) => {
      if (saving) return;
      if (toIndex < 0 || toIndex >= orderedCategories.length) return;
      const fallbackIndex = orderedCategories.findIndex((cat) => cat.id === fallbackId);
      if (fallbackIndex >= 0) {
        if (fromIndex === fallbackIndex) return;
        if (toIndex >= fallbackIndex) {
          if (fallbackIndex <= 0) return;
          toIndex = fallbackIndex - 1;
        }
      }
      const next = [...orderedCategories];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      const orderedNext = ensureFallbackLast(next, fallbackId);
      setOrderedCategories(orderedNext);
      await persistOrder(orderedNext);
    },
    [fallbackId, orderedCategories, persistOrder, saving],
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

  const handleSuggestIcon = useCallback(async () => {
    const trimmed = formState.label.trim();
    if (!trimmed) {
      if (iconSuggestTimeoutRef.current) {
        window.clearTimeout(iconSuggestTimeoutRef.current);
      }
      setIconSuggestError(null);
      setIconSuggestNotice('Pon un nombre para sugerir con IA.');
      iconSuggestTimeoutRef.current = window.setTimeout(() => {
        setIconSuggestNotice(null);
        iconSuggestTimeoutRef.current = null;
      }, 2500);
      return;
    }
    if (!onSuggestIcon) {
      setIconSuggestError('No se pudo sugerir el icono.');
      return;
    }
    if (iconSuggestTimeoutRef.current) {
      window.clearTimeout(iconSuggestTimeoutRef.current);
      iconSuggestTimeoutRef.current = null;
    }
    setIconSuggestNotice(null);
    setIconSuggestError(null);
    setIconSuggesting(true);
    try {
      const suggested = await onSuggestIcon(trimmed);
      const icon = suggested.trim();
      if (!icon || !isValidAiIconName(icon)) {
        setIconSuggestError('No se pudo sugerir un icono valido.');
        return;
      }
      setFormState((prev) => ({ ...prev, icon }));
      setView('form');
    } catch (err) {
      const message = (err as Error)?.message || 'No se pudo sugerir el icono.';
      setIconSuggestError(message);
    } finally {
      setIconSuggesting(false);
    }
  }, [formState.label, onSuggestIcon]);

  const handleSave = async () => {
    if (saving) return;
    const label = isEditingFallback ? fallbackLabel : formState.label.trim();
    if (!label) {
      setFormError('Ingresa un nombre de categoría.');
      return;
    }

    setSaving(true);
    setFormError(null);
    setDuplicateArchivedId(null);
    try {
      if (editingId) {
        const updates = isEditingFallback
          ? { label: fallbackLabel, icon: formState.icon, kind: selectedKind }
          : { label, icon: formState.icon, kind: selectedKind };
        await updateCategoryAction(editingId, updates);
      } else {
        const nextOrder =
          categories
            .filter((cat) => resolveCategoryKind(cat.kind) === selectedKind && cat.id !== fallbackId)
            .reduce((max, cat) => Math.max(max, cat.order ?? 0), -1) + 1;
        await addCategory({ label, icon: formState.icon, order: nextOrder, kind: selectedKind });
      }
      resetForm();
    } catch (err) {
      console.error(err);
      if (isCategoryDuplicateError(err)) {
        if (err.code === 'duplicate_archived') {
          setFormError('Ya existe pero esta archivada. Quieres reactivarla?');
          setDuplicateArchivedId(err.categoryId);
        } else {
          setFormError('Ya existe una categoria con ese nombre.');
        }
        return;
      }
      setFormError('No se pudo guardar la categoría.');
    } finally {
      setSaving(false);
    }
  };

  const handleReactivateDuplicate = async () => {
    if (!duplicateArchivedId || saving) return;
    setSaving(true);
    setFormError(null);
    try {
      const nextOrder = orderedCategories.length;
      await updateCategoryAction(duplicateArchivedId, { isArchived: false, order: nextOrder, kind: selectedKind });
      resetForm();
    } catch (err) {
      console.error(err);
      setFormError('No se pudo reactivar la categoria.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (cat: Category) => {
    if (saving) return;
    if (cat.id === fallbackId) {
      setFormError(`La categoria "${fallbackLabel}" no se puede desactivar.`);
      return;
    }
    const nextArchived = !cat.isArchived;
    if (nextArchived) {
      const confirmed = await confirm({
        title: 'Desactivar categoría?',
        description: 'Puedes reactivarla cuando quieras.',
        confirmText: 'Desactivar',
        cancelText: 'Cancelar',
        variant: 'default',
      });
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
    if (cat.id === fallbackId) {
      setFormError(`La categoria "${fallbackLabel}" no se puede borrar.`);
      return;
    }
    if (cat.isSystem) {
      setFormError('Las categorías base no se pueden borrar.');
      return;
    }
    const confirmed = await confirm({
      title: 'Eliminar categoría?',
      description: 'Si tiene movimientos, se archivará y podrás reactivarla. Si no tiene movimientos, se eliminará definitivamente.',
      confirmText: 'Eliminar',
      cancelText: 'Cancelar',
      variant: 'destructive',
    });
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
      setFormError('No se pudo eliminar la categoría.');
    } finally {
      setSaving(false);
    }
  };

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center px-0 md:items-center md:px-3">
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="relative flex h-[92vh] w-screen max-w-none flex-col overflow-hidden rounded-t-2xl border border-[var(--modal-border)] bg-[var(--modal-surface)] text-[var(--text)] shadow-2xl backdrop-blur md:h-auto md:max-h-[85vh] md:max-w-3xl md:rounded-2xl"
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
              <div className="flex items-center justify-between">
                <div className="inline-flex rounded-full bg-white/10 p-1 text-xs font-semibold text-[var(--text)]">
                  <button
                    type="button"
                    onClick={() => setSelectedKind('expense')}
                    disabled={saving}
                    className={`rounded-full px-3 py-1 ${selectedKind === 'expense' ? 'bg-white text-black' : 'text-[var(--text-muted)]'}`}
                  >
                    Gastos
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedKind('income')}
                    disabled={saving}
                    className={`rounded-full px-3 py-1 ${selectedKind === 'income' ? 'bg-white text-black' : 'text-[var(--text-muted)]'}`}
                  >
                    Ingresos
                  </button>
                </div>
              </div>
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
                    Arrastra para ordenar en desktop o usa las flechas en movil. Solo las primeras 19 activas aparecen en el acceso rapido.
                  </div>

                  <div className="space-y-3">
                    <div className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">Activas</div>
                    {orderedCategories.length === 0 ? (
                      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)]/40 p-3 text-sm text-[var(--text-muted)]">
                        No hay categorías activas.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {orderedCategories.map((cat, index) => {
                          const isEditing = editingId === cat.id;
                          const isDragOver = dragOverId === cat.id;
                          const isFirst = index === 0;
                          const isLast = index === orderedCategories.length - 1;
                          const isFallback = cat.id === fallbackId;
                          return (
                            <div
                              key={cat.id}
                              onDragOver={handleDragOver(cat.id)}
                              onDrop={handleDrop(cat.id)}
                              className={`grid grid-cols-[auto,1fr,auto] items-center gap-2 rounded-xl border px-3 py-3 transition ${
                                isEditing
                                  ? 'border-primary/60 bg-primary/10'
                                  : 'border-[var(--card-border)] bg-[var(--card)]/40 hover:border-primary/40'
                              } ${isDragOver ? 'border-primary/70 ring-1 ring-primary/30' : ''}`}
                            >
                              <div className="flex flex-col items-center gap-1">
                                <button
                                  type="button"
                                  draggable={!saving && !isFallback}
                                  onDragStart={handleDragStart(cat.id)}
                                  onDragEnd={handleDragEnd}
                                  className="hidden h-10 w-10 items-center justify-center rounded-lg border border-[var(--card-border)] bg-[var(--input-bg)] text-[var(--text-muted)] hover:border-primary cursor-grab active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50 md:flex"
                                  aria-label="Reordenar categoria"
                                  disabled={saving || isFallback}
                                >
                                  <GripVertical className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveCategory(index, index - 1)}
                                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--card-border)] bg-[var(--input-bg)] text-[var(--text-muted)] hover:border-primary disabled:opacity-50 md:hidden"
                                  aria-label="Mover categoria arriba"
                                  disabled={saving || isFirst || isFallback}
                                >
                                  <ChevronUp className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveCategory(index, index + 1)}
                                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--card-border)] bg-[var(--input-bg)] text-[var(--text-muted)] hover:border-primary disabled:opacity-50 md:hidden"
                                  aria-label="Mover categoria abajo"
                                  disabled={saving || isLast || isFallback}
                                >
                                  <ChevronDown className="h-4 w-4" />
                                </button>
                              </div>
                              <div className="flex min-w-0 items-center gap-2">
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
                              <div className="flex items-center gap-2 justify-self-end">
                                <button
                                  type="button"
                                  onClick={() => handleToggleActive(cat)}
                                  className={`flex items-center gap-1 rounded-full border px-1.5 py-1 text-[11px] font-semibold transition ${
                                    cat.isArchived
                                      ? 'border-white/10 text-[var(--text-muted)]'
                                      : 'border-primary/40 text-[var(--text)]'
                                  }`}
                                  aria-pressed={!cat.isArchived}
                                  aria-label={cat.isArchived ? 'Activar categoría' : 'Desactivar categoría'}
                                  disabled={saving || isFallback}
                                >
                                  <span className="sr-only sm:not-sr-only">Activa</span>
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
                                {!cat.isSystem && !isFallback && (
                                  <button
                                    type="button"
                                    onClick={() => handleArchive(cat)}
                                    className="flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--card-border)] bg-[var(--input-bg)] text-[var(--error-text)] hover:border-[var(--danger-border)] disabled:opacity-60"
                                    title="Eliminar categoría"
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
                            className="grid grid-cols-[auto,1fr,auto] items-center gap-2 rounded-xl border border-[var(--card-border)] bg-[var(--card)]/30 px-3 py-3 opacity-80"
                          >
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--input-bg)]">
                              <CategoryIcon name={cat.icon} size={18} />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-[var(--text)]">{cat.label}</p>
                              <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                                Inactiva
                              </span>
                            </div>
                            <div className="flex items-center gap-2 justify-self-end">
                              <button
                                type="button"
                                onClick={() => handleToggleActive(cat)}
                                className="flex items-center gap-1 rounded-full border border-white/10 px-1.5 py-1 text-[11px] font-semibold text-[var(--text-muted)] transition"
                                aria-pressed={!cat.isArchived}
                                aria-label="Activar categoría"
                                disabled={saving || cat.id === fallbackId}
                              >
                                <span className="sr-only sm:not-sr-only">Inactiva</span>
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
                  onChange={(e) => {
                    setFormState((prev) => ({ ...prev, label: e.target.value }));
                    if (formError) setFormError(null);
                    if (duplicateArchivedId) setDuplicateArchivedId(null);
                    if (iconSuggestError) setIconSuggestError(null);
                    if (iconSuggestNotice) setIconSuggestNotice(null);
                  }}
                  placeholder="Ej. Suscripciones"
                  disabled={isEditingFallback}
                  className="w-full rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text)] focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--text-muted)]">Ícono</label>
                <button
                  type="button"
                  onClick={() => {
                    setIconSuggestError(null);
                    setIconSuggestNotice(null);
                    setView('icons');
                  }}
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
              {duplicateArchivedId && (
                <button
                  type="button"
                  onClick={handleReactivateDuplicate}
                  disabled={saving}
                  className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--input-bg)] px-3 py-2 text-xs font-semibold text-[var(--text)] hover:border-primary disabled:opacity-60"
                >
                  Reactivar categoria
                </button>
              )}
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
                <div className="flex items-center gap-2">
                  {showSuggestButton && (
                    <button
                      type="button"
                      onClick={handleSuggestIcon}
                      disabled={iconSuggesting}
                      title="Sugerir con IA"
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--card-border)] bg-[var(--input-bg)] text-[var(--text)] transition hover:border-primary disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label="Sugerir con IA"
                    >
                      {iconSuggesting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4" />
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setView('form')}
                    className="rounded-full border border-[var(--card-border)] bg-[var(--input-bg)] px-3 py-1 text-xs font-semibold text-[var(--text)] hover:border-primary"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
              <div className="max-h-[60vh] overflow-y-auto px-4 py-4">
                {iconSuggestNotice && (
                  <p className="mb-3 text-xs text-white/70">{iconSuggestNotice}</p>
                )}
                {iconSuggestError && (
                  <p className="mb-3 text-xs text-[var(--error-text)]">{iconSuggestError}</p>
                )}
                <IconPicker
                  selectedIcon={formState.icon}
                  onSelect={(icon) => {
                    setIconSuggestError(null);
                    setIconSuggestNotice(null);
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
  , document.body);
}














