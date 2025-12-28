import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  where,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { getFirestoreDb } from '../config/firebase';
import { frequentCategories } from '../data/frequentCategories';
import { CATEGORY_ICONS } from '../utils/categoryIcons';
import type { Category, CategoryKind } from '../types';

const COLLECTION = 'categories';
const EXPENSE_FALLBACK_ID = 'otros';
const EXPENSE_FALLBACK_LABEL = 'Otros';
const INCOME_FALLBACK_ID = 'ingreso';
const INCOME_FALLBACK_LABEL = 'Ingreso';
const INCOME_DEFAULTS = [
  { id: 'salario', label: 'Salario' },
  { id: 'inversion', label: 'Inversion' },
  { id: 'recompensa', label: 'Recompensa' },
  { id: 'regalos', label: 'Regalos' },
  { id: 'negocio', label: 'Negocio' },
];

type CategoryDraft = Omit<Category, 'id'> & { id?: string };

const slugifyLabel = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');

const getUniqueCategoryId = async (userId: string, label: string): Promise<string> => {
  const db = getFirestoreDb();
  const base = slugifyLabel(label) || `categoria-${Date.now()}`;
  let candidate = base;
  let suffix = 2;

  // Ensure we don't overwrite existing category documents.
  while ((await getDoc(doc(db, 'users', userId, COLLECTION, candidate))).exists()) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
};

const resolveCategoryKind = (value: unknown): CategoryKind => (value === 'income' ? 'income' : 'expense');

const mapCategoryDoc = (docId: string, data: Record<string, unknown>): Category => ({
  id: docId,
  label: (data.label as string) ?? docId,
  icon: (data.icon as string) ?? CATEGORY_ICONS.default ?? 'Tag',
  color: (data.color as string) ?? undefined,
  order: Number(data.order) || 0,
  isArchived: (data.isArchived as boolean) ?? false,
  isSystem: (data.isSystem as boolean) ?? false,
  kind: resolveCategoryKind(data.kind),
});

const buildCategoryData = (payload: CategoryDraft): Record<string, unknown> => {
  const data: Record<string, unknown> = {
    label: payload.label,
    icon: payload.icon,
    order: typeof payload.order === 'number' ? payload.order : 0,
    isArchived: payload.isArchived ?? false,
    isSystem: payload.isSystem ?? false,
    kind: payload.kind ?? 'expense',
  };
  if (payload.color) data.color = payload.color;
  return data;
};

