import type { IaQuota } from '../types';

function getErrorCode(err: unknown): string {
  const codeRaw = (err as { code?: unknown } | null)?.code;
  if (typeof codeRaw === 'string') return codeRaw;
  if (typeof codeRaw === 'number') return codeRaw.toString();
  if (codeRaw && typeof (codeRaw as { toString?: () => string }).toString === 'function') {
    return (codeRaw as { toString: () => string }).toString();
  }
  return '';
}

export function isResourceExhausted(err: unknown): boolean {
  return getErrorCode(err).includes('resource-exhausted');
}

type AiErrorKind = 'parse' | 'analyze' | 'free_chat';

export function mapAiError(err: unknown, kind: AiErrorKind = 'parse', quota?: IaQuota | null): string {
  const code = getErrorCode(err);
  const totalUsed = kind === 'analyze' ? (quota?.analyzeUsed ?? 0) : (quota?.parseUsed ?? 0);
  const limit = kind === 'analyze' ? (quota?.analyzeLimit ?? 0) : (quota?.parseLimit ?? 0);
  const quotaText = limit ? ` (${totalUsed}/${limit})` : '';

  if (code.includes('permission-denied') || code.includes('failed-precondition')) {
    if (kind === 'free_chat') {
      return 'Chat libre requiere membresia BYOK activa y tu API key configurada.';
    }
    return 'Configura tu API key en Configuracion o activa tu membresia para usar la IA.';
  }
  if (code.includes('invalid-argument') && kind === 'free_chat') {
    return 'Revisa el rango de fechas (maximo 31 dias) y tu mensaje.';
  }
  if (code.includes('resource-exhausted')) {
    if (kind === 'free_chat') {
      return 'Alcanzaste el limite horario de Chat libre. Intenta de nuevo en un rato.';
    }
    return `Alcanzaste el limite semanal de IA para tu plan${quotaText}.`;
  }
  return 'No pudimos consultar la IA. Intentalo de nuevo en unos minutos.';
}
