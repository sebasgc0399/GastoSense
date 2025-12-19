import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { getFirestoreDb } from '../config/firebase';
import { frequentCategories } from '../data/frequentCategories';
import { CATEGORY_ICONS } from '../utils/categoryIcons';
import type { Category } from '../types';

const COLLECTION = 'categories';

type CategoryDraft = Omit<Category, 'id'> & { id?: string };

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
  await batch.commit();
}

export async function createCategory(userId: string, payload: CategoryDraft): Promise<string> {
  const db = getFirestoreDb();
  const ref = payload.id
    ? doc(db, 'users', userId, COLLECTION, payload.id)
    : doc(collection(db, 'users', userId, COLLECTION));
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
  if (updates.label !== undefined) data.label = updates.label;
  if (updates.icon !== undefined) data.icon = updates.icon;
  if (updates.color !== undefined) data.color = updates.color;
  if (updates.order !== undefined) data.order = updates.order;
  if (updates.isArchived !== undefined) data.isArchived = updates.isArchived;
  if (updates.isSystem !== undefined) data.isSystem = updates.isSystem;
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
