import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { Template, TransactionInput } from '../types';

const COLLECTION = 'templates';
const DEFAULT_USER_ID = 'personal';

export async function fetchTemplates(userId: string): Promise<Template[]> {
  const q = query(collection(db, COLLECTION), where('userId', '==', userId), orderBy('name'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      name: data.name ?? '',
      category: data.category ?? '',
      amount: data.amount ?? undefined,
      note: data.note ?? undefined,
      paymentMethod: data.paymentMethod ?? undefined,
      type: data.type ?? undefined,
      userId: data.userId,
      recurring: data.recurring ?? false,
      frequency: data.frequency ?? undefined,
      createdAt: data.createdAt ?? undefined,
      updatedAt: data.updatedAt ?? undefined,
    };
  });
}

export async function saveTemplate(name: string, payload: Partial<TransactionInput>, userId = DEFAULT_USER_ID) {
  const data: Record<string, any> = {
    userId,
    name: name.trim(),
    recurring: (payload as any).recurring ?? false,
    createdAt: new Date().toISOString(),
  };
  if (payload.category) data.category = payload.category;
  if (typeof payload.amount === 'number') data.amount = payload.amount;
  if (payload.note) data.note = payload.note;
  if (payload.paymentMethod) data.paymentMethod = payload.paymentMethod;
  if (payload.type) data.type = payload.type;
  if ((payload as any).frequency) data.frequency = (payload as any).frequency;
  await addDoc(collection(db, COLLECTION), data);
}

export async function updateTemplate(
  id: string,
  payload: Partial<TransactionInput> & { name?: string; recurring?: boolean; frequency?: Template['frequency'] },
  userId = DEFAULT_USER_ID,
) {
  const ref = doc(db, COLLECTION, id);
  const data: Record<string, any> = { updatedAt: new Date().toISOString(), userId };
  if (payload.name) data.name = payload.name.trim();
  if (payload.category) data.category = payload.category;
  if (typeof payload.amount === 'number') data.amount = payload.amount;
  if (payload.note !== undefined) data.note = payload.note;
  if (payload.paymentMethod) data.paymentMethod = payload.paymentMethod;
  if (payload.type) data.type = payload.type;
  if (payload.recurring !== undefined) data.recurring = payload.recurring;
  if (payload.frequency) data.frequency = payload.frequency;
  await updateDoc(ref, data);
}

export async function deleteTemplate(id: string) {
  const ref = doc(db, COLLECTION, id);
  await deleteDoc(ref);
}
