import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChevronRight, Sparkles, X, type LucideIcon } from 'lucide-react';
import * as Icons from 'lucide-react';
import { frequentCategories, paymentMethods } from '../data/frequentCategories';
import { callTranscribeAudio } from '../services/functions';
import { CATEGORY_ICONS } from '../utils/categoryIcons';
import { ResponsiveSelect } from './ResponsiveSelect';
import type { ParsedTransactionSuggestion, Template, TransactionInput } from '../types';

type Mode = 'quick' | 'details' | 'ai';
type KeypadKey = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '0' | '.' | 'backspace';
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

const KEYPAD_KEYS: KeypadKey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'backspace'];

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
  selectedTemplate?: Template | null;
  selectedTemplateIntent?: SelectedTemplateIntent | null;
  onClearSelectedTemplate?: () => void;
  onClearTemplate?: () => void;
}

const todayIso = () => new Date().toISOString().slice(0, 10);
const MAX_RECORDING_SECONDS = 10;
const createInitialState = (): QuickAddFormState => ({
  mode: 'quick',
  amount: '',
  category: frequentCategories[0]?.id ?? 'comida',
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

interface CustomKeypadProps {
  disabled?: boolean;
  actionDisabled?: boolean;
  onInput: (key: KeypadKey) => void;
  onAction: () => void;
}

function CustomKeypad({ disabled, actionDisabled, onInput, onAction }: CustomKeypadProps) {
  return (
    <div className="flex gap-4">
      <div className="grid flex-1 grid-cols-3 gap-3">
        {KEYPAD_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => onInput(key)}
            disabled={disabled}
            className="flex h-16 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-3xl font-semibold text-[var(--text)] shadow-sm transition hover:bg-white/10 disabled:opacity-50 sm:h-20"
            aria-label={key === 'backspace' ? 'Borrar' : `Tecla ${key}`}
          >
            {key === 'backspace' ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10 9l-3 3 3 3" />
                <path d="M7 12h10" />
                <path d="M11 6h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-5-6 5-6z" />
              </svg>
            ) : (
              key
            )}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onAction}
        disabled={actionDisabled}
        className="flex w-24 flex-col items-center justify-center self-stretch rounded-2xl bg-[var(--primary)] px-2 py-4 text-[var(--text-on-primary)] shadow-lg transition hover:opacity-90 disabled:opacity-60 sm:w-28"
        aria-label="Guardar"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M5 12l4 4L19 6" />
        </svg>
        <span className="mt-1 text-xs font-semibold">Guardar</span>
      </button>
    </div>
  );
}

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
  selectedTemplate,
  selectedTemplateIntent,
  onClearSelectedTemplate,
  onClearTemplate,
}: QuickAddSheetProps) {
  const [formState, setFormState] = useState<QuickAddFormState>(() => createInitialState());
  const updateFormState = (updates: Partial<QuickAddFormState>) => {
    setFormState((prev) => ({ ...prev, ...updates }));
  };
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
    recordingDuration,
    templateName,
    editingTemplate,
    saving,
    feedback,
  } = formState;
  const showDetails = mode === 'details';
  const setMode = (nextMode: Mode) => updateFormState({ mode: nextMode });
  const setAmount = (nextAmount: string) => updateFormState({ amount: nextAmount });
  const setCategory = (nextCategory: string) => updateFormState({ category: nextCategory });
  const setNote = (nextNote: string) => updateFormState({ note: nextNote });
  const setType = (nextType: TransactionInput['type']) => updateFormState({ type: nextType });
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
  const noteInputRef = useRef<HTMLInputElement | null>(null);
  const templateNameInputRef = useRef<HTMLInputElement | null>(null);
  const focusTemplateNameRef = useRef(false);

  const isOpen = open;

  const formReady = useMemo(() => !!amount && Number(amount) > 0, [amount]);

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

    const payload: TransactionInput = {
      amount: Number(amount),
      category,
      note,
      type,
      paymentMethod,
      date,
    };

    try {
      await onSave(payload);
      setFeedback('Guardado.');
      if (closeAfter) {
        onClose();
        resetForm();
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

    return {
      amount: amountValue,
      category: categoryGuess,
      note: text,
      paymentMethod: 'debito',
      type: isIncome ? 'income' : 'expense',
      date: dateGuess.toISOString().slice(0, 10),
      confidence: 0.35,
      rawText: text,
    };
  };

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
      } else {
        setParsedSuggestion(fallbackParse(cleaned));
      }
    } catch (error) {
      console.error(error);
      const message = (error as Error)?.message || 'No pudimos llamar a la IA.';
      // Si no hay acceso a IA (sin key/plan o límite), no mostramos sugerencia estimada.
      if (message.includes('Configura tu API key') || message.includes('límite diario') || message.includes('membresía')) {
        setParsedSuggestion(null);
        setInterpretError(message);
      } else {
        setParsedSuggestion(fallbackParse(cleaned));
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
      await onSave(parsedSuggestion);
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
    if (tpl.amount) setAmount(tpl.amount.toString());
    if (tpl.category) setCategory(tpl.category);
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
    applyTemplateForEdit(tpl, false);
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!onDeleteTemplate) return;
    if (!window.confirm('Eliminar esta plantilla? Esta accion no se puede deshacer.')) return;
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
      amount: Number(amount) || 0,
      category,
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

  const handleLeftAction = () => {
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
    if (!showDetails) return;
    window.requestAnimationFrame(() => {
      if (focusTemplateNameRef.current) {
        templateNameInputRef.current?.focus();
        focusTemplateNameRef.current = false;
        return;
      }
      noteInputRef.current?.focus();
    });
  }, [showDetails]);

  const amountDisplay = amount ? amount : '0';
  const heroColorClass = type === 'expense' ? 'text-rose-400' : 'text-emerald-400';
  const smartSaveDisabled = saving || (editingTemplate ? !templateName.trim() : !formReady);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-[var(--modal-overlay)] backdrop-blur-sm" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 z-50 h-[90dvh] rounded-t-3xl bg-[var(--modal-surface)] shadow-2xl transition">
        <div className="mx-auto flex h-full w-full max-w-3xl flex-col bg-[var(--modal-surface)]">
          <div className="flex shrink-0 items-center justify-center py-1">
            <span className="h-1 w-12 rounded-full bg-[var(--card-border)]" />
          </div>
          <div className="grid h-14 shrink-0 grid-cols-[48px_1fr_48px] items-center border-b border-[var(--modal-border)] bg-[var(--modal-header)] px-4">
            <div className="flex justify-start">
              <button
                type="button"
                onClick={handleLeftAction}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--card-border)] text-[var(--text-muted)] transition hover:border-[var(--modal-border)] hover:text-[var(--text)]"
                aria-label={showDetails || editingTemplate ? 'Volver' : 'Cerrar'}
              >
                {showDetails || editingTemplate ? <ArrowLeft className="h-5 w-5" /> : <X className="h-5 w-5" />}
              </button>
            </div>
            <div className="flex min-w-0 flex-col items-center justify-center overflow-hidden">
              {mode === 'ai' ? (
                <span className="text-sm font-semibold text-[var(--text)]">Modo frase (IA)</span>
              ) : editingTemplate ? (
                <>
                  <span className="text-[10px] uppercase tracking-wider text-amber-400">Editando</span>
                  <span className="max-w-full truncate text-sm font-semibold text-[var(--text)]">{editingTemplate.name}</span>
                </>
              ) : (
                <span className="text-sm font-semibold text-[var(--text)]">Nuevo Gasto</span>
              )}
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleAiToggle}
                className={`flex h-9 w-9 items-center justify-center rounded-full border transition ${
                  mode === 'ai'
                    ? 'border-primary/60 bg-primary/10 text-primary'
                    : 'border-[var(--card-border)] text-[var(--text-muted)] hover:border-[var(--modal-border)] hover:text-[var(--text)]'
                }`}
                aria-label={mode === 'ai' ? 'Salir de modo frase' : 'Modo frase'}
              >
                <Sparkles className="h-5 w-5" />
              </button>
            </div>
          </div>
          {mode === 'ai' ? (
            <div className="mt-2 flex flex-1 flex-col overflow-hidden">
              <div className="flex-1 min-h-0 space-y-4 overflow-y-auto px-4 pb-6">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-[var(--muted)]">Describe el movimiento</label>
                  <textarea
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    className="w-full rounded-2xl border border-[var(--card-border)] bg-[var(--input-bg)] px-4 py-3 text-sm text-[var(--text)] focus:border-primary focus:outline-none"
                    rows={4}
                    placeholder="Ej. Ayer gaste 23.500 en Uber con tarjeta de credito."
                  />
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleMicToggle}
                      disabled={transcribingAudio || parseLocked}
                      className={`flex h-12 w-12 items-center justify-center rounded-full border text-[var(--text)] transition ${
                        recording
                          ? 'border-red-400 bg-red-500/20 hover:bg-red-500/30'
                          : 'border-white/15 bg-white/5 hover:border-primary hover:text-primary'
                      } disabled:opacity-60`}
                      title="Grabar audio (max 10s)"
                    >
                      {recording ? (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor">
                          <rect x="7" y="7" width="10" height="10" rx="2" ry="2" />
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor">
                          <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                          <path d="M19 10v.5a7 7 0 1 1-14 0V10" />
                          <path d="M12 21v-3" />
                          <path d="M9 22h6" />
                        </svg>
                      )}
                    </button>
                    <div className="flex flex-col text-xs text-slate-300">
                      <span className="font-semibold text-[var(--text)]">
                        {parseLocked ? 'Limite alcanzado' : recording ? 'Grabando...' : 'Modo frase (voz)'}
                      </span>
                      <span>
                        {recording
                          ? `Pulsa para detener [] ${recordingDuration}s / ${MAX_RECORDING_SECONDS}s`
                          : 'Toque para grabar - Max 10s'}
                      </span>
                      {recording && (
                        <span className="flex items-center gap-2 text-red-300">
                          <span className="h-2 w-2 animate-pulse rounded-full bg-red-400" />
                          Grabando
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">Detecta monto, fecha, categoria</span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">Sugiere metodo de pago</span>
                </div>

                {interpretError && <p className="text-sm text-[var(--error-text)]">{interpretError}</p>}

                <button
                  onClick={handleInterpret}
                  disabled={interpreting || transcribingAudio || parseLocked}
                  className="w-full rounded-xl bg-[var(--primary)] px-4 py-3 text-sm font-semibold text-[var(--text-on-primary)] shadow hover:opacity-90 disabled:opacity-60"
                >
                  {transcribingAudio ? 'Transcribiendo audio...' : interpreting ? 'Interpretando...' : 'Interpretar frase con IA'}
                </button>

                {parsedSuggestion && (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-[var(--text)] shadow-sm">
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-sm font-semibold">Revision rapida</h3>
                      {parsedSuggestion.confidence !== undefined && (
                        <span className="rounded-full bg-white/10 px-2 py-1 text-xs text-[var(--text)]">
                          Confianza aprox. {(parsedSuggestion.confidence * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>
                    <dl className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <dt className="text-[var(--muted)]">Monto</dt>
                        <dd className="font-semibold">${parsedSuggestion.amount.toLocaleString()}</dd>
                      </div>
                      <div>
                        <dt className="text-[var(--muted)]">Tipo</dt>
                        <dd className="font-semibold text-emerald-200">
                          {parsedSuggestion.type === 'income' ? 'Ingreso' : 'Gasto'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[var(--muted)]">Categoria sugerida</dt>
                        <dd className="font-semibold capitalize">{parsedSuggestion.category}</dd>
                      </div>
                      <div>
                        <dt className="text-[var(--muted)]">Fecha</dt>
                        <dd className="font-semibold">{parsedSuggestion.date}</dd>
                      </div>
                      <div>
                        <dt className="text-[var(--muted)]">Metodo</dt>
                        <dd className="font-semibold capitalize">{parsedSuggestion.paymentMethod}</dd>
                      </div>
                    </dl>
                    {parsedSuggestion.note && (
                      <p className="mt-2 rounded-lg bg-white/10 px-2 py-1 text-xs text-slate-200">
                        Nota: {parsedSuggestion.note}
                      </p>
                    )}
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        onClick={() => {
                          setAmount(parsedSuggestion.amount.toString());
                          setCategory(parsedSuggestion.category);
                          setNote(parsedSuggestion.note ?? '');
                          setType(parsedSuggestion.type);
                          setPaymentMethod(parsedSuggestion.paymentMethod);
                          setDate(parsedSuggestion.date);
                          setMode('quick');
                        }}
                        className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm font-semibold text-[var(--text)] hover:bg-white/20"
                      >
                        Editar antes de guardar
                      </button>
                      <button
                        onClick={handleSaveParsed}
                        disabled={saving}
                        className="rounded-xl bg-[var(--primary)] px-3 py-2 text-sm font-semibold text-[var(--text-on-primary)] shadow hover:opacity-90 disabled:opacity-60"
                      >
                        {saving ? 'Guardando...' : 'Confirmar y guardar'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-1 flex flex-1 flex-col overflow-hidden">
              <div className="shrink-0 px-4 py-1">
                <div className="flex items-center justify-between">
                  <div className="inline-flex rounded-full bg-white/10 p-1 text-xs font-semibold text-[var(--text)]">
                    <button
                      type="button"
                      onClick={() => {
                        setType('expense');
                        if (category === 'ingreso') {
                          setCategory(frequentCategories[0]?.id ?? 'comida');
                        }
                      }}
                      className={`rounded-full px-3 py-1 ${type === 'expense' ? 'bg-white text-black' : 'text-[var(--text-muted)]'}`}
                    >
                      Gasto
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setType('income');
                        setCategory('ingreso');
                      }}
                      className={`rounded-full px-3 py-1 ${type === 'income' ? 'bg-white text-black' : 'text-[var(--text-muted)]'}`}
                    >
                      Ingreso
                    </button>
                  </div>
                  {editingTemplate && (
                    <span className="text-xs text-[var(--muted)]">Editando plantilla</span>
                  )}
                </div>
                <div className={`mt-2 text-center ${showDetails ? 'text-5xl' : 'text-6xl'} font-semibold leading-none ${heroColorClass}`}>
                  ${amountDisplay}
                </div>
                <div className="shrink-0 flex justify-center pb-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowDetails(true)}
                    className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] transition hover:bg-white/10 hover:text-[var(--text)] active:scale-95"
                  >
                    <span>Agregar nota o detalles</span>
                    <ChevronRight size={14} className="opacity-50" />
                  </button>
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto">
                {showDetails ? (
                  <div className="space-y-4 p-4">
                    <h3 className="text-sm font-semibold text-[var(--text)]">Detalles</h3>

                    {templates.length > 0 && (
                      <div>
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-sm font-medium text-[var(--muted)]">Plantillas</span>
                          <span className="text-xs text-[var(--muted)]">Autocompletar</span>
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {templates.map((tpl) => (
                            <div
                              key={tpl.id}
                              className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2"
                            >
                              <button
                                onClick={() => handleApplyTemplate(tpl)}
                                className="text-sm font-semibold text-[var(--text)] hover:text-primary"
                                title="Aplicar plantilla"
                              >
                                {tpl.name}
                              </button>
                              <div className="flex items-center gap-2 text-[11px]">
                                {tpl.recurring && (
                                  <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">
                                    {tpl.frequency ?? 'recurr.'}
                                  </span>
                                )}
                                {onDeleteTemplate && (
                                  <button
                                    className="text-red-400 hover:underline"
                                    onClick={() => handleDeleteTemplate(tpl.id)}
                                    title="Eliminar plantilla"
                                  >
                                    borrar
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="mb-1 block text-sm font-medium text-[var(--muted)]">Nota (opcional)</label>
                      <input
                        ref={noteInputRef}
                        type="text"
                        value={note}
                        onChange={(e) => setNote(e.target.value.slice(0, 500))}
                        placeholder="Ej. almuerzo, Uber, mercado..."
                        className="w-full rounded-2xl border border-[var(--card-border)] bg-[var(--input-bg)] px-4 py-3 text-sm text-[var(--text)] focus:border-primary focus:outline-none"
                      />
                    </div>

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
                          className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text)] focus:border-primary focus:outline-none"
                        />
                        {editingTemplate?.createdAt && (
                          <p className="mt-1 text-[11px] text-[var(--muted)]">
                            Creada: {editingTemplate.createdAt.slice(0, 10)} (la fecha aqui es para el proximo registro).
                          </p>
                        )}
                      </div>

                      {onSaveTemplate && (
                        <div className="sm:col-span-2 grid grid-cols-1 gap-2 sm:grid-cols-3 items-end">
                          <div className="flex items-center gap-2 text-[var(--text)]">
                            <input
                              type="checkbox"
                              checked={recurring}
                              onChange={(e) => setRecurring(e.target.checked)}
                            />
                            <label className="text-sm font-medium text-[var(--muted)]">Recurrente</label>
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-semibold text-[var(--muted)]">Frecuencia</label>
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
                          <div className="sm:col-span-1 flex flex-col gap-2">
                            <label className="mb-1 block text-xs font-semibold text-[var(--muted)]">Guardar como plantilla</label>
                            <div className="flex gap-2">
                              <input
                                ref={templateNameInputRef}
                                type="text"
                                value={templateName}
                                onChange={(e) => setTemplateName(e.target.value)}
                                placeholder="Ej. Renta, Netflix"
                                className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text)] focus:border-primary focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={handleSaveTemplate}
                                disabled={saving || !templateName.trim()}
                                className="rounded-xl bg-[var(--primary)] px-3 py-2 text-sm font-semibold text-[var(--text-on-primary)] shadow hover:opacity-90 disabled:opacity-60"
                              >
                                Guardar
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {feedback && <p className="text-xs text-[var(--muted)]">{feedback}</p>}

                    {!editingTemplate && (
                      <button
                        type="button"
                        onClick={() => handleSave(true)}
                        disabled={saving || !formReady}
                        className="h-12 w-full rounded-xl bg-[var(--primary)] text-sm font-semibold text-[var(--text-on-primary)] shadow hover:opacity-90 disabled:opacity-60"
                      >
                        {saving ? 'Guardando...' : 'Guardar Gasto'}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex h-full flex-col p-3">
                    <div className="grid flex-1 grid-cols-4 gap-2 pb-6 sm:gap-3">
                      {frequentCategories.map((cat) => {
                        const active = cat.id === category;
                        const iconName = CATEGORY_ICONS[cat.id] ?? CATEGORY_ICONS.default;
                        const iconMap = Icons as unknown as Record<string, LucideIcon>;
                        const IconComponent = iconMap[iconName] ?? Icons.Tag;
                        return (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => setCategory(cat.id)}
                            className={`flex h-16 flex-col items-center justify-center rounded-xl border px-1 text-center text-[11px] font-semibold leading-tight transition sm:text-xs ${
                              active
                                ? 'border-primary bg-primary/20 text-[var(--text)] shadow'
                                : 'border-white/10 bg-white/5 text-[var(--text-muted)] hover:bg-white/10'
                            }`}
                          >
                            <IconComponent size={18} />
                            <span className="mt-1">{cat.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {!showDetails && (
                <div className="shrink-0 mt-auto border-t border-white/10 bg-white/5 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
                  {feedback && <p className="mb-2 text-xs text-[var(--muted)]">{feedback}</p>}
                  <CustomKeypad
                    onInput={handleKeypadInput}
                    onAction={handleSmartSave}
                    disabled={saving}
                    actionDisabled={smartSaveDisabled}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
