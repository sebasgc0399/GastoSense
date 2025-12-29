import { useCallback, useEffect, useState } from 'react';
import type { Category, CategoryKind } from '../types';
import {
  createCategory,
  deleteCategoryConditional,
  getUserCategories,
  seedIncomeCategories,
  seedDefaultCategories,
  subscribeToUserCategories,
  updateCategory as updateCategoryService,
} from '../services/categories';
import { CATEGORY_ICONS } from '../utils/categoryIcons';

type CategoryDraft = Omit<Category, 'id' | 'order'> & { id?: string; order?: number };
const EXPENSE_FALLBACK_ID = 'otros';
const EXPENSE_FALLBACK_LABEL = 'Otros';
const INCOME_FALLBACK_ID = 'ingreso';
const FALLBACK_ICON = 'Tag';
const resolveCategoryKind = (value: CategoryKind | undefined) => (value === 'income' ? 'income' : 'expense');

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
  ensureIncomeCategories: () => Promise<void>;
}

export function useCategoriesController({
  userId,
  includeArchived = false,
}: UseCategoriesControllerParams): CategoriesControllerResult {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upsertExpenseFallbackCategory = useCallback(
    async (data: Category[]) => {
      if (!userId) return data;
      const fallback = data.find((cat) => cat.id === EXPENSE_FALLBACK_ID);
      const maxOrder = data
        .filter((cat) => resolveCategoryKind(cat.kind) === 'expense' && cat.id !== EXPENSE_FALLBACK_ID)
        .reduce((max, cat) => Math.max(max, cat.order ?? 0), -1);
      const desiredOrder = maxOrder + 1;

      if (!fallback) {
        const fallbackCategory: Category = {
          id: EXPENSE_FALLBACK_ID,
          label: EXPENSE_FALLBACK_LABEL,
          icon: FALLBACK_ICON,
          order: desiredOrder,
          isArchived: false,
          isSystem: true,
          kind: 'expense',
        };
        await createCategory(userId, {
          ...fallbackCategory,
        });
        return [...data, fallbackCategory];
      }

      const updates: Partial<Omit<Category, 'id'>> = {};
      const nextFallback: Category = { ...fallback };
      if (fallback.label !== EXPENSE_FALLBACK_LABEL) {
        updates.label = EXPENSE_FALLBACK_LABEL;
        nextFallback.label = EXPENSE_FALLBACK_LABEL;
      }
      if (!fallback.isSystem) {
        updates.isSystem = true;
        nextFallback.isSystem = true;
      }
      if (fallback.isArchived) {
        updates.isArchived = false;
        nextFallback.isArchived = false;
      }
      if (resolveCategoryKind(fallback.kind) !== 'expense') {
        updates.kind = 'expense';
        nextFallback.kind = 'expense';
      }
      if ((fallback.order ?? 0) !== desiredOrder) {
        updates.order = desiredOrder;
        nextFallback.order = desiredOrder;
      }

      if (Object.keys(updates).length > 0) {
        await updateCategoryService(userId, fallback.id, updates);
      }

      return data.map((cat) => (cat.id === EXPENSE_FALLBACK_ID ? nextFallback : cat));
    },
    [userId],
  );

  const upsertIncomeFallbackCategory = useCallback(
    async (data: Category[]) => {
      if (!userId) return data;
      const incomeCategories = data.filter(
        (cat) => resolveCategoryKind(cat.kind) === 'income' && cat.id !== INCOME_FALLBACK_ID,
      );
      const fallback = data.find((cat) => cat.id === INCOME_FALLBACK_ID);

      const maxOrder = incomeCategories.reduce((max, cat) => Math.max(max, cat.order ?? 0), -1);
      const desiredOrder = maxOrder + 1;

      if (!fallback) {
        const icon = CATEGORY_ICONS[INCOME_FALLBACK_ID] ?? FALLBACK_ICON;
        const fallbackCategory: Category = {
          id: INCOME_FALLBACK_ID,
          label: 'Ingreso',
          icon,
          order: desiredOrder,
          isArchived: false,
          isSystem: true,
          kind: 'income',
        };
        await createCategory(userId, {
          ...fallbackCategory,
        });
        return [...data, fallbackCategory];
      }

      const updates: Partial<Omit<Category, 'id'>> = {};
      const nextFallback: Category = { ...fallback };
      if (fallback.label !== 'Ingreso') {
        updates.label = 'Ingreso';
        nextFallback.label = 'Ingreso';
      }
      if (!fallback.isSystem) {
        updates.isSystem = true;
        nextFallback.isSystem = true;
      }
      if (fallback.isArchived) {
        updates.isArchived = false;
        nextFallback.isArchived = false;
      }
      if (resolveCategoryKind(fallback.kind) !== 'income') {
        updates.kind = 'income';
        nextFallback.kind = 'income';
      }
      if ((fallback.order ?? 0) !== desiredOrder) {
        updates.order = desiredOrder;
        nextFallback.order = desiredOrder;
      }

      if (Object.keys(updates).length > 0) {
        await updateCategoryService(userId, fallback.id, updates);
      }

      return data.map((cat) => (cat.id === INCOME_FALLBACK_ID ? nextFallback : cat));
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
      data = await upsertExpenseFallbackCategory(data);
      data = await upsertIncomeFallbackCategory(data);
      const nextCategories = includeArchived ? data : data.filter((cat) => !cat.isArchived);
      setCategories(nextCategories);
    } catch (err) {
      console.error(err);
      setError('No se pudieron cargar las categorias.');
    } finally {
      setLoading(false);
    }
  }, [includeArchived, upsertExpenseFallbackCategory, upsertIncomeFallbackCategory, userId]);

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
        let patched = await upsertExpenseFallbackCategory(data);
        patched = await upsertIncomeFallbackCategory(patched);
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
  }, [includeArchived, upsertExpenseFallbackCategory, upsertIncomeFallbackCategory, userId]);

  const addCategory = useCallback(
    async (payload: CategoryDraft) => {
      if (!userId) return;
      const kind = payload.kind ?? 'expense';
      const labelKey = normalizeCategoryLabelKey(payload.label);
      if (labelKey) {
        const allCategories = await getUserCategories(userId);
        const duplicate = allCategories.find(
          (cat) =>
            normalizeCategoryLabelKey(cat.label) === labelKey && resolveCategoryKind(cat.kind) === kind,
        );
        if (duplicate) {
          throw new CategoryDuplicateError(
            duplicate.isArchived ? 'duplicate_archived' : 'duplicate_active',
            duplicate.id,
            duplicate.label,
          );
        }
      }
      const maxOrder = categories
        .filter((cat) => resolveCategoryKind(cat.kind) === kind && cat.id !== (kind === 'income' ? INCOME_FALLBACK_ID : EXPENSE_FALLBACK_ID))
        .reduce((max, cat) => Math.max(max, cat.order ?? 0), -1);
      const order = payload.order ?? maxOrder + 1;
      await createCategory(userId, { ...payload, order, kind });
      await refreshCategories();
    },
    [categories, refreshCategories, userId],
  );

  const updateCategory = useCallback(
    async (id: string, updates: Partial<Omit<Category, 'id'>>) => {
      if (!userId) return;
      if (updates.label !== undefined) {
        const target = categories.find((cat) => cat.id === id);
        const nextKind = resolveCategoryKind(updates.kind ?? target?.kind);
        const nextLabelKey = normalizeCategoryLabelKey(updates.label);
        const currentLabelKey = normalizeCategoryLabelKey(target?.label ?? '');

        if (nextLabelKey && nextLabelKey !== currentLabelKey) {
          const dup = categories.find(
            (cat) =>
              cat.id !== id &&
              !cat.isArchived &&
              normalizeCategoryLabelKey(cat.label) === nextLabelKey &&
              resolveCategoryKind(cat.kind) === nextKind,
          );

          if (dup) {
            throw new CategoryDuplicateError(
              dup.isArchived ? 'duplicate_archived' : 'duplicate_active',
              dup.id,
              dup.label,
            );
          }
        }
      }
      await updateCategoryService(userId, id, updates);
      await refreshCategories();
    },
    [categories, refreshCategories, userId],
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

  const ensureIncomeCategories = useCallback(async () => {
    if (!userId) return;
    try {
      const didSeed = await seedIncomeCategories(userId);
      if (didSeed) {
        await refreshCategories();
      }
    } catch (err) {
      console.error(err);
      setError('No se pudieron crear categorias de ingreso.');
    }
  }, [refreshCategories, userId]);

  return {
    categories,
    loading,
    error,
    refreshCategories,
    addCategory,
    updateCategory,
    deleteCategory,
    ensureIncomeCategories,
  };
}
