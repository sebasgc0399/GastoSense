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
  serverTimestamp,
  setDoc,
  where,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { getFirestoreDb } from '../config/firebase';
import { frequentCategories } from '../data/frequentCategories';
import { CATEGORY_ICONS } from '../utils/categoryIcons';
import type { Category } from '../types';

const COLLECTION = 'categories';
const FALLBACK_CATEGORY_ID = 'otros';
const FALLBACK_CATEGORY_LABEL = 'Otros';

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

const mapCategoryDoc = (docId: string, data: Record<string, unknown>): Category => ({
  id: docId,
  label: (data.label as string) ?? docId,
  icon: (data.icon as string) ?? CATEGORY_ICONS.default ?? 'Tag',
  color: (data.color as string) ?? undefined,
  order: Number(data.order) || 0,
  isArchived: (data.isArchived as boolean) ?? false,
  isSystem: (data.isSystem as boolean) ?? false,
});

const buildCategoryData = (payload: CategoryDraft): Record<string, unknown> => {
  const data: Record<string, unknown> = {
    label: payload.label,
    icon: payload.icon,
    order: typeof payload.order === 'number' ? payload.order : 0,
    isArchived: payload.isArchived ?? false,
    isSystem: payload.isSystem ?? false,
  };
  if (payload.color) data.color = payload.color;
  return data;
};

const touchCategoriesUpdatedAt = async (userId: string): Promise<void> => {
  const db = getFirestoreDb();
  const userRef = doc(db, 'users', userId);
  await setDoc(userRef, { categoriesUpdatedAt: serverTimestamp() }, { merge: true });
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
    });
  });
  const fallbackRef = doc(db, 'users', userId, COLLECTION, FALLBACK_CATEGORY_ID);
  batch.set(fallbackRef, {
    label: FALLBACK_CATEGORY_LABEL,
    icon: CATEGORY_ICONS.default ?? 'Tag',
    order: frequentCategories.length,
    isArchived: false,
    isSystem: true,
  });
  const userRef = doc(db, 'users', userId);
  batch.set(userRef, { categoriesUpdatedAt: serverTimestamp() }, { merge: true });
  await batch.commit();
}

export async function createCategory(userId: string, payload: CategoryDraft): Promise<string> {
  const db = getFirestoreDb();
  const categoryId = payload.id ?? (await getUniqueCategoryId(userId, payload.label));
  const ref = doc(db, 'users', userId, COLLECTION, categoryId);
  await setDoc(ref, buildCategoryData(payload));
  await touchCategoriesUpdatedAt(userId);
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
  const isFallback = id === FALLBACK_CATEGORY_ID;
  if (updates.label !== undefined && (!isFallback || updates.label.trim().toLowerCase() === FALLBACK_CATEGORY_ID)) {
    data.label = isFallback ? FALLBACK_CATEGORY_LABEL : updates.label;
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
  if (Object.keys(data).length === 0) return;
  await updateDoc(ref, data);
  await touchCategoriesUpdatedAt(userId);
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
  if (id === FALLBACK_CATEGORY_ID) {
    await updateCategory(userId, id, { label: FALLBACK_CATEGORY_LABEL, isArchived: false, isSystem: true });
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
    await touchCategoriesUpdatedAt(userId);
    return;
  }

  await updateCategory(userId, id, { isArchived: true });
}
