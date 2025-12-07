import { useEffect, useMemo, useRef, useState } from 'react';
import { frequentCategories, paymentMethods } from '../data/frequentCategories';
import { callTranscribeAudio } from '../services/functions';
import type { ParsedTransactionSuggestion, Template, TransactionInput } from '../types';

type Mode = 'quick' | 'natural';

interface QuickAddSheetProps {
  open: boolean;
  onClose: () => void;
  onSave: (payload: TransactionInput) => Promise<void> | void;
  onInterpret?: (text: string) => Promise<ParsedTransactionSuggestion>;
  templates?: Template[];
  onSaveTemplate?: (name: string, payload: TransactionInput & { recurring?: boolean; frequency?: Template['frequency'] }) => Promise<void>;
  onDeleteTemplate?: (id: string) => Promise<void>;
  onUpdateTemplate?: (id: string, payload: TransactionInput & { name?: string; recurring?: boolean; frequency?: Template['frequency'] }) => Promise<void>;
  selectedTemplate?: Template | null;
  onClearSelectedTemplate?: () => void;
}

const todayIso = () => new Date().toISOString().slice(0, 10);
const MAX_RECORDING_SECONDS = 10;

export function QuickAddSheet({
  open,
  onClose,
  onSave,
  onInterpret,
  templates = [],
  onSaveTemplate,
  onDeleteTemplate,
  onUpdateTemplate,
  selectedTemplate,
  onClearSelectedTemplate,
}: QuickAddSheetProps) {
  const [mode, setMode] = useState<Mode>('quick');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(frequentCategories[0]?.id ?? 'comida');
  const [note, setNote] = useState('');
  const [type, setType] = useState<TransactionInput['type']>('expense');
  const [paymentMethod, setPaymentMethod] = useState<TransactionInput['paymentMethod']>('debito');
  const [date, setDate] = useState(todayIso());
  const [showDetails, setShowDetails] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [recurring, setRecurring] = useState(false);
  const [frequency, setFrequency] = useState<Template['frequency']>('monthly');

  const [rawText, setRawText] = useState('');
  const [interpreting, setInterpreting] = useState(false);
  const [parsedSuggestion, setParsedSuggestion] = useState<ParsedTransactionSuggestion | null>(null);
  const [interpretError, setInterpretError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [transcribingAudio, setTranscribingAudio] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [templateName, setTemplateName] = useState('');
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordTimeoutRef = useRef<number | null>(null);
  const recordIntervalRef = useRef<number | null>(null);
  const recordingStartedRef = useRef<number | null>(null);
  const skipTranscriptionRef = useRef(false);

  const isOpen = open;

  const formReady = useMemo(() => !!amount && Number(amount) > 0, [amount]);

  const resetForm = () => {
    setAmount('');
    setNote('');
    setFeedback(null);
    setParsedSuggestion(null);
    setRawText('');
    setInterpretError(null);
    setCategory(frequentCategories[0]?.id ?? 'comida');
    setPaymentMethod('debito');
    setType('expense');
    setDate(todayIso());
    setRecurring(false);
    setFrequency('monthly');
  };

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
    setRecording(false);
    setRecordingDuration(0);
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
      recordingStartedRef.current = Date.now();

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

  const handleApplyTemplate = (tpl: Template) => {
    if (tpl.amount) setAmount(tpl.amount.toString());
    if (tpl.category) setCategory(tpl.category);
    if (tpl.note) setNote(tpl.note);
    if (tpl.paymentMethod) setPaymentMethod(tpl.paymentMethod);
    if (tpl.type) setType(tpl.type);
    if (tpl.recurring !== undefined) setRecurring(!!tpl.recurring);
    if (tpl.frequency) setFrequency(tpl.frequency);
    setEditingTemplate(tpl);
    setTemplateName(tpl.name);
    setShowDetails(true);
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!onDeleteTemplate) return;
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

  useEffect(() => {
    if (!isOpen && recording) {
      stopRecording(true);
    }
    return () => {
      stopRecording(true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, recording]);

  // Aplica template preseleccionado desde recordatorios (efecto para evitar setState en render)
  useEffect(() => {
    if (selectedTemplate) {
      handleApplyTemplate(selectedTemplate);
      onClearSelectedTemplate?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTemplate]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 z-50 max-h-[90vh] overflow-y-auto rounded-t-3xl bg-[var(--bg)] shadow-2xl transition">
        <div className="mx-auto w-full max-w-3xl px-4 py-4 pb-6">
          <div className="mb-3 flex items-center justify-center gap-2">
            <span className="h-1 w-12 rounded-full bg-slate-200" />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Registro rápido</p>
              <h2 className="text-lg font-semibold text-white">Añadir movimiento</h2>
            </div>
            <button className="text-sm font-medium text-[var(--muted)] hover:text-white" onClick={onClose}>
              Cerrar
            </button>
          </div>

          <div className="mt-4 flex gap-2 rounded-xl bg-[var(--card)] p-1">
            <button
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${
                mode === 'quick' ? 'bg-white shadow text-black' : 'text-[var(--text-muted)]'
              }`}
              onClick={() => setMode('quick')}
            >
              Modo rápido
            </button>
            <button
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${
                mode === 'natural' ? 'bg-white shadow text-black' : 'text-[var(--text-muted)]'
              }`}
              onClick={() => setMode('natural')}
            >
              Modo frase (IA)
            </button>
          </div>

          {mode === 'quick' ? (
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="sm:col-span-1">
                  <label className="mb-1 block text-sm font-medium text-[var(--muted)]">Tipo</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'expense', label: 'Gasto' },
                      { id: 'income', label: 'Ingreso' },
                    ].map((option) => (
                      <button
                        key={option.id}
                        onClick={() => {
                          setType(option.id as TransactionInput['type']);
                          if (option.id === 'income') setCategory('ingreso');
                        }}
                        className={`rounded-xl border px-3 py-2 text-sm font-semibold ${
                          type === option.id
                            ? 'border-primary bg-primary/15 text-primary'
                            : 'border-[var(--card-border)] text-white'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-[var(--muted)]">Monto</label>
                  <input
                    inputMode="decimal"
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full rounded-2xl border border-[var(--card-border)] bg-[var(--input-bg)] px-4 py-3 text-xl font-semibold text-[var(--text)] shadow-inner focus:border-primary focus:bg-[var(--input-bg)] focus:outline-none"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-[var(--muted)]">Categorías frecuentes</span>
                  <span className="text-xs text-[var(--muted)]">1 toque para elegir</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {frequentCategories.map((cat) => {
                    const active = cat.id === category;
                    return (
                      <button
                        key={cat.id}
                        onClick={() => setCategory(cat.id)}
                        className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                          active
                            ? 'bg-primary text-white shadow'
                            : 'bg-white/10 text-white hover:bg-white/20'
                        }`}
                      >
                        {cat.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {templates.length > 0 && (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-700">Plantillas</span>
                    <span className="text-xs text-slate-500">Autocompletar</span>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {templates.map((tpl) => (
                      <div
                        key={tpl.id}
                        className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2"
                      >
                        <button
                          onClick={() => handleApplyTemplate(tpl)}
                          className="text-sm font-semibold text-slate-800 hover:text-primary"
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
                              className="text-red-600 hover:underline"
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
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value.slice(0, 500))}
                  placeholder="Ej. almuerzo, Uber, mercado..."
                  className="w-full rounded-2xl border border-[var(--card-border)] bg-[var(--input-bg)] px-4 py-3 text-sm text-[var(--text)] focus:border-primary focus:outline-none"
                />
              </div>

              <button
                type="button"
                className="text-sm font-semibold text-primary"
                onClick={() => setShowDetails((prev) => !prev)}
              >
                {showDetails ? 'Ocultar detalles' : 'Más detalles'}
              </button>

              {showDetails && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-[var(--muted)]">Método de pago</label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value as TransactionInput['paymentMethod'])}
                      className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text)] focus:border-primary focus:outline-none"
                    >
                      {paymentMethods.map((method) => (
                        <option key={method} value={method}>
                          {method}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-[var(--muted)]">Fecha</label>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text)] focus:border-primary focus:outline-none"
                    />
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
                        <select
                          value={frequency ?? 'monthly'}
                          onChange={(e) => setFrequency(e.target.value as Template['frequency'])}
                          className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text)] focus:border-primary focus:outline-none"
                        >
                          <option value="weekly">Semanal</option>
                          <option value="monthly">Mensual</option>
                          <option value="yearly">Anual</option>
                        </select>
                      </div>
                      <div className="sm:col-span-1 flex flex-col gap-2">
                        <label className="mb-1 block text-xs font-semibold text-[var(--muted)]">Guardar como plantilla</label>
                        <div className="flex gap-2">
                          <input
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
                            className="rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white shadow disabled:opacity-60"
                          >
                            Guardar
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {feedback && <p className="text-sm text-slate-600">{feedback}</p>}

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleSave(true)}
                  disabled={saving}
                  className="rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white shadow transition hover:bg-emerald-800 disabled:opacity-60"
                >
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
                <button
                  onClick={() => handleSave(false)}
                  disabled={saving}
                  className="rounded-xl border border-primary/30 bg-white px-4 py-3 text-sm font-semibold text-primary transition hover:bg-primary/10 disabled:opacity-60"
                >
                  {saving ? 'Guardando...' : 'Guardar y añadir otro'}
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--muted)]">Describe el movimiento</label>
                <textarea
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  className="w-full rounded-2xl border border-[var(--card-border)] bg-[var(--input-bg)] px-4 py-3 text-sm text-[var(--text)] focus:border-primary focus:outline-none"
                  rows={4}
                  placeholder="Ej. Ayer gasté 23.500 en Uber con tarjeta de crédito."
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleMicToggle}
                  disabled={transcribingAudio}
                  className={`flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition ${
                    recording
                      ? 'border-red-400 bg-red-50 text-red-700'
                      : 'border-white/15 bg-white/5 text-white hover:border-primary hover:text-primary'
                  } disabled:opacity-60`}
                  title="Grabar audio (max 10s)"
                >
                  <span className="text-lg font-semibold">{recording ? 'REC' : 'Mic'}</span>
                  <span>{recording ? 'Detener y transcribir' : 'Grabar voz (10s)'}</span>
                </button>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  {recording && <span>Grabando {recordingDuration}s / {MAX_RECORDING_SECONDS}s</span>}
                  {transcribingAudio && <span>Transcribiendo audio...</span>}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="rounded-full bg-slate-100 px-2 py-1">Detecta monto, fecha, categoría</span>
                <span className="rounded-full bg-slate-100 px-2 py-1">Sugiere método de pago</span>
              </div>

              {interpretError && <p className="text-sm text-red-600">{interpretError}</p>}

              <button
                onClick={handleInterpret}
                disabled={interpreting || transcribingAudio}
                className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow hover:bg-slate-800 disabled:opacity-60"
              >
                {transcribingAudio ? 'Transcribiendo audio...' : interpreting ? 'Interpretando...' : 'Interpretar frase con IA'}
              </button>

              {parsedSuggestion && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-800">Revisión rápida</h3>
                    {parsedSuggestion.confidence !== undefined && (
                      <span className="rounded-full bg-white px-2 py-1 text-xs text-slate-600">
                        Confianza aprox. {(parsedSuggestion.confidence * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                  <dl className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <dt className="text-slate-500">Monto</dt>
                      <dd className="font-semibold">${parsedSuggestion.amount.toLocaleString()}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Tipo</dt>
                      <dd className="font-semibold">
                        {parsedSuggestion.type === 'income' ? 'Ingreso' : 'Gasto'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Categoría sugerida</dt>
                      <dd className="font-semibold capitalize">{parsedSuggestion.category}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Fecha</dt>
                      <dd className="font-semibold">{parsedSuggestion.date}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Método</dt>
                      <dd className="font-semibold capitalize">{parsedSuggestion.paymentMethod}</dd>
                    </div>
                  </dl>
                  {parsedSuggestion.note && (
                    <p className="mt-2 rounded-lg bg-white px-2 py-1 text-xs text-slate-600">
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
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100"
                    >
                      Editar antes de guardar
                    </button>
                    <button
                      onClick={handleSaveParsed}
                      disabled={saving}
                      className="rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-800 disabled:opacity-60"
                    >
                      {saving ? 'Guardando...' : 'Confirmar y guardar'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
