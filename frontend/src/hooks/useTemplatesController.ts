import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  deleteTemplate as deleteTemplateService,
  fetchTemplates as fetchTemplatesService,
  saveTemplate as saveTemplateService,
  updateTemplate as updateTemplateService,
} from '../services/templates';
import type { Template, TransactionInput } from '../types';

export interface UseTemplatesControllerParams {
  userId: string | null | undefined;
  onOpenQuickAdd: () => void;
}

export interface TemplatesControllerResult {
  templates: Template[];
  recurringTemplates: Template[];
  selectedTemplate: Template | null;
  clearSelectedTemplate: () => void;
  fetchTemplates: () => Promise<void>;
  saveTemplate: (
    name: string,
    payload: TransactionInput & { recurring?: boolean; frequency?: Template['frequency'] },
  ) => Promise<void>;
  updateTemplate: (
    id: string,
    payload: TransactionInput & { name?: string; recurring?: boolean; frequency?: Template['frequency'] },
  ) => Promise<void>;
  deleteTemplate: (id: string) => Promise<void>;
  handleUseTemplate: (tpl: Template) => void;
}

export function useTemplatesController({ userId, onOpenQuickAdd }: UseTemplatesControllerParams): TemplatesControllerResult {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);

  const fetchTemplates = useCallback(async () => {
    if (!userId) return;
    const data = await fetchTemplatesService(userId);
    setTemplates(data);
  }, [userId]);

  useEffect(() => {
    const loadTemplates = async () => {
      try {
        await fetchTemplates();
      } catch (err) {
        console.error(err);
      }
    };
    void loadTemplates();
  }, [fetchTemplates]);

  const saveTemplate = useCallback(
    async (name: string, payload: TransactionInput & { recurring?: boolean; frequency?: Template['frequency'] }) => {
      if (!userId) return;
      await saveTemplateService(name, payload, userId);
      await fetchTemplates();
    },
    [fetchTemplates, userId],
  );

  const updateTemplate = useCallback(
    async (
      id: string,
      payload: TransactionInput & { name?: string; recurring?: boolean; frequency?: Template['frequency'] },
    ) => {
      if (!userId) return;
      await updateTemplateService(id, payload, userId);
      await fetchTemplates();
    },
    [fetchTemplates, userId],
  );

  const deleteTemplate = useCallback(
    async (id: string) => {
      if (!userId) return;
      await deleteTemplateService(id);
      await fetchTemplates();
    },
    [fetchTemplates, userId],
  );

  const recurringTemplates = useMemo(() => templates.filter((t) => t.recurring), [templates]);

  const clearSelectedTemplate = useCallback(() => setSelectedTemplate(null), []);

  const handleUseTemplate = useCallback(
    (tpl: Template) => {
      setSelectedTemplate(tpl);
      onOpenQuickAdd();
    },
    [onOpenQuickAdd],
  );

  return {
    templates,
    recurringTemplates,
    selectedTemplate,
    clearSelectedTemplate,
    fetchTemplates,
    saveTemplate,
    updateTemplate,
    deleteTemplate,
    handleUseTemplate,
  };
}
