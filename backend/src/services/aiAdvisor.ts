import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

type AdvisorMode = 'amable' | 'regañon' | 'directo' | 'exigente';

interface SpendingSummary {
  month?: string;
  totalExpense?: number;
  totalIncome?: number;
  topCategories?: { category: string; amount: number }[];
  budget?: number;
  lastTransactions?: { amount: number; category: string; type: 'expense' | 'income'; date: string; note?: string }[];
  previousMonthExpense?: number;
  previousMonthIncome?: number;
}

interface AnalyzeInput {
  mode: AdvisorMode;
  summary?: SpendingSummary;
  action?: string;
}

interface ParsedTransaction {
  amount: number;
  category: string;
  note?: string;
  paymentMethod: 'efectivo' | 'debito' | 'credito' | 'digital' | 'otro';
  type: 'expense' | 'income';
  date: string;
  confidence?: number;
  rawText?: string;
}

const advisorPrompts: Record<AdvisorMode, string> = {
  amable:
    'Eres un asesor financiero personal amable, motivador y paciente. Felicita pequeños avances y da pasos accionables cortos. No repitas la misma respuesta si cambian los datos o la acción solicitada.',
  regañon:
    'Eres un asesor financiero tipo tough love: directo y firme, sin insultar. Señala con claridad los fallos y da acciones específicas. No culpas a la persona, solo a la conducta financiera. No repitas la misma respuesta si cambian los datos o la acción solicitada.',
  directo:
    'Eres un asesor financiero directo, claro y respetuoso. Ve al grano con hechos y acciones puntuales. No adornes ni suavices demasiado; señala qué recortar y cómo.',
  exigente:
    'Eres un asesor financiero exigente y disciplinado. Marca con firmeza los puntos débiles y exige acciones concretas con metas claras. No insultas, pero no toleras excusas.',
};

const hasApiKey = !!(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim().length > 0);
const client = hasApiKey ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

const fallbackAdvice =
  'No pudimos generar recomendaciones con la IA ahora mismo. Revisa tu conexión o la clave de OpenAI.';

export async function analyzeSummary({ mode, summary, action }: AnalyzeInput): Promise<string> {
  if (!client) {
    console.warn('[aiAdvisor] Sin OPENAI_API_KEY, devolviendo fallback.');
    return buildFallbackFromData(summary);
  }

  const systemPrompt = `${advisorPrompts[mode]} Habla en viñetas cortas (máximo 4-6). Incluye siempre una línea "Acción principal: ...". Usa números concretos del resumen (gasto, ingreso, presupuesto, categorías top). Si hay presupuesto, indica porcentaje usado. No incluyas textos de descargo; el cliente mostrará el aviso final.`;

  const topCategoriesText = summary?.topCategories
    ?.map((item) => `${item.category}: ${item.amount}`)
    .join(', ');

  const lastTx = summary?.lastTransactions
    ?.slice(0, 5)
    .map((t) => `${t.date} ${t.type === 'income' ? 'Ingreso' : 'Gasto'} $${t.amount} ${t.category} (${t.note || ''})`)
    .join(' | ');

  const userPrompt = [
    action ? `Acción solicitada: ${action}.` : null,
    summary?.month ? `Mes: ${summary.month}.` : null,
    summary?.totalExpense !== undefined ? `Total gasto mes: ${summary.totalExpense}.` : null,
    summary?.totalIncome !== undefined ? `Total ingreso mes: ${summary.totalIncome}.` : null,
    summary?.budget !== undefined ? `Presupuesto mensual: ${summary.budget}.` : null,
    summary?.previousMonthExpense !== undefined ? `Gasto mes anterior: ${summary.previousMonthExpense}.` : null,
    summary?.previousMonthIncome !== undefined ? `Ingreso mes anterior: ${summary.previousMonthIncome}.` : null,
    topCategoriesText ? `Top categorías (monto): ${topCategoriesText}.` : null,
    lastTx ? `Últimos movimientos: ${lastTx}.` : null,
    'Si no hay datos suficientes, dilo y pide registrar movimientos clave.',
  ]
    .filter(Boolean)
    .join(' ');

  try {
    const completion = await client.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt || 'Genera consejos claros y cortos.' },
      ],
      max_tokens: 350,
      temperature: 0.6,
    });

    const content = completion.choices?.[0]?.message?.content;
    if (!content) {
      console.warn('[aiAdvisor] Respuesta sin contenido, usando fallback.');
      return buildFallbackFromData(summary);
    }
    return content;
  } catch (error) {
    console.error('[aiAdvisor.analyzeSummary] error', error);
    return buildFallbackFromData(summary);
  }
}

