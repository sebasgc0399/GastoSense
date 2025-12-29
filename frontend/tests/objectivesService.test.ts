import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getFirestoreDb } from '../src/config/firebase';
import { addEntry, createObjective } from '../src/services/objectives';
import type { DocumentData, DocumentReference, Firestore } from 'firebase/firestore';
import { addDoc, collection, doc, runTransaction } from 'firebase/firestore';

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(),
  collection: vi.fn(),
  deleteDoc: vi.fn(),
  deleteField: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(() => 'serverTimestamp'),
  Timestamp: { fromDate: vi.fn() },
  where: vi.fn(),
  writeBatch: vi.fn(() => ({ delete: vi.fn(), commit: vi.fn() })),
}));

vi.mock('../src/config/firebase', () => ({
  getFirestoreDb: vi.fn(),
}));

describe('objectives service', () => {
  const getFirestoreDbMock = vi.mocked(getFirestoreDb);
  const collectionMock = vi.mocked(collection);
  const addDocMock = vi.mocked(addDoc);
  const docMock = vi.mocked(doc);
  const runTransactionMock = vi.mocked(runTransaction);
  const db = {} as unknown as Firestore;

  beforeEach(() => {
    vi.clearAllMocks();
    getFirestoreDbMock.mockReturnValue(db);
    collectionMock.mockReturnValue({} as DocumentReference<DocumentData>);
    docMock.mockReturnValue({} as DocumentReference<DocumentData>);
    addDocMock.mockResolvedValue({} as DocumentReference<DocumentData>);
  });

  it('createObjective writes to objectives collection only', async () => {
    await createObjective(
      {
        type: 'goal',
        name: 'Meta',
        targetAmount: 1000,
      },
      'user-1',
    );

    expect(collectionMock).toHaveBeenCalledWith(db, 'objectives');
    const wroteToTransactions = collectionMock.mock.calls.some((args) => args.includes('transactions'));
    expect(wroteToTransactions).toBe(false);
  });

  it('addEntry updates objective without touching transactions collection', async () => {
    const tx = {
      get: vi.fn(),
      set: vi.fn(),
      update: vi.fn(),
    };
    const objectiveSnap = {
      id: 'objective-1',
      exists: () => true,
      data: () => ({
        userId: 'user-1',
        type: 'goal',
        name: 'Meta',
        targetAmount: 1000,
        currentAmount: 200,
        status: 'active',
      }),
    };
    tx.get.mockResolvedValue(objectiveSnap);
    runTransactionMock.mockImplementation(async (_db, callback) => {
      await callback(tx as unknown as { get: () => Promise<unknown>; set: () => void; update: () => void });
    });

    await addEntry('objective-1', { kind: 'deposit', amount: 100 });

    expect(tx.set).toHaveBeenCalledTimes(1);
    expect(tx.update).toHaveBeenCalledTimes(1);
    expect(tx.update).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ currentAmount: 300 }));

    const wroteToTransactions = collectionMock.mock.calls.some((args) => args.includes('transactions'));
    expect(wroteToTransactions).toBe(false);
  });
});
