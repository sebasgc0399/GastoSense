import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getFirestoreDb } from '../src/config/firebase';
import { updateTemplate } from '../src/services/templates';
import type { DocumentData, DocumentReference, Firestore } from 'firebase/firestore';
import { doc, updateDoc } from 'firebase/firestore';

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(),
  collection: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn(),
  getDocs: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  updateDoc: vi.fn(),
  where: vi.fn(),
}));

vi.mock('../src/config/firebase', () => ({
  getFirestoreDb: vi.fn(),
}));

describe('templates service', () => {
  const getFirestoreDbMock = vi.mocked(getFirestoreDb);
  const docMock = vi.mocked(doc);
  const updateDocMock = vi.mocked(updateDoc);
  const db = {} as unknown as Firestore;

  beforeEach(() => {
    vi.clearAllMocks();
    getFirestoreDbMock.mockReturnValue(db);
    docMock.mockReturnValue({} as DocumentReference<DocumentData>);
    updateDocMock.mockResolvedValue(undefined);
  });

  it('does not overwrite category when payload is partial', async () => {
    const docRef = { id: 'docRef' } as DocumentReference<DocumentData>;
    docMock.mockReturnValue(docRef);

    await updateTemplate('template-1', { name: 'Nuevo nombre' }, 'user-1');

    expect(updateDocMock).toHaveBeenCalledTimes(1);
    expect(updateDocMock).toHaveBeenCalledWith(docRef, expect.any(Object));

    const payload = updateDocMock.mock.calls[0][1] as Record<string, unknown>;

    expect(payload).toMatchObject({ name: 'Nuevo nombre', userId: 'user-1' });
    expect(payload).not.toHaveProperty('categoryId');
    expect(payload).not.toHaveProperty('category');
    expect(payload).toHaveProperty('updatedAt');
  });
});