export async function parseTransactionText(text: string): Promise<ParsedTransaction> {
  const fallback = buildHeuristicParse(text);

  if (!client) {
    return fallback;
  }

  const schema = {
    type: 'object',
    properties: {
      amount: { type: 'number' },
      category: { type: 'string' },
      note: { type: 'string' },
      paymentMethod: { type: 'string', enum: ['efectivo', 'debito', 'credito', 'digital', 'otro'] },
      type: { type: 'string', enum: ['expense', 'income'] },
      date: { type: 'string' },
    },
    required: ['amount', 'category', 'note', 'paymentMethod', 'type', 'date'],
    additionalProperties: false,
  } as const;

  try {
    const completion = await client.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages: [
        {
          role: 'system',
          content:
            'Eres un extractor de datos de transacciones. Devuelve JSON que cumpla el esquema: amount (number), category (string), note (string), paymentMethod (efectivo|debito|credito|digital|otro), type (expense|income), date (YYYY-MM-DD). Usa la fecha de hoy si no se indica, o ayer/anteayer si se menciona. Detecta tarjeta de crédito/débito. Ejemplo: "viaje por avianca a cali hoy me costó 300000 pagué con tarjeta de crédito" => amount 300000, category transporte, type expense, paymentMethod credito, date hoy. Si ves ingresos, usa type income.',
        },
        { role: 'user', content: text },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'transaction', schema, strict: true } },
      max_tokens: 200,
      temperature: 0.2,
    });

    const raw = completion.choices?.[0]?.message?.content;
    const parsed = raw ? (JSON.parse(raw) as Partial<ParsedTransaction>) : undefined;

    const result: ParsedTransaction = {
      amount: parsed?.amount ?? fallback.amount,
      category: parsed?.category ?? fallback.category,
      paymentMethod: parsed?.paymentMethod ?? fallback.paymentMethod,
      type: parsed?.type ?? fallback.type,
      date: parsed?.date ?? fallback.date,
      rawText: text,
    };

    const relativeDate = deriveRelativeDate(text);
    if (relativeDate) {
      result.date = relativeDate;
    }

    const note = parsed?.note ?? fallback.note;
    if (note) {
      result.note = note;
    }

    const confidence = parsed?.confidence ?? fallback.confidence;
    if (confidence !== undefined) {
      result.confidence = confidence;
    }

    return result;
  } catch (error) {
    console.error('[parseTransactionText] error', error);
    return fallback;
  }
}

function buildHeuristicParse(text: string): ParsedTransaction {
  const amountMatch = text.match(/(\d+[.,]?\d*)/);
  const amountValue = amountMatch ? Number(amountMatch?.[1]?.replace(',', '.') ?? 0) : 0;
  const isIncome = /ingreso|salario|entr[oó]|recib[ií]|dep[óo]sito/i.test(text);
  const relativeDate = deriveRelativeDate(text);
  const dateGuess = relativeDate ? new Date(relativeDate) : new Date();

  let categoryGuess = 'comida';
  if (/uber|taxi|transporte/i.test(text)) categoryGuess = 'transporte';
  if (/renta|arriendo|alquiler/i.test(text)) categoryGuess = 'renta';
  if (/netflix|spotify|suscrip/i.test(text)) categoryGuess = 'suscripciones';
  if (/mercado|super/i.test(text)) categoryGuess = 'mercado';
  if (/vuelo|aerolinea|avianca|latam|boleto|viaje/i.test(text)) categoryGuess = 'transporte';
  if (/ocio|cine|concierto/i.test(text)) categoryGuess = 'ocio';

  let paymentMethodGuess: ParsedTransaction['paymentMethod'] = 'debito';
  if (/cr[eé]dito/i.test(text) || /visa|mastercard|amex/i.test(text)) paymentMethodGuess = 'credito';
  if (/efectivo/i.test(text)) paymentMethodGuess = 'efectivo';
  if (/nequi|daviplata|paypal|zelle|transfer/i.test(text)) paymentMethodGuess = 'digital';

  return {
    amount: amountValue,
    category: categoryGuess,
    note: text,
    paymentMethod: paymentMethodGuess,
    type: isIncome ? 'income' : 'expense',
    date: dateGuess.toISOString().slice(0, 10),
    confidence: 0.6,
    rawText: text,
  };
}