export async function getUserCategories(userId: string): Promise<Category[]> {
  const db = getFirestoreDb();
  const ref = collection(db, 'users', userId, COLLECTION);
  const q = query(ref, orderBy('order', 'asc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((docSnap) => mapCategoryDoc(docSnap.id, docSnap.data()));
}

export async function seedDefaultCategories(userId: string): Promise<void> {
  const db = getFirestoreDb();
  const ref = collection(db, 'users', userId, COLLECTION);
  const existing = await getDocs(query(ref, limit(1)));
  if (!existing.empty) return;

  const batch = writeBatch(db);
  frequentCategories.forEach((cat, index) => {
    const icon = CATEGORY_ICONS[cat.id] ?? CATEGORY_ICONS.default ?? 'Tag';
    const docRef = doc(db, 'users', userId, COLLECTION, cat.id);
    batch.set(docRef, {
      label: cat.label,
      icon,
      order: index,
      isArchived: false,
      isSystem: true,
      kind: 'expense',
    });
  });
  const fallbackRef = doc(db, 'users', userId, COLLECTION, EXPENSE_FALLBACK_ID);
  batch.set(fallbackRef, {
    label: EXPENSE_FALLBACK_LABEL,
    icon: CATEGORY_ICONS.default ?? 'Tag',
    order: frequentCategories.length,
    isArchived: false,
    isSystem: true,
    kind: 'expense',
  });
  await batch.commit();
}

export async function seedIncomeCategories(userId: string): Promise<boolean> {
  const db = getFirestoreDb();
  const existing = await getUserCategories(userId);
  const existingById = new Map(existing.map((cat) => [cat.id, cat]));
  const incomeCategories = existing.filter(
    (cat) => resolveCategoryKind(cat.kind) === 'income' && cat.id !== INCOME_FALLBACK_ID,
  );
  const maxOrder = incomeCategories.reduce((max, cat) => Math.max(max, cat.order ?? 0), -1);
  let nextOrder = maxOrder + 1;

  const batch = writeBatch(db);
  let didWrite = false;
  // Nota: no hacemos backfill de iconos; solo sembramos lo que falte.

  for (const cat of INCOME_DEFAULTS) {
    const existingCategory = existingById.get(cat.id);
    const icon = CATEGORY_ICONS[cat.id] ?? CATEGORY_ICONS.default ?? 'Tag';
    if (existingCategory) {
      continue;
    }
    const docRef = doc(db, 'users', userId, COLLECTION, cat.id);
    batch.set(docRef, {
      label: cat.label,
      icon,
      order: nextOrder,
      isArchived: false,
      isSystem: true,
      kind: 'income',
    });
    nextOrder += 1;
    didWrite = true;
  }

  const fallbackExisting = existingById.get(INCOME_FALLBACK_ID);
  const fallbackOrder = nextOrder;
  const fallbackIcon = CATEGORY_ICONS[INCOME_FALLBACK_ID] ?? CATEGORY_ICONS.default ?? 'Tag';
  if (!fallbackExisting) {
    const fallbackRef = doc(db, 'users', userId, COLLECTION, INCOME_FALLBACK_ID);
    batch.set(fallbackRef, {
      label: INCOME_FALLBACK_LABEL,
      icon: fallbackIcon,
      order: fallbackOrder,
      isArchived: false,
      isSystem: true,
      kind: 'income',
    });
    didWrite = true;
  } else {
    const updates: Record<string, unknown> = {};
    if (fallbackExisting.label !== INCOME_FALLBACK_LABEL) updates.label = INCOME_FALLBACK_LABEL;
    if (fallbackExisting.isSystem !== true) updates.isSystem = true;
    if (fallbackExisting.isArchived) updates.isArchived = false;
    if (resolveCategoryKind(fallbackExisting.kind) !== 'income') updates.kind = 'income';
    if ((fallbackExisting.order ?? 0) !== fallbackOrder) updates.order = fallbackOrder;
    if (Object.keys(updates).length > 0) {
      const fallbackRef = doc(db, 'users', userId, COLLECTION, INCOME_FALLBACK_ID);
      batch.update(fallbackRef, updates);
      didWrite = true;
    }
  }

  if (!didWrite) return false;
  await batch.commit();
  return true;
}

export async function createCategory(userId: string, payload: CategoryDraft): Promise<string> {
  const db = getFirestoreDb();
  const categoryId = payload.id ?? (await getUniqueCategoryId(userId, payload.label));
  const ref = doc(db, 'users', userId, COLLECTION, categoryId);
  await setDoc(ref, buildCategoryData(payload));
  return ref.id;
}

export async function updateCategory(
  userId: string,
  id: string,
  updates: Partial<Omit<Category, 'id'>>,
): Promise<void> {
  const db = getFirestoreDb();
  const ref = doc(db, 'users', userId, COLLECTION, id);
  const data: Record<string, unknown> = {};
  const isExpenseFallback = id === EXPENSE_FALLBACK_ID;
  const isIncomeFallback = id === INCOME_FALLBACK_ID;
  const isFallback = isExpenseFallback || isIncomeFallback;
  const fallbackLabel = isIncomeFallback ? INCOME_FALLBACK_LABEL : EXPENSE_FALLBACK_LABEL;
  const fallbackKind: CategoryKind = isIncomeFallback ? 'income' : 'expense';
  if (updates.label !== undefined) {
    data.label = isFallback ? fallbackLabel : updates.label;
  }
  if (updates.icon !== undefined) data.icon = updates.icon;
  if (updates.color !== undefined) data.color = updates.color;
  if (updates.order !== undefined) data.order = updates.order;
  if (updates.isArchived !== undefined) {
    if (!isFallback || updates.isArchived === false) data.isArchived = updates.isArchived;
  }
  if (updates.isSystem !== undefined) {
    if (!isFallback || updates.isSystem === true) data.isSystem = updates.isSystem;
  }
  if (updates.kind !== undefined) {
    data.kind = isFallback ? fallbackKind : updates.kind;
  }
  if (Object.keys(data).length === 0) return;
  await updateDoc(ref, data);
}

export async function archiveCategory(userId: string, id: string): Promise<void> {
  await updateCategory(userId, id, { isArchived: true });
}

export function subscribeToUserCategories(
  userId: string,
  onData: (categories: Category[]) => void,
  onError?: (error: Error) => void,
): () => void {
  const db = getFirestoreDb();
  const ref = collection(db, 'users', userId, COLLECTION);
  const q = query(ref, orderBy('order', 'asc'));
  return onSnapshot(
    q,
    (snapshot) => {
      onData(snapshot.docs.map((docSnap) => mapCategoryDoc(docSnap.id, docSnap.data())));
    },
    (error) => {
      if (onError) onError(error as Error);
    },
  );
}

export async function deleteCategoryConditional(
  userId: string,
  id: string,
  isSystem?: boolean,
): Promise<void> {
  if (id === EXPENSE_FALLBACK_ID) {
    await updateCategory(userId, id, {
      label: EXPENSE_FALLBACK_LABEL,
      isArchived: false,
      isSystem: true,
      kind: 'expense',
    });
    return;
  }
  if (id === INCOME_FALLBACK_ID) {
    await updateCategory(userId, id, {
      label: INCOME_FALLBACK_LABEL,
      isArchived: false,
      isSystem: true,
      kind: 'income',
    });
    return;
  }
  const db = getFirestoreDb();
  let systemFlag = isSystem;
  if (systemFlag === undefined) {
    const catRef = doc(db, 'users', userId, COLLECTION, id);
    const snapshot = await getDoc(catRef);
    systemFlag = (snapshot.data()?.isSystem as boolean) ?? false;
  }

  if (systemFlag) {
    await updateCategory(userId, id, { isArchived: true });
    return;
  }

  const transactionsRef = collection(db, 'transactions');
  const usageByIdQuery = query(
    transactionsRef,
    where('userId', '==', userId),
    where('categoryId', '==', id),
    limit(1),
  );
  const usageByIdSnapshot = await getDocs(usageByIdQuery);

  const usageByLegacySnapshot = usageByIdSnapshot.empty
    ? await getDocs(
        query(transactionsRef, where('userId', '==', userId), where('category', '==', id), limit(1)),
      )
    : usageByIdSnapshot;

  if (usageByLegacySnapshot.empty) {
    const catRef = doc(db, 'users', userId, COLLECTION, id);
    await deleteDoc(catRef);
    return;
  }

  await updateCategory(userId, id, { isArchived: true });
}
