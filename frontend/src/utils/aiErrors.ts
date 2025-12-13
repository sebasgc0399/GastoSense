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

export function mapAiError(err: unknown, kind: 'parse' | 'analyze' = 'parse', quota?: IaQuota | null): string {
  const code = getErrorCode(err);
  const totalUsed = kind === 'analyze' ? (quota?.analyzeUsed ?? 0) : (quota?.parseUsed ?? 0);
  const limit = kind === 'analyze' ? (quota?.analyzeLimit ?? 0) : (quota?.parseLimit ?? 0);
  const quotaText = limit ? ` (${totalUsed}/${limit})` : '';

  if (code.includes('permission-denied') || code.includes('failed-precondition')) {
    return 'Configura tu API key en Configuración o activa tu membresía para usar la IA.';
  }
  if (code.includes('resource-exhausted')) {
    return `Alcanzaste el límite semanal de IA para tu plan${quotaText}.`;
  }
  return 'No pudimos consultar la IA. Inténtalo de nuevo en unos minutos.';
}

