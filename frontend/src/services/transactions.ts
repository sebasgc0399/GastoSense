import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type QueryConstraint,
} from 'firebase/firestore';
import { getFirestoreDb } from '../config/firebase';
import type { Transaction, TransactionInput } from '../types';

const COLLECTION = 'transactions';
const EXPENSE_FALLBACK_ID = 'otros';
const INCOME_FALLBACK_ID = 'ingreso';

interface ListenParams {
  userId: string;
  startDate?: string;
  endDate?: string;
  category?: string;
  type?: 'all' | 'expense' | 'income';
  onChange: (transactions: Transaction[]) => void;
  onError?: (error: Error) => void;
}

export function listenTransactions({ userId, startDate, endDate, category, type, onChange, onError }: ListenParams) {
  const db = getFirestoreDb();
  const constraints: QueryConstraint[] = [where('userId', '==', userId), orderBy('date', 'desc')];
  const normalizedType = type ?? 'all';
  const fallbackType =
    category === EXPENSE_FALLBACK_ID ? 'expense' : category === INCOME_FALLBACK_ID ? 'income' : null;
  const effectiveType = normalizedType !== 'all' ? normalizedType : fallbackType ?? 'all';

  if (startDate) constraints.push(where('date', '>=', startDate));
  if (endDate) constraints.push(where('date', '<=', endDate));
  if (effectiveType !== 'all') constraints.push(where('type', '==', effectiveType));
  if (category && category !== 'all' && category !== EXPENSE_FALLBACK_ID && category !== INCOME_FALLBACK_ID) {
    constraints.push(where('categoryId', '==', category));
  }

  const q = query(collection(db, COLLECTION), ...constraints);

  return onSnapshot(
    q,
    (snapshot) => {
      const mapped: Transaction[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        const rawDate = data.date;
        const date =
          typeof rawDate === 'string'
            ? rawDate
            : rawDate?.toDate
              ? rawDate.toDate().toISOString().slice(0, 10)
              : '';
        const type = data.type === 'income' ? 'income' : 'expense';
        const rawCategoryId =
          typeof data.categoryId === 'string' ? data.categoryId : (data.category as string | undefined);
        const normalizedCategoryId =
          rawCategoryId && rawCategoryId !== 'sin-categoria' ? rawCategoryId : undefined;
        const categoryId =
          type === 'income'
            ? (normalizedCategoryId ?? INCOME_FALLBACK_ID)
            : (normalizedCategoryId ?? EXPENSE_FALLBACK_ID);
        return {
          id: docSnap.id,
          amount: Number(data.amount) || 0,
          categoryId,
          note: data.note ?? '',
          type,
          date,
          paymentMethod: data.paymentMethod ?? 'otro',
          userId: data.userId,
        };
      });
      onChange(mapped);
    },
    (error) => {
      console.error(error);
      onError?.(error);
    },
  );
}

export async function fetchTransactionsRange(params: {
  userId: string;
  startDate?: string;
  endDate?: string;
  category?: string;
  type?: 'all' | 'expense' | 'income';
}): Promise<Transaction[]> {
  const db = getFirestoreDb();
  const constraints: QueryConstraint[] = [where('userId', '==', params.userId), orderBy('date', 'desc')];
  const normalizedType = params.type ?? 'all';
  const fallbackType =
    params.category === EXPENSE_FALLBACK_ID ? 'expense' : params.category === INCOME_FALLBACK_ID ? 'income' : null;
  const effectiveType = normalizedType !== 'all' ? normalizedType : fallbackType ?? 'all';
  if (params.startDate) constraints.push(where('date', '>=', params.startDate));
  if (params.endDate) constraints.push(where('date', '<=', params.endDate));
  if (effectiveType !== 'all') constraints.push(where('type', '==', effectiveType));
  if (
    params.category &&
    params.category !== 'all' &&
    params.category !== EXPENSE_FALLBACK_ID &&
    params.category !== INCOME_FALLBACK_ID
  ) {
    constraints.push(where('categoryId', '==', params.category));
  }

  const q = query(collection(db, COLLECTION), ...constraints);
  const snapshot = await getDocs(q);

  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    const rawDate = data.date;
    const date =
      typeof rawDate === 'string'
        ? rawDate
        : rawDate?.toDate
          ? rawDate.toDate().toISOString().slice(0, 10)
          : '';
    const type = data.type === 'income' ? 'income' : 'expense';
    const rawCategoryId =
      typeof data.categoryId === 'string' ? data.categoryId : (data.category as string | undefined);
    const normalizedCategoryId = rawCategoryId && rawCategoryId !== 'sin-categoria' ? rawCategoryId : undefined;
    const categoryId =
      type === 'income'
        ? (normalizedCategoryId ?? INCOME_FALLBACK_ID)
        : (normalizedCategoryId ?? EXPENSE_FALLBACK_ID);
    return {
      id: docSnap.id,
      amount: Number(data.amount) || 0,
      categoryId,
      note: data.note ?? '',
      type,
      date,
      paymentMethod: data.paymentMethod ?? 'otro',
      userId: data.userId,
    };
  });
}

export async function createTransaction(payload: TransactionInput, userId: string) {
  const db = getFirestoreDb();
  const resolvedCategoryId =
    payload.categoryId || (payload.type === 'income' ? INCOME_FALLBACK_ID : EXPENSE_FALLBACK_ID);
  const data: Record<string, unknown> = {
    amount: payload.amount,
    type: payload.type,
    date: payload.date,
    paymentMethod: payload.paymentMethod,
    userId,
    createdAt: serverTimestamp(),
  };
  if (payload.note !== undefined) data.note = payload.note;
  data.categoryId = resolvedCategoryId;
  data.category = resolvedCategoryId;
  await addDoc(collection(db, COLLECTION), data);
}

export async function updateTransaction(id: string, payload: TransactionInput, userId: string) {
  const db = getFirestoreDb();
  const resolvedCategoryId =
    payload.categoryId || (payload.type === 'income' ? INCOME_FALLBACK_ID : EXPENSE_FALLBACK_ID);
  const ref = doc(db, COLLECTION, id);
  const data: Record<string, unknown> = {
    amount: payload.amount,
    type: payload.type,
    date: payload.date,
    paymentMethod: payload.paymentMethod,
    userId,
  };
  if (payload.note !== undefined) data.note = payload.note;
  data.categoryId = resolvedCategoryId;
  data.category = resolvedCategoryId;
  await updateDoc(ref, data);
}

export async function deleteTransaction(id: string) {
  const db = getFirestoreDb();
  const ref = doc(db, COLLECTION, id);
  await deleteDoc(ref);
}
