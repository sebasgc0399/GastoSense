import {
  addDoc,
  collection,
  deleteField,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { getFirestoreDb } from '../config/firebase';
import type {
  Objective,
  ObjectiveEntry,
  ObjectiveEntryInput,
  ObjectiveEntryKind,
  ObjectiveInput,
  ObjectiveStatus,
  ObjectiveType,
  ObjectiveUpdate,
} from '../types';
import { applyEntryToObjective, reverseEntryOnObjective } from '../utils/objectives';

const COLLECTION = 'objectives';
const ENTRIES_COLLECTION = 'entries';

const normalizeObjectiveType = (value: unknown): ObjectiveType => (value === 'debt' ? 'debt' : 'goal');
const normalizeObjectiveStatus = (value: unknown): ObjectiveStatus =>
  value === 'completed' || value === 'archived' ? value : 'active';
const normalizeEntryKind = (value: unknown): ObjectiveEntryKind =>
  value === 'withdraw' ? 'withdraw' : value === 'payment' ? 'payment' : 'deposit';

const toIsoString = (value: unknown): string | undefined => {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof (value as { toDate?: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return undefined;
};

const toIsoDate = (value: unknown): string | undefined => {
  const iso = toIsoString(value);
  if (!iso) return undefined;
  return iso.slice(0, 10);
};

const toTimestamp = (value?: string | null): Timestamp | null => {
  if (!value) return null;
  const date = new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value);
  if (Number.isNaN(date.getTime())) return null;
  return Timestamp.fromDate(date);
};

const mapObjectiveDoc = (docId: string, data: Record<string, unknown>): Objective => ({
  id: docId,
  userId: (data.userId as string) ?? '',
  type: normalizeObjectiveType(data.type),
  name: (data.name as string) ?? '',
  targetAmount: Number(data.targetAmount) || 0,
  currentAmount: Number(data.currentAmount) || 0,
  icon: (data.icon as string) ?? undefined,
  color: (data.color as string) ?? undefined,
  dueDate: toIsoDate(data.dueDate) ?? undefined,
  status: normalizeObjectiveStatus(data.status),
  createdAt: toIsoString(data.createdAt) ?? undefined,
  updatedAt: toIsoString(data.updatedAt) ?? undefined,
});

const mapEntryDoc = (docId: string, data: Record<string, unknown>): ObjectiveEntry => ({
  id: docId,
  userId: (data.userId as string) ?? '',
  amount: Number(data.amount) || 0,
  kind: normalizeEntryKind(data.kind),
  note: (data.note as string) ?? undefined,
  effectiveDate: toIsoDate(data.effectiveDate) ?? undefined,
  createdAt: toIsoString(data.createdAt) ?? undefined,
  linkedTransactionId: (data.linkedTransactionId as string | null | undefined) ?? null,
});

interface ListenObjectivesParams {
  userId: string;
  onChange: (objectives: Objective[]) => void;
  onError?: (error: Error) => void;
}

export function listenObjectives({ userId, onChange, onError }: ListenObjectivesParams) {
  const db = getFirestoreDb();
  const q = query(collection(db, COLLECTION), where('userId', '==', userId), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      onChange(snapshot.docs.map((docSnap) => mapObjectiveDoc(docSnap.id, docSnap.data())));
    },
    (error) => {
      console.error(error);
      onError?.(error as Error);
    },
  );
}

interface ListenObjectiveEntriesParams {
  objectiveId: string;
  onChange: (entries: ObjectiveEntry[]) => void;
  onError?: (error: Error) => void;
}

export function listenObjectiveEntries({ objectiveId, onChange, onError }: ListenObjectiveEntriesParams) {
  const db = getFirestoreDb();
  const entriesRef = collection(db, COLLECTION, objectiveId, ENTRIES_COLLECTION);
  const q = query(entriesRef, orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      onChange(snapshot.docs.map((docSnap) => mapEntryDoc(docSnap.id, docSnap.data())));
    },
    (error) => {
      console.error(error);
      onError?.(error as Error);
    },
  );
}

