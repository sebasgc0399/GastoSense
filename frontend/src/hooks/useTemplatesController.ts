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

type SelectedTemplateIntent = 'use' | 'edit';

export interface TemplatesControllerResult {
  templates: Template[];
  recurringTemplates: Template[];
  selectedTemplate: Template | null;
  selectedTemplateIntent: SelectedTemplateIntent | null;
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
  handleEditTemplate: (tpl: Template) => void;
}

export function useTemplatesController({ userId, onOpenQuickAdd }: UseTemplatesControllerParams): TemplatesControllerResult {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [selectedTemplateIntent, setSelectedTemplateIntent] = useState<SelectedTemplateIntent | null>(null);

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

  const clearSelectedTemplate = useCallback(() => {
    setSelectedTemplate(null);
    setSelectedTemplateIntent(null);
  }, []);

  const handleUseTemplate = useCallback(
    (tpl: Template) => {
      setSelectedTemplate(tpl);
      setSelectedTemplateIntent('use');
      onOpenQuickAdd();
    },
    [onOpenQuickAdd],
  );

  const handleEditTemplate = useCallback(
    (tpl: Template) => {
      setSelectedTemplate(tpl);
      setSelectedTemplateIntent('edit');
      onOpenQuickAdd();
    },
    [onOpenQuickAdd],
  );

  return {
    templates,
    recurringTemplates,
    selectedTemplate,
    selectedTemplateIntent,
    clearSelectedTemplate,
    fetchTemplates,
    saveTemplate,
    updateTemplate,
    deleteTemplate,
    handleUseTemplate,
    handleEditTemplate,
  };
}
