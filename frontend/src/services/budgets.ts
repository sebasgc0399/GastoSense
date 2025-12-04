import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { Budget } from '../types';

const COLLECTION = 'budgets';

export async function getBudget(userId: string, month: string): Promise<Budget | null> {
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

export async function saveBudget(
  userId: string,
  month: string,
  payload: { total: number; perCategory?: Record<string, number> },
) {
  const ref = doc(db, COLLECTION, `${userId}_${month}`);
  await setDoc(
    ref,
    {
      month,
      total: payload.total,
      perCategory: payload.perCategory ?? {},
      updatedAt: serverTimestamp(),
      userId,
    },
    { merge: true },
  );
}
