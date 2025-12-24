import { useCallback, useEffect, useState } from 'react';
import type { Category } from '../types';
import {
  createCategory,
  deleteCategoryConditional,
  getUserCategories,
  seedDefaultCategories,
  subscribeToUserCategories,
  updateCategory as updateCategoryService,
} from '../services/categories';

type CategoryDraft = Omit<Category, 'id' | 'order'> & { id?: string; order?: number };
const FALLBACK_CATEGORY_ID = 'otros';
const FALLBACK_CATEGORY_LABEL = 'Otros';
const FALLBACK_ICON = 'Tag';

export type CategoryDuplicateCode = 'duplicate_active' | 'duplicate_archived';

export class CategoryDuplicateError extends Error {
  code: CategoryDuplicateCode;
  categoryId: string;
  label: string;

  constructor(code: CategoryDuplicateCode, categoryId: string, label: string) {
    super(code === 'duplicate_archived' ? 'Category exists but archived' : 'Category already exists');
    this.name = 'CategoryDuplicateError';
    this.code = code;
    this.categoryId = categoryId;
    this.label = label;
  }
}

export const isCategoryDuplicateError = (err: unknown): err is CategoryDuplicateError => {
  if (!err || typeof err !== 'object') return false;
  const candidate = err as { code?: string; categoryId?: string; label?: string };
  return (
    (candidate.code === 'duplicate_active' || candidate.code === 'duplicate_archived') &&
    typeof candidate.categoryId === 'string'
  );
};

const normalizeCategoryLabelKey = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

export interface UseCategoriesControllerParams {
  userId: string | null | undefined;
  includeArchived?: boolean;
}

export interface CategoriesControllerResult {
  categories: Category[];
  loading: boolean;
  error: string | null;
  refreshCategories: () => Promise<void>;
  addCategory: (payload: CategoryDraft) => Promise<void>;
  updateCategory: (id: string, updates: Partial<Omit<Category, 'id'>>) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
}

export function useCategoriesController({
  userId,
  includeArchived = false,
}: UseCategoriesControllerParams): CategoriesControllerResult {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upsertFallbackCategory = useCallback(
    async (data: Category[]) => {
      if (!userId) return data;
      const fallback = data.find((cat) => cat.id === FALLBACK_CATEGORY_ID);
      const maxOrder = data
        .filter((cat) => cat.id !== FALLBACK_CATEGORY_ID)
        .reduce((max, cat) => Math.max(max, cat.order ?? 0), -1);
      const desiredOrder = maxOrder + 1;

      if (!fallback) {
        await createCategory(userId, {
          id: FALLBACK_CATEGORY_ID,
          label: FALLBACK_CATEGORY_LABEL,
          icon: FALLBACK_ICON,
          order: desiredOrder,
          isArchived: false,
          isSystem: true,
        });
        return [
          ...data,
          {
            id: FALLBACK_CATEGORY_ID,
            label: FALLBACK_CATEGORY_LABEL,
            icon: FALLBACK_ICON,
            order: desiredOrder,
            isArchived: false,
            isSystem: true,
          },
        ];
      }

      const updates: Partial<Omit<Category, 'id'>> = {};
      const nextFallback: Category = { ...fallback };
      if (fallback.label !== FALLBACK_CATEGORY_LABEL) {
        updates.label = FALLBACK_CATEGORY_LABEL;
        nextFallback.label = FALLBACK_CATEGORY_LABEL;
      }
      if (!fallback.isSystem) {
        updates.isSystem = true;
        nextFallback.isSystem = true;
      }
      if (fallback.isArchived) {
        updates.isArchived = false;
        nextFallback.isArchived = false;
      }
      if ((fallback.order ?? 0) !== desiredOrder) {
        updates.order = desiredOrder;
        nextFallback.order = desiredOrder;
      }

      if (Object.keys(updates).length > 0) {
        await updateCategoryService(userId, fallback.id, updates);
      }

      return data.map((cat) => (cat.id === FALLBACK_CATEGORY_ID ? nextFallback : cat));
    },
    [userId],
  );

  const refreshCategories = useCallback(async () => {
    if (!userId) {
      setCategories([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      let data = await getUserCategories(userId);
      if (data.length === 0) {
        await seedDefaultCategories(userId);
        data = await getUserCategories(userId);
      }
      data = await upsertFallbackCategory(data);
      const nextCategories = includeArchived ? data : data.filter((cat) => !cat.isArchived);
      setCategories(nextCategories);
    } catch (err) {
      console.error(err);
      setError('No se pudieron cargar las categorias.');
    } finally {
      setLoading(false);
    }
  }, [includeArchived, upsertFallbackCategory, userId]);

  useEffect(() => {
    if (!userId) {
      setCategories([]);
      setLoading(false);
      return;
    }

    let isMounted = true;
    let didSeed = false;
    setLoading(true);
    setError(null);

    const unsubscribe = subscribeToUserCategories(
      userId,
      async (data) => {
        if (!isMounted) return;
        if (data.length === 0 && !didSeed) {
          didSeed = true;
          try {
            await seedDefaultCategories(userId);
          } catch (err) {
            console.error(err);
            setError('No se pudieron cargar las categorias.');
            setLoading(false);
          }
          return;
        }
        const patched = await upsertFallbackCategory(data);
        const nextCategories = includeArchived ? patched : patched.filter((cat) => !cat.isArchived);
        setCategories(nextCategories);
        setLoading(false);
      },
      (err) => {
        if (!isMounted) return;
        console.error(err);
        setError('No se pudieron cargar las categorias.');
        setLoading(false);
      },
    );

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [includeArchived, upsertFallbackCategory, userId]);

  const addCategory = useCallback(
    async (payload: CategoryDraft) => {
      if (!userId) return;
      const labelKey = normalizeCategoryLabelKey(payload.label);
      if (labelKey) {
        const allCategories = await getUserCategories(userId);
        const duplicate = allCategories.find((cat) => normalizeCategoryLabelKey(cat.label) === labelKey);
        if (duplicate) {
          throw new CategoryDuplicateError(
            duplicate.isArchived ? 'duplicate_archived' : 'duplicate_active',
            duplicate.id,
            duplicate.label,
          );
        }
      }
      const maxOrder = categories
        .filter((cat) => cat.id !== FALLBACK_CATEGORY_ID)
        .reduce((max, cat) => Math.max(max, cat.order ?? 0), -1);
      const order = payload.order ?? maxOrder + 1;
      await createCategory(userId, { ...payload, order });
      await refreshCategories();
    },
    [categories, refreshCategories, userId],
  );

  const updateCategory = useCallback(
    async (id: string, updates: Partial<Omit<Category, 'id'>>) => {
      if (!userId) return;
      await updateCategoryService(userId, id, updates);
      await refreshCategories();
    },
    [refreshCategories, userId],
  );

  const deleteCategory = useCallback(
    async (id: string) => {
      if (!userId) return;
      const target = categories.find((cat) => cat.id === id);
      await deleteCategoryConditional(userId, id, target?.isSystem);
      await refreshCategories();
    },
    [categories, refreshCategories, userId],
  );

  return {
    categories,
    loading,
    error,
    refreshCategories,
    addCategory,
    updateCategory,
    deleteCategory,
  };
}
