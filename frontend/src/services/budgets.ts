import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getFirestoreDb } from '../config/firebase';
import type { Budget } from '../types';

const COLLECTION = 'budgets';

export async function getBudget(userId: string, month: string): Promise<Budget | null> {
  const db = getFirestoreDb();
  const ref = doc(db, COLLECTION, `${userId}_${month}`);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data();
  const updatedAt =
    (data.updatedAt?.toDate && data.updatedAt.toDate().toISOString()) || data.updatedAt?.toString() || undefined;
  return {
    month,
    total: Number(data.total) || 0,
    perCategory: data.perCategory ?? undefined,
    updatedAt,
  };
}

export async function saveBudgetTotal({
  uid,
  month,
  total,
}: {
  uid: string;
  month: string;
  total: number;
}) {
  const db = getFirestoreDb();
  const ref = doc(db, COLLECTION, `${uid}_${month}`);
  await setDoc(
    ref,
    {
      month,
      total,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function saveBudgetPerCategory({
  uid,
  month,
  perCategory,
}: {
  uid: string;
  month: string;
  perCategory: Record<string, number>;
}) {
  const db = getFirestoreDb();
  const ref = doc(db, COLLECTION, `${uid}_${month}`);
  await setDoc(
    ref,
    {
      month,
      perCategory,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}
