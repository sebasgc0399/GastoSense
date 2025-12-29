import { useCallback, useEffect, useRef, useState } from 'react';
import {
  addEntry as addEntryService,
  archiveObjective as archiveObjectiveService,
  createObjective as createObjectiveService,
  deleteEntry as deleteEntryService,
  deleteObjective as deleteObjectiveService,
  listenObjectives,
  updateObjective as updateObjectiveService,
} from '../services/objectives';
import type { Objective, ObjectiveEntryInput, ObjectiveInput, ObjectiveUpdate } from '../types';

export interface UseObjectivesControllerParams {
  userId: string | null | undefined;
}

export interface ObjectivesControllerResult {
  objectives: Objective[];
  objectivesReady: boolean;
  error: string | null;
  createObjective: (payload: ObjectiveInput) => Promise<void>;
  updateObjective: (id: string, patch: ObjectiveUpdate) => Promise<void>;
  archiveObjective: (id: string) => Promise<void>;
  deleteObjective: (id: string) => Promise<void>;
  addEntry: (objectiveId: string, payload: ObjectiveEntryInput) => Promise<void>;
  deleteEntry: (objectiveId: string, entryId: string) => Promise<void>;
}

export function useObjectivesController({ userId }: UseObjectivesControllerParams): ObjectivesControllerResult {
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [objectivesReady, setObjectivesReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedUserRef = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) {
      loadedUserRef.current = null;
      const timeoutId = window.setTimeout(() => {
        setObjectives([]);
        setObjectivesReady(false);
        setError(null);
      }, 0);
      return () => window.clearTimeout(timeoutId);
    }
    const unsubscribe = listenObjectives({
      userId,
      onChange: (list) => {
        const shouldReset = loadedUserRef.current !== userId;
        loadedUserRef.current = userId;
        if (shouldReset) setObjectives([]);
        setObjectives(list);
        setObjectivesReady(true);
        setError(null);
      },
      onError: (err) => {
        setError(err.message);
        setObjectivesReady(true);
      },
    });
    return () => unsubscribe();
  }, [userId]);

  const createObjective = useCallback(
    async (payload: ObjectiveInput) => {
      if (!userId) return;
      await createObjectiveService(payload, userId);
    },
    [userId],
  );

  const updateObjective = useCallback(
    async (id: string, patch: ObjectiveUpdate) => {
      if (!userId) return;
      await updateObjectiveService(id, patch, userId);
    },
    [userId],
  );

  const archiveObjective = useCallback(
    async (id: string) => {
      if (!userId) return;
      await archiveObjectiveService(id, userId);
    },
    [userId],
  );

  const deleteObjective = useCallback(async (id: string) => {
    await deleteObjectiveService(id);
  }, []);

  const addEntry = useCallback(async (objectiveId: string, payload: ObjectiveEntryInput) => {
    await addEntryService(objectiveId, payload);
  }, []);

  const deleteEntry = useCallback(async (objectiveId: string, entryId: string) => {
    await deleteEntryService(objectiveId, entryId);
  }, []);

  return {
    objectives,
    objectivesReady,
    error,
    createObjective,
    updateObjective,
    archiveObjective,
    deleteObjective,
    addEntry,
    deleteEntry,
  };
}