function buildFallbackFromData(summary?: SpendingSummary): string {
  const lines: string[] = [];
  if (summary?.totalExpense !== undefined) {
    lines.push(`Gasto del mes: $${summary.totalExpense.toLocaleString()}.`);
  }
  if (summary?.totalIncome !== undefined) {
    lines.push(`Ingreso del mes: $${summary.totalIncome.toLocaleString()}.`);
  }
  if (summary?.budget !== undefined && summary.totalExpense !== undefined) {
    const pct = summary.budget > 0 ? Math.round((summary.totalExpense / summary.budget) * 100) : 0;
    lines.push(`Presupuesto: $${summary.budget.toLocaleString()} (${pct}% usado).`);
  }
  if (summary?.topCategories?.length) {
    const top = summary.topCategories
      .slice(0, 3)
      .map((c) => `${c.category}: $${c.amount.toLocaleString()}`)
      .join(' | ');
    lines.push(`Top categorías: ${top}.`);
  }
  lines.push('Acción principal: reduce un gasto discrecional y registra ingresos faltantes.');
  return lines.join(' ');
}

function deriveRelativeDate(text: string): string | null {
  const now = new Date();
  const lower = text.toLowerCase();

  if (lower.includes('anteayer')) {
    now.setDate(now.getDate() - 2);
    return now.toISOString().slice(0, 10);
  }
  if (lower.includes('ayer')) {
    now.setDate(now.getDate() - 1);
    return now.toISOString().slice(0, 10);
  }
  if (lower.includes('hoy') || lower.includes('ahora')) {
    return now.toISOString().slice(0, 10);
  }

  const agoMatch = lower.match(/hace\s+(\d+)\s*d[ií]as?/);
  if (agoMatch) {
    const days = Number(agoMatch[1]) || 0;
    const temp = new Date();
    temp.setDate(temp.getDate() - days);
    return temp.toISOString().slice(0, 10);
  }

  const weekdayMatch = lower.match(
    /(lunes|martes|mi[eé]rcoles|miercoles|jueves|viernes|s[áa]bado|sabado|domingo)\s+pasad[oa]/,
  );
  if (weekdayMatch) {
    const key = weekdayMatch[1] as keyof typeof map | undefined;
    const map: Record<string, number> = {
      lunes: 1,
      martes: 2,
      miércoles: 3,
      miercoles: 3,
      jueves: 4,
      viernes: 5,
      sábado: 6,
      sabado: 6,
      domingo: 0,
    };
    if (!key) return null;
    const target = map[key];
    if (target === undefined) return null;
    const current = now.getDay();
    let diff = current - target;
    if (diff <= 0) diff += 7;
    const temp = new Date();
    temp.setDate(temp.getDate() - diff);
    return temp.toISOString().slice(0, 10);
  }

  const dayOfMonth = lower.match(/\b(?:el|para el|dia|d[ií]a)\s+(\d{1,2})\b/);
  if (dayOfMonth) {
    const dayNum = Number(dayOfMonth[1]);
    if (dayNum >= 1 && dayNum <= 31) {
      const temp = new Date();
      temp.setDate(1);
      temp.setDate(dayNum);
      return temp.toISOString().slice(0, 10);
    }
  }

  return null;
}