export async function createObjective(payload: ObjectiveInput, userId: string) {
  const db = getFirestoreDb();
  const name = payload.name.trim();
  if (!name) {
    throw new Error('Nombre requerido.');
  }
  const targetAmount = Number(payload.targetAmount);
  const currentAmount = Number(payload.currentAmount ?? 0);
  if (!Number.isFinite(targetAmount) || targetAmount <= 0) {
    throw new Error('Monto objetivo invalido.');
  }
  if (!Number.isFinite(currentAmount) || currentAmount < 0) {
    throw new Error('Monto actual invalido.');
  }
  const status: ObjectiveStatus =
    targetAmount > 0 && currentAmount >= targetAmount ? 'completed' : 'active';
  const data: Record<string, unknown> = {
    userId,
    type: payload.type === 'debt' ? 'debt' : 'goal',
    name,
    targetAmount,
    currentAmount,
    status,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (payload.icon) data.icon = payload.icon;
  if (payload.color) data.color = payload.color;
  const dueDate = toTimestamp(payload.dueDate);
  if (dueDate) data.dueDate = dueDate;
  await addDoc(collection(db, COLLECTION), data);
}

export async function updateObjective(id: string, patch: ObjectiveUpdate, userId: string) {
  const db = getFirestoreDb();
  const ref = doc(db, COLLECTION, id);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) {
      throw new Error('Objetivo no existe.');
    }
    const data = snap.data();
    const currentAmount = Number(data.currentAmount) || 0;
    const nextTarget =
      patch.targetAmount !== undefined ? Number(patch.targetAmount) : Number(data.targetAmount) || 0;
    if (!Number.isFinite(nextTarget) || nextTarget <= 0) {
      throw new Error('Monto objetivo invalido.');
    }
    const status: ObjectiveStatus =
      data.status === 'archived' ? 'archived' : nextTarget > 0 && currentAmount >= nextTarget ? 'completed' : 'active';
    const updates: Record<string, unknown> = {
      userId,
      updatedAt: serverTimestamp(),
      status,
    };
    if (patch.name !== undefined) {
      const nextName = patch.name.trim();
      if (!nextName) {
        throw new Error('Nombre requerido.');
      }
      updates.name = nextName;
    }
    if (patch.targetAmount !== undefined) {
      updates.targetAmount = nextTarget;
    }
    if (patch.icon !== undefined) {
      updates.icon = patch.icon ? patch.icon : deleteField();
    }
    if (patch.color !== undefined) {
      updates.color = patch.color ? patch.color : deleteField();
    }
    if (patch.dueDate !== undefined) {
      const dueDate = patch.dueDate ? toTimestamp(patch.dueDate) : null;
      updates.dueDate = dueDate ? dueDate : deleteField();
    }
    tx.update(ref, updates);
  });
}

export async function archiveObjective(id: string, userId: string) {
  const db = getFirestoreDb();
  const ref = doc(db, COLLECTION, id);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) {
      throw new Error('Objetivo no existe.');
    }
    tx.update(ref, { status: 'archived', updatedAt: serverTimestamp(), userId });
  });
}

export async function deleteObjective(id: string) {
  const db = getFirestoreDb();
  const objectiveRef = doc(db, COLLECTION, id);
  const entriesRef = collection(db, COLLECTION, id, ENTRIES_COLLECTION);
  const entriesSnap = await getDocs(entriesRef);
  const batch = writeBatch(db);
  entriesSnap.docs.forEach((entry) => batch.delete(entry.ref));
  batch.delete(objectiveRef);
  await batch.commit();
}

export async function addEntry(objectiveId: string, payload: ObjectiveEntryInput) {
  const db = getFirestoreDb();
  const objectiveRef = doc(db, COLLECTION, objectiveId);
  const entriesRef = collection(db, COLLECTION, objectiveId, ENTRIES_COLLECTION);
  const amount = Number(payload.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Monto invalido.');
  }

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(objectiveRef);
    if (!snap.exists()) {
      throw new Error('Objetivo no existe.');
    }
    const data = snap.data();
    const objective: Objective = mapObjectiveDoc(snap.id, data);
    if (objective.status === 'archived') {
      throw new Error('El objetivo esta archivado.');
    }
    const { nextAmount, nextStatus } = applyEntryToObjective(objective, {
      kind: payload.kind,
      amount,
    });
    const entryData: Record<string, unknown> = {
      userId: objective.userId,
      amount,
      kind: payload.kind,
      createdAt: serverTimestamp(),
      linkedTransactionId: null,
    };
    if (payload.note) {
      entryData.note = payload.note;
    }
    const effectiveDate = toTimestamp(payload.effectiveDate);
    if (effectiveDate) {
      entryData.effectiveDate = effectiveDate;
    }
    tx.set(doc(entriesRef), entryData);
    tx.update(objectiveRef, {
      currentAmount: nextAmount,
      status: nextStatus,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function deleteEntry(objectiveId: string, entryId: string) {
  const db = getFirestoreDb();
  const objectiveRef = doc(db, COLLECTION, objectiveId);
  const entryRef = doc(db, COLLECTION, objectiveId, ENTRIES_COLLECTION, entryId);
  await runTransaction(db, async (tx) => {
    const [objectiveSnap, entrySnap] = await Promise.all([tx.get(objectiveRef), tx.get(entryRef)]);
    if (!objectiveSnap.exists()) {
      throw new Error('Objetivo no existe.');
    }
    if (!entrySnap.exists()) {
      throw new Error('Movimiento no existe.');
    }
    const objective = mapObjectiveDoc(objectiveSnap.id, objectiveSnap.data());
    const entryData = entrySnap.data();
    const amount = Number(entryData.amount) || 0;
    const kind = normalizeEntryKind(entryData.kind);
    const { nextAmount, nextStatus } = reverseEntryOnObjective(objective, { kind, amount });
    tx.delete(entryRef);
    tx.update(objectiveRef, { currentAmount: nextAmount, status: nextStatus, updatedAt: serverTimestamp() });
  });
}
