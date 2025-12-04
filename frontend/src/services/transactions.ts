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
import { db } from '../config/firebase';
import type { Transaction, TransactionInput } from '../types';

const COLLECTION = 'transactions';

interface ListenParams {
  userId: string;
  startDate?: string;
  endDate?: string;
  category?: string;
  onChange: (transactions: Transaction[]) => void;
  onError?: (error: Error) => void;
}

export function listenTransactions({ userId, startDate, endDate, category, onChange, onError }: ListenParams) {
  const constraints: QueryConstraint[] = [where('userId', '==', userId), orderBy('date', 'desc')];

  if (startDate) constraints.push(where('date', '>=', startDate));
  if (endDate) constraints.push(where('date', '<=', endDate));
  if (category && category !== 'all') constraints.push(where('category', '==', category));

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
        return {
          id: docSnap.id,
          amount: Number(data.amount) || 0,
          category: data.category ?? 'sin-categoria',
          note: data.note ?? '',
          type: data.type === 'income' ? 'income' : 'expense',
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
}): Promise<Transaction[]> {
  const constraints: QueryConstraint[] = [where('userId', '==', params.userId), orderBy('date', 'desc')];
  if (params.startDate) constraints.push(where('date', '>=', params.startDate));
  if (params.endDate) constraints.push(where('date', '<=', params.endDate));
  if (params.category && params.category !== 'all') constraints.push(where('category', '==', params.category));

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
    return {
      id: docSnap.id,
      amount: Number(data.amount) || 0,
      category: data.category ?? 'sin-categoria',
      note: data.note ?? '',
      type: data.type === 'income' ? 'income' : 'expense',
      date,
      paymentMethod: data.paymentMethod ?? 'otro',
      userId: data.userId,
    };
  });
}

export async function createTransaction(payload: TransactionInput, userId: string) {
  await addDoc(collection(db, COLLECTION), {
    ...payload,
    userId,
    createdAt: serverTimestamp(),
  });
}

export async function updateTransaction(id: string, payload: TransactionInput, userId: string) {
  const ref = doc(db, COLLECTION, id);
  await updateDoc(ref, { ...payload, userId });
}

export async function deleteTransaction(id: string) {
  const ref = doc(db, COLLECTION, id);
  await deleteDoc(ref);
}
