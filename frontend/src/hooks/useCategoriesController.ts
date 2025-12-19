import { useCallback, useEffect, useState } from 'react';
import type { Category } from '../types';
import {
  archiveCategory,
  createCategory,
  getUserCategories,
  seedDefaultCategories,
  updateCategory as updateCategoryService,
} from '../services/categories';

type CategoryDraft = Omit<Category, 'id' | 'order'> & { id?: string; order?: number };

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
      const nextCategories = includeArchived ? data : data.filter((cat) => !cat.isArchived);
      setCategories(nextCategories);
    } catch (err) {
      console.error(err);
      setError('No se pudieron cargar las categorias.');
    } finally {
      setLoading(false);
    }
  }, [includeArchived, userId]);

  useEffect(() => {
    void refreshCategories();
  }, [refreshCategories]);

  const addCategory = useCallback(
    async (payload: CategoryDraft) => {
      if (!userId) return;
      const order = payload.order ?? categories.length;
      await createCategory(userId, { ...payload, order });
      await refreshCategories();
    },
    [categories.length, refreshCategories, userId],
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
      await archiveCategory(userId, id);
      await refreshCategories();
    },
    [refreshCategories, userId],
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
