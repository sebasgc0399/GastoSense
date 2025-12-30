import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Calendar, ChevronRight, CreditCard, DollarSign, Mic, Pencil, Settings, Sparkles, Square, X } from 'lucide-react';
import { paymentMethods } from '../data/frequentCategories';
import { useCategoriesController } from '../hooks/useCategoriesController';
import { useConfirm } from '../hooks/useConfirm';
import { callTranscribeAudio } from '../services/functions';
import { formatAmountHero } from '../utils/amount';
import { buildCategoryResolver, resolveCategoryLabel, truncateCategoryId } from '../utils/categoryResolver';
import { ResponsiveSelect } from './ResponsiveSelect';
import { CategoryIcon } from './ui/CategoryIcon';
import { CustomKeypad, type KeypadKey } from './CustomKeypad';
import type { CategoryKind, ParsedTransactionSuggestion, Template, TransactionInput } from '../types';

type Mode = 'quick' | 'details' | 'ai';
type SelectedTemplateIntent = 'use' | 'edit';

interface QuickAddFormState {
  mode: Mode;
  amount: string;
  category: string;
  note: string;
  type: TransactionInput['type'];
  paymentMethod: TransactionInput['paymentMethod'];
  date: string;
  recurring: boolean;
  frequency: Template['frequency'];
  rawText: string;
  interpreting: boolean;
  parsedSuggestion: ParsedTransactionSuggestion | null;
  interpretError: string | null;
  recording: boolean;
  transcribingAudio: boolean;
  recordingDuration: number;
  templateName: string;
  editingTemplate: Template | null;
  saving: boolean;
  feedback: string | null;
}

interface QuickAddSheetProps {
  open: boolean;
  onClose: () => void;
  onSave: (payload: TransactionInput) => Promise<void> | void;
  onInterpret?: (text: string) => Promise<ParsedTransactionSuggestion>;
  parseLocked?: boolean;
  onParseLocked?: () => void;
  templates?: Template[];
  onSaveTemplate?: (name: string, payload: TransactionInput & { recurring?: boolean; frequency?: Template['frequency'] }) => Promise<void>;
  onDeleteTemplate?: (id: string) => Promise<void>;
  onUpdateTemplate?: (id: string, payload: TransactionInput & { name?: string; recurring?: boolean; frequency?: Template['frequency'] }) => Promise<void>;
  userId?: string | null;
  onOpenSettings?: (kind: CategoryKind) => void;
  selectedTemplate?: Template | null;
  selectedTemplateIntent?: SelectedTemplateIntent | null;
  onClearSelectedTemplate?: () => void;
  onClearTemplate?: () => void;
}

const todayIso = () => new Date().toISOString().slice(0, 10);
const MAX_RECORDING_SECONDS = 10;
const EXPENSE_FALLBACK_ID = 'otros';
const INCOME_FALLBACK_ID = 'ingreso';
const resolveCategoryKind = (value: CategoryKind | undefined) => (value === 'income' ? 'income' : 'expense');
const createInitialState = (): QuickAddFormState => ({
  mode: 'quick',
  amount: '',
  category: '',
  note: '',
  type: 'expense',
  paymentMethod: 'debito',
  date: todayIso(),
  recurring: false,
  frequency: 'monthly',
  rawText: '',
  interpreting: false,
  parsedSuggestion: null,
  interpretError: null,
  recording: false,
  transcribingAudio: false,
  recordingDuration: 0,
  templateName: '',
  editingTemplate: null,
  saving: false,
  feedback: null,
});

