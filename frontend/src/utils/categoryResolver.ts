import type { Category } from '../types';

export type CategoryResolver = {
  categoriesById: Record<string, Category>;
  idByNormalizedLabel: Record<string, string>;
};

export const normalizeCategoryLabel = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

export const buildCategoryResolver = (categories: Category[]): CategoryResolver => {
  const sorted = [...categories].sort((a, b) => {
    const orderDiff = (a.order ?? 0) - (b.order ?? 0);
    if (orderDiff !== 0) return orderDiff;
    return a.label.localeCompare(b.label, 'es-CO');
  });

  const categoriesById: Record<string, Category> = {};
  const idByNormalizedLabel: Record<string, string> = {};

  for (const category of sorted) {
    categoriesById[category.id] = category;
    const normalized = normalizeCategoryLabel(category.label);
    if (normalized && !idByNormalizedLabel[normalized]) {
      idByNormalizedLabel[normalized] = category.id;
    }
  }

  return { categoriesById, idByNormalizedLabel };
};

export const resolveCanonicalCategoryId = (rawCategory: string, resolver?: CategoryResolver): string => {
  const value = typeof rawCategory === 'string' ? rawCategory.trim() : '';
  if (!resolver || !value) return rawCategory;
  if (resolver.categoriesById[value]) return value;
  const normalized = normalizeCategoryLabel(value);
  const match = normalized ? resolver.idByNormalizedLabel[normalized] : undefined;
  return match ?? value;
};

export const resolveCategoryLabel = (categoryId: string, resolver?: CategoryResolver): string | null => {
  if (!resolver) return null;
  return resolver.categoriesById[categoryId]?.label ?? null;
};

export const truncateCategoryId = (value: string, head = 6, tail = 3) => {
  const trimmed = value?.trim();
  if (!trimmed) return '';
  if (trimmed.length <= head + tail + 1) return trimmed;
  return `${trimmed.slice(0, head)}…${trimmed.slice(-tail)}`;
};