export function QuickAddSheet({
  open,
  onClose,
  onSave,
  onInterpret,
  parseLocked = false,
  onParseLocked,
  templates = [],
  onSaveTemplate,
  onDeleteTemplate,
  onUpdateTemplate,
  userId,
  onOpenSettings,
  selectedTemplate,
  selectedTemplateIntent,
  onClearSelectedTemplate,
  onClearTemplate,
}: QuickAddSheetProps) {
  const [formState, setFormState] = useState<QuickAddFormState>(() => createInitialState());
  const [seedingIncome, setSeedingIncome] = useState(false);
  const updateFormState = useCallback((updates: Partial<QuickAddFormState>) => {
    setFormState((prev) => ({ ...prev, ...updates }));
  }, []);
  const { categories, loading: categoriesLoading, ensureIncomeCategories } = useCategoriesController({ userId });
  const confirm = useConfirm();
  const {
    mode,
    amount,
    category,
    note,
    type,
    paymentMethod,
    date,
    recurring,
    frequency,
    rawText,
    interpreting,
    parsedSuggestion,
    interpretError,
    recording,
    transcribingAudio,
    templateName,
    editingTemplate,
    saving,
    feedback,
  } = formState;
  const showDetails = mode === 'details';
  const setMode = (nextMode: Mode) => updateFormState({ mode: nextMode });
  const setAmount = (nextAmount: string) => updateFormState({ amount: nextAmount });
  const setCategory = useCallback((nextCategory: string) => updateFormState({ category: nextCategory }), [updateFormState]);
  const setNote = (nextNote: string) => updateFormState({ note: nextNote });
  const setType = useCallback((nextType: TransactionInput['type']) => updateFormState({ type: nextType }), [updateFormState]);
  const setPaymentMethod = (nextMethod: TransactionInput['paymentMethod']) =>
    updateFormState({ paymentMethod: nextMethod });
  const setDate = (nextDate: string) => updateFormState({ date: nextDate });
  const setShowDetails = (nextValue: boolean | ((prev: boolean) => boolean)) => {
    setFormState((prev) => {
      const current = prev.mode === 'details';
      const resolved = typeof nextValue === 'function' ? nextValue(current) : nextValue;
      return { ...prev, mode: resolved ? 'details' : 'quick' };
    });
  };
  const setSaving = (nextSaving: boolean) => updateFormState({ saving: nextSaving });
  const setFeedback = (nextFeedback: string | null) => updateFormState({ feedback: nextFeedback });
  const setRecurring = (nextRecurring: boolean) => updateFormState({ recurring: nextRecurring });
  const setFrequency = (nextFrequency: Template['frequency']) => updateFormState({ frequency: nextFrequency });
  const setRawText = (nextText: string) => updateFormState({ rawText: nextText });
  const setInterpreting = (next: boolean) => updateFormState({ interpreting: next });
  const setParsedSuggestion = (next: ParsedTransactionSuggestion | null) => updateFormState({ parsedSuggestion: next });
  const setInterpretError = (next: string | null) => updateFormState({ interpretError: next });
  const setRecording = (next: boolean) => updateFormState({ recording: next });
  const setTranscribingAudio = (next: boolean) => updateFormState({ transcribingAudio: next });
  const setRecordingDuration = (next: number) => updateFormState({ recordingDuration: next });
  const setTemplateName = (next: string) => updateFormState({ templateName: next });
  const setEditingTemplate = (next: Template | null) => updateFormState({ editingTemplate: next });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordTimeoutRef = useRef<number | null>(null);
  const recordIntervalRef = useRef<number | null>(null);
  const recordingStartedRef = useRef<number | null>(null);
  const skipTranscriptionRef = useRef(false);
  const lastNonAiModeRef = useRef<Mode>('quick');
  const templateNameInputRef = useRef<HTMLInputElement | null>(null);
  const focusTemplateNameRef = useRef(false);
  const incomeAutoSwitchedRef = useRef(false);
  const incomeSeededRef = useRef(false);

  const isOpen = open;
  const hasIncomeNonFallback = useMemo(
    () =>
      categories.some(
        (cat) =>
          resolveCategoryKind(cat.kind) === 'income' &&
          cat.id !== INCOME_FALLBACK_ID &&
          !cat.isArchived,
      ),
    [categories],
  );

  useEffect(() => {
    if (!isOpen) return;
    incomeAutoSwitchedRef.current = false;
    incomeSeededRef.current = false;
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || type !== 'income' || hasIncomeNonFallback || incomeSeededRef.current) return;
    let cancelled = false;

    const seed = async () => {
      incomeSeededRef.current = true;
      setSeedingIncome(true);
      try {
        await ensureIncomeCategories();
      } finally {
        if (!cancelled) setSeedingIncome(false);
      }
    };

    void seed();

    return () => {
      cancelled = true;
    };
  }, [ensureIncomeCategories, hasIncomeNonFallback, isOpen, type]);

  const amountValue = useMemo(() => Number(amount), [amount]);
  const formReady = useMemo(() => !!amount && amountValue > 0, [amount, amountValue]);
  const heroAmount = useMemo(() => formatAmountHero(amount, 'es-CO'), [amount]);
  const heroSizeClass = useMemo(() => {
    const length = heroAmount.length;
    if (length <= 10) return 'text-6xl';
    if (length <= 13) return 'text-5xl';
    if (length <= 16) return 'text-4xl';
    if (length <= 20) return 'text-3xl';
    return 'text-2xl';
  }, [heroAmount]);
  const fallbackId = type === 'income' ? INCOME_FALLBACK_ID : EXPENSE_FALLBACK_ID;
  const visibleCategories = useMemo(
    () =>
      categories
        .filter((cat) => resolveCategoryKind(cat.kind) === type && cat.id !== fallbackId)
        .slice(0, 19),
    [categories, fallbackId, type],
  );
  const showCategorySkeleton =
    visibleCategories.length === 0 && (categoriesLoading || (type === 'income' && seedingIncome));
  const categoryResolver = useMemo(() => buildCategoryResolver(categories), [categories]);
  const parsedConfidence = parsedSuggestion?.confidence ?? 0.6;
  const isExpenseSuggestion = parsedSuggestion?.type === 'expense';
  const lowConfidence = !!parsedSuggestion && isExpenseSuggestion && parsedConfidence < 0.55;
  const fallbackCategory =
    !!parsedSuggestion &&
    isExpenseSuggestion &&
    (parsedSuggestion.categoryFallback || parsedSuggestion.categoryId === EXPENSE_FALLBACK_ID);
  const fallbackReason = parsedSuggestion?.categoryFallbackReason;
  const fallbackMessage =
    fallbackReason === 'explicit_other'
      ? "La IA eligió 'Otros', revísalo si aplica."
      : "Clasificado en 'Otros', puedes cambiarlo.";
  const suggestedCategoryId = parsedSuggestion?.categoryId ?? '';
  const suggestedCategoryLabel = suggestedCategoryId ? resolveCategoryLabel(suggestedCategoryId, categoryResolver) : null;
  const suggestedCategoryDisplay = suggestedCategoryId
    ? suggestedCategoryLabel ?? 'Categoría eliminada'
    : '—';
  const suggestedCategoryTooltip =
    suggestedCategoryId && !suggestedCategoryLabel ? `ID: ${truncateCategoryId(suggestedCategoryId)}` : undefined;
  const suggestedCategory = suggestedCategoryId ? categoryResolver.categoriesById[suggestedCategoryId] : null;
  const suggestedCategoryIcon = suggestedCategory?.icon ?? 'Tag';
  const suggestionNote = parsedSuggestion?.note ?? parsedSuggestion?.rawText ?? '';
  const suggestionAmountClass = parsedSuggestion?.type === 'income' ? 'text-emerald-400' : 'text-rose-400';
  const suggestionBorderClass = parsedSuggestion?.type === 'income' ? 'border-emerald-500/30' : 'border-rose-500/30';
  const showAiHints = !rawText.trim() && !parsedSuggestion;
  const showInterpretButton = !!rawText.trim();
  const shouldHighlightCategorySelector =
    !showDetails &&
    mode !== 'ai' &&
    !!parsedSuggestion &&
    (lowConfidence || fallbackCategory) &&
    category === parsedSuggestion.categoryId;
  const showFallbackNotice = fallbackCategory && category === parsedSuggestion?.categoryId;
  const isCategoryForKind = useCallback(
    (categoryId: string, kind: CategoryKind) => {
      const match = categories.find((cat) => cat.id === categoryId);
      if (!match) return false;
      return resolveCategoryKind(match.kind) === kind;
    },
    [categories],
  );

  useEffect(() => {
    if (!category || categoriesLoading) return;
    if (!isCategoryForKind(category, type)) {
      setCategory('');
    }
  }, [category, categoriesLoading, isCategoryForKind, setCategory, type]);

  const resetForm = useCallback(() => {
    setFormState(createInitialState());
  }, []);

  const handleSave = async (closeAfter: boolean) => {
    if (!formReady) {
      setFeedback('Ingresa un monto válido.');
      return;
    }

    setSaving(true);
    setFeedback(null);

    const resolvedCategoryId = isCategoryForKind(category, type) ? category : fallbackId;
    const usedFallback = resolvedCategoryId === fallbackId;
    const payload: TransactionInput = {
      amount: amountValue,
      categoryId: resolvedCategoryId,
      note,
      type,
      paymentMethod,
      date,
    };

    try {
      await onSave(payload);
      setFeedback(usedFallback ? `Guardado en ${type === 'income' ? 'Ingreso' : 'Otros'}.` : 'Guardado.');
      if (closeAfter) {
        if (usedFallback) {
          window.setTimeout(() => {
            onClose();
            resetForm();
          }, 700);
        } else {
          onClose();
          resetForm();
        }
      } else {
        setAmount('');
        setNote('');
      }
    } catch (error) {
      setFeedback('No se pudo guardar. Revisa tu conexión o inténtalo de nuevo.');
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const handleKeypadInput = (key: KeypadKey) => {
    setFormState((prev) => {
      const current = prev.amount;
      if (key === 'backspace') {
        return { ...prev, amount: current.slice(0, -1) };
      }
      if (key === '.') {
        if (!current) return { ...prev, amount: '0.' };
        if (current.includes('.')) return prev;
        return { ...prev, amount: `${current}.` };
      }
      const [intPart, decPart = ''] = current.split('.');
      if (current.includes('.')) {
        if (decPart.length >= 2) return prev;
      } else if (intPart.length >= 12) {
        return prev;
      }
      if (current === '0') {
        return { ...prev, amount: key };
      }
      return { ...prev, amount: `${current}${key}` };
    });
  };

  const fallbackParse = (text: string): ParsedTransactionSuggestion => {
    const amountMatch = text.match(/(\d+[.,]?\d*)/);
    const amountValue = amountMatch ? Number(amountMatch[1].replace(',', '.')) : 0;
    const isIncome = /ingreso|salario|entr[oó]/i.test(text);
    const isYesterday = /ayer/i.test(text);
    const dateGuess = new Date();
    if (isYesterday) {
      dateGuess.setDate(dateGuess.getDate() - 1);
    }
    let categoryGuess = 'comida';
    if (/uber|taxi|transporte/i.test(text)) categoryGuess = 'transporte';
    if (/renta|arriendo|alquiler/i.test(text)) categoryGuess = 'renta';
    if (/netflix|spotify|suscrip/i.test(text)) categoryGuess = 'suscripciones';
    if (/mercado|super/i.test(text)) categoryGuess = 'mercado';
    const resolvedCategory = isIncome ? INCOME_FALLBACK_ID : categoryGuess;

    return {
      amount: amountValue,
      categoryId: resolvedCategory,
      note: text,
      paymentMethod: 'debito',
      type: isIncome ? 'income' : 'expense',
      date: dateGuess.toISOString().slice(0, 10),
      confidence: 0.35,
      rawText: text,
    };
  };

  const maybeAutoSwitchIncome = useCallback(
    (suggestion: ParsedTransactionSuggestion | null) => {
      if (!suggestion || suggestion.type !== 'income') return;
      if (type === 'income' || incomeAutoSwitchedRef.current) return;
      incomeAutoSwitchedRef.current = true;
      setType('income');
    },
    [setType, type],
  );

  const interpretText = async (text: string) => {
    const cleaned = text.trim();
    if (parseLocked) {
      setParsedSuggestion(null);
      setInterpretError('Límite semanal alcanzado. Se renueva el lunes.');
      onParseLocked?.();
      return;
    }
    if (!cleaned) {
      setInterpretError('Escribe una frase para interpretar.');
      return;
    }

    setInterpretError(null);
    setInterpreting(true);
    try {
      if (onInterpret) {
        const parsed = await onInterpret(cleaned);
        setParsedSuggestion(parsed);
        maybeAutoSwitchIncome(parsed);
      } else {
        const parsed = fallbackParse(cleaned);
        setParsedSuggestion(parsed);
        maybeAutoSwitchIncome(parsed);
      }
    } catch (error) {
      console.error(error);
      const message = (error as Error)?.message || 'No pudimos llamar a la IA.';
      // Si no hay acceso a IA (sin key/plan o límite), no mostramos sugerencia estimada.
      if (message.includes('Configura tu API key') || message.includes('límite diario') || message.includes('membresía')) {
        setParsedSuggestion(null);
        setInterpretError(message);
      } else {
        const parsed = fallbackParse(cleaned);
        setParsedSuggestion(parsed);
        maybeAutoSwitchIncome(parsed);
        setInterpretError('No pudimos llamar a la IA, te mostramos una sugerencia estimada.');
      }
    } finally {
      setInterpreting(false);
    }
  };

  const handleInterpret = async () => {
    await interpretText(rawText);
  };

  const blobToDataUrl = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string | null;
        if (!result) {
          reject(new Error('No se pudo leer el audio.'));
          return;
        }
        resolve(result);
      };
      reader.onerror = () => reject(new Error('No se pudo leer el audio.'));
      reader.readAsDataURL(blob);
    });

  const clearRecordingTimers = () => {
    if (recordTimeoutRef.current) {
      window.clearTimeout(recordTimeoutRef.current);
      recordTimeoutRef.current = null;
    }
    if (recordIntervalRef.current) {
      window.clearInterval(recordIntervalRef.current);
      recordIntervalRef.current = null;
    }
  };

  const stopMediaTracks = (rec?: MediaRecorder | null) => {
    const tracks = rec?.stream?.getTracks ? rec.stream.getTracks() : [];
    tracks.forEach((track) => track.stop());
  };

  const stopRecording = (skipTranscription = false) => {
    skipTranscriptionRef.current = skipTranscription;
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
    stopMediaTracks(recorder);
    clearRecordingTimers();
  };

  const transcribeBlob = async (blob: Blob, durationMs?: number) => {
    setTranscribingAudio(true);
    setInterpretError(null);
    try {
      const audioBase64 = await blobToDataUrl(blob);
      const response = await callTranscribeAudio({
        audioBase64,
        mimeType: blob.type,
        durationMs: durationMs ?? undefined,
      });
      const text = (response.data as { text?: string })?.text;
      if (!text) {
        throw new Error('No recibimos texto transcrito.');
      }
      setRawText(text);
      await interpretText(text);
    } catch (error) {
      console.error(error);
      const message = (error as Error)?.message || 'No se pudo transcribir el audio.';
      setInterpretError(message);
    } finally {
      setTranscribingAudio(false);
    }
  };

  const handleStartRecording = async () => {
    if (parseLocked) {
      setInterpretError('Límite semanal alcanzado. Se renueva el lunes.');
      onParseLocked?.();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setInterpretError('Tu navegador no permite grabar audio.');
      return;
    }

    setInterpretError(null);
    setRecording(true);
    setRecordingDuration(0);
    skipTranscriptionRef.current = false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredMime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : undefined;
      const recorder = new MediaRecorder(stream, preferredMime ? { mimeType: preferredMime } : undefined);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recordingStartedRef.current = null;

      recorder.onstart = () => {
        recordingStartedRef.current = Date.now();
        setRecording(true);
      };

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        stopMediaTracks(recorder);
        clearRecordingTimers();
        const durationMs = recordingStartedRef.current ? Date.now() - recordingStartedRef.current : undefined;
        recordingStartedRef.current = null;
        setRecording(false);
        const blob =
          chunksRef.current.length > 0
            ? new Blob(chunksRef.current, { type: recorder.mimeType || preferredMime || 'audio/webm' })
            : null;
        chunksRef.current = [];
        if (skipTranscriptionRef.current) {
          return;
        }
        if (!blob) {
          setInterpretError('No se capturó audio, intenta de nuevo.');
          return;
        }
        if (durationMs && durationMs < 1000) {
          setInterpretError('Clip muy corto (<1s), graba 1-2s para testear.');
          return;
        }
        try {
          await transcribeBlob(blob, durationMs);
        } catch (err) {
          console.error(err);
          setInterpretError('No se pudo procesar el audio grabado.');
        }
      };

      recorder.start();
      recordTimeoutRef.current = window.setTimeout(() => {
        if (mediaRecorderRef.current?.state === 'recording') {
          stopRecording(false);
        }
      }, MAX_RECORDING_SECONDS * 1000);
      recordIntervalRef.current = window.setInterval(() => {
        if (!recordingStartedRef.current) return;
        const seconds = Math.min(
          MAX_RECORDING_SECONDS,
          Math.round((Date.now() - recordingStartedRef.current) / 1000),
        );
        setRecordingDuration(seconds);
      }, 200);
    } catch (error) {
      console.error(error);
      setRecording(false);
      setInterpretError('No pudimos acceder al micrófono.');
      stopMediaTracks(mediaRecorderRef.current);
      clearRecordingTimers();
    }
  };

  const handleMicToggle = () => {
    if (transcribingAudio) return;
    if (recording || mediaRecorderRef.current?.state === 'recording') {
      stopRecording();
    } else {
      void handleStartRecording();
    }
  };


  const handleSaveParsed = async () => {
    if (!parsedSuggestion) return;
    setSaving(true);
    try {
      const parsedFallbackId = parsedSuggestion.type === 'income' ? INCOME_FALLBACK_ID : EXPENSE_FALLBACK_ID;
      const parsedCategoryId = isCategoryForKind(parsedSuggestion.categoryId, parsedSuggestion.type)
        ? parsedSuggestion.categoryId
        : parsedFallbackId;
      await onSave({ ...parsedSuggestion, categoryId: parsedCategoryId });
      setFeedback('Guardado desde modo frase.');
      onClose();
      resetForm();
    } catch (error) {
      setFeedback('No se pudo guardar lo interpretado.');
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const applyTemplateFields = (tpl: Template) => {
    if (tpl.amount !== undefined && tpl.amount !== null) {
      setAmount(tpl.amount.toString());
    }
    if (tpl.categoryId) setCategory(tpl.categoryId);
    if (tpl.note) setNote(tpl.note);
    if (tpl.paymentMethod) setPaymentMethod(tpl.paymentMethod);
    if (tpl.type) setType(tpl.type);
    if (tpl.recurring !== undefined) setRecurring(!!tpl.recurring);
    if (tpl.frequency) setFrequency(tpl.frequency);
  };

  const applyTemplateForUse = (tpl: Template) => {
    applyTemplateFields(tpl);
    setDate(todayIso());
    setEditingTemplate(null);
    setTemplateName('');
    focusTemplateNameRef.current = false;
    setShowDetails(false);
  };

  const applyTemplateForEdit = (tpl: Template, focusName: boolean) => {
    applyTemplateFields(tpl);
    setEditingTemplate(tpl);
    setTemplateName(tpl.name);
    if (focusName) {
      if (showDetails) {
        window.requestAnimationFrame(() => {
          templateNameInputRef.current?.focus();
        });
      } else {
        focusTemplateNameRef.current = true;
      }
    }
    setShowDetails(true);
  };

  const handleApplyTemplate = (tpl: Template) => {
    applyTemplateFields(tpl);
    setDate(todayIso());
    setEditingTemplate(null);
    setTemplateName('');
    focusTemplateNameRef.current = false;
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!onDeleteTemplate) return;
    const confirmed = await confirm({
      title: 'Eliminar plantilla?',
      description: 'Esta accion no se puede deshacer.',
      confirmText: 'Eliminar',
      cancelText: 'Cancelar',
      variant: 'destructive',
    });
    if (!confirmed) return;
    try {
      await onDeleteTemplate(id);
      setFeedback('Plantilla eliminada.');
      if (editingTemplate?.id === id) {
        setEditingTemplate(null);
        setTemplateName('');
      }
    } catch (error) {
      console.error(error);
      setFeedback('No se pudo eliminar la plantilla.');
    }
  };

  const handleSaveTemplate = async () => {
    if (!onSaveTemplate || !templateName.trim()) return;
    const payload: TransactionInput & { recurring?: boolean; frequency?: Template['frequency'] } = {
      amount: amountValue,
      categoryId: category,
      note,
      type,
      paymentMethod,
      date,
      recurring,
      frequency,
    };
    try {
      if (editingTemplate && onUpdateTemplate) {
        await onUpdateTemplate(editingTemplate.id, { ...payload, name: templateName.trim() });
        setFeedback('Plantilla actualizada.');
      } else {
        await onSaveTemplate(templateName.trim(), payload);
        setFeedback('Plantilla guardada.');
      }
      setTemplateName('');
      setEditingTemplate(null);
    } catch (error) {
      console.error(error);
      setFeedback('No se pudo guardar la plantilla.');
    }
  };

  const handleSmartSave = async () => {
    if (editingTemplate) {
      await handleSaveTemplate();
    } else {
      await handleSave(true);
    }
  };

  const enterAiMode = () => {
    lastNonAiModeRef.current = mode === 'ai' ? 'quick' : mode;
    setMode('ai');
  };

  const exitAiMode = () => {
    const nextMode = lastNonAiModeRef.current === 'ai' ? 'quick' : lastNonAiModeRef.current;
    setMode(nextMode);
  };

  const cancelTemplateEdit = () => {
    setEditingTemplate(null);
    setTemplateName('');
    focusTemplateNameRef.current = false;
  };

  const handleLeftAction = () => {
    if (showDetails && editingTemplate) {
      cancelTemplateEdit();
      return;
    }
    if (showDetails) {
      setShowDetails(false);
      return;
    }

    if (editingTemplate) {
      onClearTemplate?.();
      resetForm();
      return;
    }

    onClose();
  };

  const handleAiToggle = () => {
    if (mode === 'ai') {
      exitAiMode();
    } else {
      enterAiMode();
    }
  };

  useEffect(() => {
    if (!isOpen && recording) {
      stopRecording(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, recording]);

  useEffect(() => {
    if (!isOpen) {
      const timeoutId = window.setTimeout(() => resetForm(), 300);
      return () => window.clearTimeout(timeoutId);
    }
  }, [isOpen, resetForm]);

  useEffect(() => {
    return () => {
      stopRecording(true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Aplica template preseleccionado desde recordatorios (efecto para evitar setState en render)
  useEffect(() => {
    if (!selectedTemplate) return;
    const intent = selectedTemplateIntent ?? 'use';
    if (intent === 'edit') {
      applyTemplateForEdit(selectedTemplate, true);
    } else {
      applyTemplateForUse(selectedTemplate);
    }
    onClearSelectedTemplate?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTemplate, selectedTemplateIntent]);

  useEffect(() => {
    if (!showDetails || !focusTemplateNameRef.current) return;
    window.requestAnimationFrame(() => {
      templateNameInputRef.current?.focus();
      focusTemplateNameRef.current = false;
    });
  }, [showDetails]);

  const canCreateTemplate = !!onSaveTemplate;
  const canEditTemplate = !!onUpdateTemplate;
  const showTemplateCard = editingTemplate ? canEditTemplate : canCreateTemplate;


  const smartSaveDisabled = saving || (editingTemplate ? !templateName.trim() : !formReady);
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:px-4">
      <div
        className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="glass-sheet p-4 sm:p-6 animate-sheet-up relative flex h-full max-h-[90vh] w-full flex-col overflow-hidden sm:max-h-[85vh]"
        role="dialog"
        aria-modal="true"
        aria-label="Nuevo movimiento"
        onClick={(event) => event.stopPropagation()}
        style={{ zIndex: 70 }}
      >
        <div className="flex h-full min-h-0 flex-col">
          <div className="shrink-0 pt-4 pb-2 space-y-3">
            <div className="relative flex items-center justify-between pb-2">
              <div className="h-10 w-10">
                {showDetails && (
                  <button type="button" onClick={handleLeftAction} className="btn-icon-glass" aria-label="Volver">
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                )}
              </div>
              {mode !== 'ai' && (
                <div className="absolute left-1/2 top-4 z-20 flex h-10 -translate-x-1/2 items-center rounded-full border border-white/10 bg-white/5 p-1 backdrop-blur-md">
                  <button
                    type="button"
                    onClick={() => {
                      setType('expense');
                    }}
                    className={`flex h-full items-center rounded-full px-4 text-xs font-medium transition-all ${
                      type === 'expense'
                        ? 'bg-rose-500/20 text-rose-200 ring-1 ring-inset ring-rose-500/50'
                        : 'text-white/40 hover:text-white/70'
                    }`}
                  >
                    Gasto
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setType('income');
                    }}
                    className={`flex h-full items-center rounded-full px-4 text-xs font-medium transition-all ${
                      type === 'income'
                        ? 'bg-emerald-500/20 text-emerald-200 ring-1 ring-inset ring-emerald-500/50'
                        : 'text-white/40 hover:text-white/70'
                    }`}
                  >
                    Ingreso
                  </button>
                </div>
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAiToggle}
                  className={`btn-icon-glass ${mode === 'ai' ? 'border-emerald-500/50 text-emerald-200' : ''}`}
                  aria-label={mode === 'ai' ? 'Salir de modo frase' : 'Modo frase'}
                >
                  <Sparkles className="h-4 w-4" />
                </button>
                <button type="button" onClick={onClose} className="btn-icon-glass" aria-label="Cerrar">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            {mode !== 'ai' && (
              <>
                {editingTemplate && (
                  <span className="text-xs text-[var(--muted)]">
                    Editando plantilla: <span className="font-semibold text-white/80">{editingTemplate.name}</span>
                  </span>
                )}
                <div className="flex h-24 w-full shrink-0 items-center justify-center px-4">
                  <div
                    className={`text-center font-bold transition-colors duration-200 ${
                      type === 'income' ? 'text-emerald-400' : 'text-rose-400'
                    } ${heroSizeClass} leading-none tabular-nums whitespace-nowrap overflow-hidden text-ellipsis`}
                    aria-label={`Monto ${heroAmount}`}
                  >
                    {'$'}{heroAmount}
                  </div>
                </div>
                {!showDetails && (
                  <div className="flex justify-center">
                    <button type="button" onClick={() => setShowDetails(true)} className="btn-glass text-xs">
                      <span>Agregar detalle</span>
                      <ChevronRight size={14} className="opacity-60" />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
          {mode === 'ai' ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pb-4 [-webkit-overflow-scrolling:touch]">
                <div className="flex items-end gap-3">
                  <div className="flex-1 rounded-3xl border border-white/10 bg-white/5 px-4 py-3">
                    <textarea
                      value={rawText}
                      onChange={(e) => setRawText(e.target.value)}
                      className="h-24 w-full resize-none bg-transparent text-sm text-[var(--text)] focus:outline-none"
                      rows={4}
                      placeholder="Describe tu gasto o toca el microfono..."
                      aria-label="Describe el movimiento"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleMicToggle}
                    disabled={transcribingAudio || parseLocked}
                    className={`btn-icon-glass h-12 w-12 sm:h-14 sm:w-14 ${
                      recording
                        ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/40 animate-pulse ring-4 ring-rose-500/20 border-rose-500/40'
                        : ''
                    }`}
                    aria-label={recording ? 'Detener grabacion' : 'Grabar audio'}
                    title={recording ? 'Detener grabacion' : 'Grabar audio'}
                  >
                    {recording ? <Square className="h-4 w-4" fill="currentColor" /> : <Mic className="h-5 w-5" />}
                  </button>
                </div>
                {showInterpretButton && (
                  <button
                    onClick={handleInterpret}
                    disabled={interpreting || transcribingAudio || parseLocked}
                    className="btn-primary-glass w-full py-2"
                  >
                    {transcribingAudio ? 'Transcribiendo audio...' : interpreting ? 'Interpretando...' : 'Interpretar frase con IA'}
                  </button>
                )}
                {interpretError && <p className="text-sm text-[var(--error-text)]">{interpretError}</p>}
                {showAiHints && (
                  <div className="mb-2 mt-4 flex flex-wrap justify-center gap-2">
                    <span className="flex items-center gap-1.5 rounded-full border border-white/5 bg-white/5 px-3 py-1 text-[10px] font-medium text-white/50">
                      <DollarSign className="h-3 w-3" />
                      Monto y categoria
                    </span>
                    <span className="flex items-center gap-1.5 rounded-full border border-white/5 bg-white/5 px-3 py-1 text-[10px] font-medium text-white/50">
                      <Calendar className="h-3 w-3" />
                      Fecha rapida
                    </span>
                    <span className="flex items-center gap-1.5 rounded-full border border-white/5 bg-white/5 px-3 py-1 text-[10px] font-medium text-white/50">
                      <CreditCard className="h-3 w-3" />
                      Metodo de pago
                    </span>
                  </div>
                )}
                {parsedSuggestion && (
                  <>
                    <div className={`rounded-2xl border bg-white/5 p-4 ${suggestionBorderClass}`}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-white">
                            <CategoryIcon name={suggestedCategoryIcon} size={24} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-white" title={suggestedCategoryTooltip}>
                              {suggestedCategoryDisplay}
                            </p>
                            {suggestionNote && (
                              <p className="truncate text-xs text-white/60" title={suggestionNote}>
                                {suggestionNote}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className={`text-2xl font-bold ${suggestionAmountClass}`}>
                          ${parsedSuggestion.amount.toLocaleString()}
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-white/70">
                        <span className="rounded-full border border-white/10 bg-white/10 px-2 py-1">
                          {parsedSuggestion.date}
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/10 px-2 py-1 capitalize">
                          {parsedSuggestion.paymentMethod}
                        </span>
                      </div>
                    </div>
                    {fallbackCategory && <p className="text-xs text-amber-200">{fallbackMessage}</p>}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => {
                          setAmount(parsedSuggestion.amount.toString());
                          setCategory(parsedSuggestion.categoryId);
                          setNote(parsedSuggestion.note ?? '');
                          setType(parsedSuggestion.type);
                          setPaymentMethod(parsedSuggestion.paymentMethod);
                          setDate(parsedSuggestion.date);
                          setMode('quick');
                        }}
                        className="btn-glass h-10 px-3 py-0 text-xs"
                      >
                        Editar antes de guardar
                      </button>
                      <button
                        onClick={handleSaveParsed}
                        disabled={saving}
                        className="btn-primary-glass h-10 px-3 py-0 text-xs"
                      >
                        {saving ? 'Guardando...' : 'Confirmar y guardar'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="flex-1 min-h-0 overflow-y-auto [-webkit-overflow-scrolling:touch] px-1 py-2">
                {showDetails ? (
                  <div className="space-y-3">
                    {templates.length > 0 && (
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-2">
                        <div className="mb-2 px-1 text-sm font-medium text-[var(--muted)]">Plantillas</div>
                        <div className="max-h-44 overflow-y-auto pr-1 [-webkit-overflow-scrolling:touch]">
                          <div className="space-y-2">
                            {templates.map((tpl) => (
                              <div key={tpl.id} className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleApplyTemplate(tpl)}
                                  className="btn-glass h-12 w-full justify-between px-3 text-left hover:scale-100 active:scale-100"
                                  title="Aplicar plantilla"
                                >
                                  <span className="min-w-0 truncate text-sm font-semibold">{tpl.name}</span>
                                  {tpl.recurring && (
                                    <span className="ml-2 rounded-full bg-white/10 px-2 py-1 text-[10px] text-white/80">
                                      {tpl.frequency ?? 'recurr.'}
                                    </span>
                                  )}
                                </button>
                                {canEditTemplate && (
                                  <button
                                    type="button"
                                    onClick={() => applyTemplateForEdit(tpl, true)}
                                    className="btn-icon-glass shrink-0"
                                    aria-label={'Editar plantilla ' + tpl.name}
                                    title="Editar plantilla"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                {onDeleteTemplate && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteTemplate(tpl.id)}
                                    className="btn-icon-glass shrink-0"
                                    aria-label={'Eliminar plantilla ' + tpl.name}
                                    title="Eliminar plantilla"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-sm font-medium text-[var(--muted)]">Metodo de pago</label>
                        <ResponsiveSelect
                          value={paymentMethod}
                          onChange={(val) => setPaymentMethod(val as TransactionInput['paymentMethod'])}
                          options={paymentMethods.map((method) => ({ value: method, label: method }))}
                          title="Metodo de pago"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-[var(--muted)]">Fecha</label>
                        <input
                          type="date"
                          value={date}
                          onChange={(e) => setDate(e.target.value)}
                          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-emerald-500/40 focus:outline-none"
                        />
                        {editingTemplate?.createdAt && (
                          <p className="mt-1 text-[11px] text-[var(--muted)]">
                            Creada: {editingTemplate.createdAt.slice(0, 10)} (la fecha aqui es para el proximo registro).
                          </p>
                        )}
                      </div>
                    </div>
                    {feedback && <p className="text-xs text-[var(--muted)]">{feedback}</p>}
                    {showTemplateCard && (
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-white/60">
                            {editingTemplate ? 'Actualizar plantilla' : 'Guardar como plantilla'}
                          </span>
                          {editingTemplate && (
                            <button type="button" onClick={cancelTemplateEdit} className="btn-glass px-3 py-2 text-xs">
                              Cancelar
                            </button>
                          )}
                        </div>
                        <div className="mt-3 space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <label className="flex items-center gap-2 text-sm text-white/70">
                              <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
                              Recurrente
                            </label>
                            {recurring && (
                              <div className="w-44">
                                <ResponsiveSelect
                                  value={frequency ?? 'monthly'}
                                  onChange={(val) => setFrequency(val as Template['frequency'])}
                                  options={[
                                    { value: 'weekly', label: 'Semanal' },
                                    { value: 'biweekly', label: 'Quincenal' },
                                    { value: 'monthly', label: 'Mensual' },
                                    { value: 'yearly', label: 'Anual' },
                                  ]}
                                  title="Frecuencia"
                                />
                              </div>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <input
                              ref={templateNameInputRef}
                              type="text"
                              value={templateName}
                              onChange={(e) => setTemplateName(e.target.value)}
                              placeholder="Ej. Renta, Netflix"
                              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-emerald-500/40 focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={handleSaveTemplate}
                              disabled={saving || !templateName.trim()}
                              className="btn-glass px-4 py-2 text-sm"
                            >
                              {editingTemplate ? 'Actualizar' : 'Guardar'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {showCategorySkeleton ? (
                      <div className="flex gap-2 overflow-hidden pb-2">
                        {Array.from({ length: 6 }).map((_, idx) => (
                          <div
                            key={`category-skeleton-${idx}`}
                            className="btn-glass h-16 min-w-[86px] shrink-0 animate-pulse"
                          />
                        ))}
                      </div>
                    ) : (
                      <>
                        {showFallbackNotice && <p className="text-xs text-amber-200">{fallbackMessage}</p>}
                        <div className={shouldHighlightCategorySelector ? 'rounded-2xl p-2 ring-2 ring-amber-400/60' : ''}>
                          <div className="flex gap-2 overflow-x-auto pb-2 pr-1 [-webkit-overflow-scrolling:touch]">
                            {visibleCategories.map((cat) => {
                              const active = cat.id === category;
                              return (
                                <button
                                  key={cat.id}
                                  type="button"
                                  onClick={() => setCategory(cat.id)}
                                  className={`btn-glass min-w-[86px] shrink-0 flex-col px-3 py-2 text-[11px] ${
                                    active
                                      ? 'border-emerald-500/50 bg-emerald-500/10 text-white'
                                      : 'text-white/70'
                                  }`}
                                >
                                  <CategoryIcon name={cat.icon} size={18} />
                                  <span className="mt-1">{cat.label}</span>
                                </button>
                              );
                            })}
                            <button
                              type="button"
                              onClick={() => onOpenSettings?.(type)}
                              className="btn-glass min-w-[86px] shrink-0 flex-col border-dashed border-white/20 px-3 py-2 text-[11px] text-white/60 hover:text-white"
                            >
                              <Settings size={18} />
                              <span className="mt-1">Configurar</span>
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                    <div className="border-b border-white/10 pb-2">
                      <label className="sr-only" htmlFor="quick-add-note">
                        Nota
                      </label>
                      <input
                        id="quick-add-note"
                        type="text"
                        value={note}
                        onChange={(event) => setNote(event.target.value.slice(0, 500))}
                        placeholder="Nota (opcional)"
                        className="w-full bg-transparent text-sm text-white placeholder-white/30 focus:outline-none"
                      />
                    </div>
                    {feedback && <p className="text-xs text-[var(--muted)]">{feedback}</p>}
                  </div>
                )}
              </div>
              <div className="shrink-0 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] bg-gradient-to-t from-[var(--modal-surface)] to-transparent">
                {showDetails ? (
                  !editingTemplate && (
                    <button
                      type="button"
                      onClick={() => handleSave(true)}
                      disabled={saving || !formReady}
                      className="btn-primary-glass"
                    >
                      {saving ? 'Guardando...' : type === 'income' ? 'Guardar Ingreso' : 'Guardar Gasto'}
                    </button>
                  )
                ) : (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-2">
                    <CustomKeypad
                      onInput={handleKeypadInput}
                      onAction={handleSmartSave}
                      disabled={saving}
                      actionDisabled={smartSaveDisabled}
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

