import type { PaymentMethod, TransactionType } from '../../types';

export type NormalizedRow = {
  date: string;
  type: TransactionType;
  amount: number;
  categoryLabel?: string;
  note?: string;
  paymentMethod?: PaymentMethod;
};

export type ImportRowError = {
  row: number;
  message: string;
};

export type ImportPreviewRow = {
  date: string;
  type: string;
  category: string;
  amount: number;
  note: string;
  paymentMethod: string;
};

export type ImportReport = {
  total: number;
  valid: number;
  invalid: number;
  rangeFrom?: string;
  rangeTo?: string;
  errors: ImportRowError[];
  preview: ImportPreviewRow[];
  rows: NormalizedRow[];
};

type RawRow = {
  date?: unknown;
  type?: unknown;
  category?: unknown;
  note?: unknown;
  amount?: unknown;
  paymentMethod?: unknown;
};

const MAX_NOTE_LENGTH = 300;
const MAX_CATEGORY_LENGTH = 80;

const HEADER_MAP_RAW: Record<string, keyof RawRow> = {
  fecha: 'date',
  date: 'date',
  dia: 'date',
  day: 'date',
  fechahora: 'date',
  datetime: 'date',
  'f.valor': 'date',
  tipo: 'type',
  type: 'type',
  movimiento: 'type',
  kind: 'type',
  sentido: 'type',
  naturaleza: 'type',
  categoria: 'category',
  category: 'category',
  cat: 'category',
  rubro: 'category',
  familia: 'category',
  nota: 'note',
  note: 'note',
  descripcion: 'note',
  description: 'note',
  concepto: 'note',
  detalle: 'note',
  observacion: 'note',
  memo: 'note',
  monto: 'amount',
  amount: 'amount',
  valor: 'amount',
  value: 'amount',
  importe: 'amount',
  cantidad: 'amount',
  precio: 'amount',
  saldo: 'amount',
  metodo_pago: 'paymentMethod',
  metodo_de_pago: 'paymentMethod',
  paymentmethod: 'paymentMethod',
  payment_method: 'paymentMethod',
  cuenta: 'paymentMethod',
  origen: 'paymentMethod',
  medio: 'paymentMethod',
};

const normalizeHeaderKey = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

const HEADER_MAP: Record<string, keyof RawRow> = Object.entries(HEADER_MAP_RAW).reduce(
  (acc, [key, value]) => {
    acc[normalizeHeaderKey(key)] = value;
    return acc;
  },
  {} as Record<string, keyof RawRow>,
);

const HEADER_KEYS = Object.keys(HEADER_MAP);

const resolveHeaderKey = (value: string): keyof RawRow | null => {
  const normalized = normalizeHeaderKey(value);
  if (!normalized) return null;
  const direct = HEADER_MAP[normalized];
  if (direct) return direct;
  let bestKey = '';
  for (const key of HEADER_KEYS) {
    if (normalized.includes(key) && key.length > bestKey.length) {
      bestKey = key;
    }
  }
  return bestKey ? HEADER_MAP[bestKey] : null;
};

const toText = (value: unknown) => {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(
      value.getDate(),
    ).padStart(2, '0')}`;
  }
  return '';
};

const truncateText = (value: string, max: number) => (value.length > max ? value.slice(0, max) : value);

const parseDate = (value: unknown): string | null => {
  const pad2 = (n: number) => String(n).padStart(2, '0');

  const isValidYMD = (y: number, m: number, d: number) => {
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return false;
    if (y < 1900 || y > 2100) return false;
    if (m < 1 || m > 12) return false;
    if (d < 1 || d > 31) return false;
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  };

  const toIso = (y: number, m: number, d: number) => `${y}-${pad2(m)}-${pad2(d)}`;

  const excelSerialToIso = (serial: number): string | null => {
    if (!Number.isFinite(serial)) return null;
    if (serial <= 0) return null;
    if (serial < 20000) return null;

    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const ms = excelEpoch.getTime() + serial * 86400000;
    const dt = new Date(ms);
    const y = dt.getUTCFullYear();
    const m = dt.getUTCMonth() + 1;
    const d = dt.getUTCDate();
    return isValidYMD(y, m, d) ? toIso(y, m, d) : null;
  };

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = value.getMonth() + 1;
    const d = value.getDate();
    return isValidYMD(y, m, d) ? toIso(y, m, d) : null;
  }

  if (typeof value === 'number') {
    const iso = excelSerialToIso(value);
    if (iso) return iso;
  }

  const raw0 = toText(value);
  if (!raw0) return null;

  const rawDatePart = raw0.trim().split(/[T\s]/)[0];
  if (!rawDatePart) return null;

  if (/^\d{5}$/.test(rawDatePart)) {
    const asNum = Number(rawDatePart);
    const iso = excelSerialToIso(asNum);
    if (iso) return iso;
  }

  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(rawDatePart);
  if (compact) {
    const y = Number(compact[1]);
    const m = Number(compact[2]);
    const d = Number(compact[3]);
    return isValidYMD(y, m, d) ? toIso(y, m, d) : null;
  }

  const s = rawDatePart.replace(/\./g, '/').replace(/-/g, '/');

  const ymd = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(s);
  if (ymd) {
    const y = Number(ymd[1]);
    const m = Number(ymd[2]);
    const d = Number(ymd[3]);
    return isValidYMD(y, m, d) ? toIso(y, m, d) : null;
  }

  const dmyOrMdy = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s);
  if (dmyOrMdy) {
    const a = Number(dmyOrMdy[1]);
    const b = Number(dmyOrMdy[2]);
    let y = Number(dmyOrMdy[3]);

    if (y < 100) y = y <= 69 ? 2000 + y : 1900 + y;

    let day = a;
    let month = b;
    if (a <= 12 && b > 12) {
      month = a;
      day = b;
    }

    return isValidYMD(y, month, day) ? toIso(y, month, day) : null;
  }

  return null;
};

const parseType = (value: unknown): TransactionType | null => {
  const raw = toText(value).toLowerCase();
  if (!raw) return null;
  if (raw.includes('gasto') || raw.includes('expense') || raw.includes('egreso')) return 'expense';
  if (raw.includes('ingreso') || raw.includes('income') || raw.includes('abono')) return 'income';
  return null;
};

const smartParseNumber = (raw: unknown): number => {
  if (typeof raw === 'number') return Math.abs(raw);
  if (typeof raw !== 'string') return 0;

  let clean = raw.replace(/[$\s€£A-Za-z]/g, '').trim();
  if (!clean) return 0;

  clean = clean.replace(/[()-]/g, '');

  const lastCommaIndex = clean.lastIndexOf(',');
  const lastDotIndex = clean.lastIndexOf('.');

  if (lastCommaIndex > -1 && lastDotIndex > -1) {
    if (lastCommaIndex > lastDotIndex) {
      clean = clean.replace(/\./g, '').replace(',', '.');
    } else {
      clean = clean.replace(/,/g, '');
    }
  } else if (lastCommaIndex > -1) {
    clean = clean.replace(',', '.');
  } else if (lastDotIndex > -1) {
    const parts = clean.split('.');
    if (parts.length > 2) {
      clean = clean.replace(/\./g, '');
    }
  }

  const parsed = Number.parseFloat(clean);
  if (!Number.isFinite(parsed)) return 0;
  return Math.abs(parsed);
};

const parseAmount = (value: unknown): number | null => {
  const parsed = smartParseNumber(value);
  if (!parsed) return null;
  return parsed;
};

const parsePaymentMethod = (value: unknown): PaymentMethod | undefined => {
  const raw = toText(value).toLowerCase();
  if (!raw) return undefined;
  if (['efectivo', 'debito', 'credito', 'digital', 'otro'].includes(raw)) return raw as PaymentMethod;
  return undefined;
};

const normalizeRow = (row: RawRow, rowIndex: number): { normalized?: NormalizedRow; errors?: ImportRowError[] } => {
  const errors: ImportRowError[] = [];
  const date = parseDate(row.date);
  if (!date) errors.push({ row: rowIndex, message: 'Fecha invalida' });
  const type = parseType(row.type);
  if (!type) errors.push({ row: rowIndex, message: 'Tipo invalido' });
  const amount = parseAmount(row.amount);
  if (!amount || amount <= 0) errors.push({ row: rowIndex, message: 'Monto invalido' });

  if (errors.length > 0 || !date || !type || !amount) return { errors };

  const categoryRaw = toText(row.category);
  const categoryLabel = categoryRaw ? truncateText(categoryRaw, MAX_CATEGORY_LENGTH) : undefined;
  const noteRaw = toText(row.note);
  const note = noteRaw ? truncateText(noteRaw, MAX_NOTE_LENGTH) : undefined;
  const paymentMethod = parsePaymentMethod(row.paymentMethod);

  return {
    normalized: {
      date,
      type,
      amount,
      categoryLabel,
      note,
      paymentMethod,
    },
  };
};

const buildPreviewRow = (row: NormalizedRow): ImportPreviewRow => ({
  date: row.date,
  type: row.type === 'expense' ? 'gasto' : 'ingreso',
  category: row.categoryLabel || '',
  amount: row.type === 'expense' ? -Math.abs(row.amount) : Math.abs(row.amount),
  note: row.note ?? '',
  paymentMethod: row.paymentMethod ?? '',
});

const buildReport = (rows: RawRow[], rowOffset: number): ImportReport => {
  const validRows: NormalizedRow[] = [];
  const errors: ImportRowError[] = [];

  rows.forEach((row, index) => {
    const result = normalizeRow(row, index + rowOffset);
    if (result.errors?.length) {
      errors.push(...result.errors);
      return;
    }
    if (result.normalized) validRows.push(result.normalized);
  });

  const rangeFrom = validRows.reduce((min, row) => (min && min < row.date ? min : row.date), '') || undefined;
  const rangeTo = validRows.reduce((max, row) => (max && max > row.date ? max : row.date), '') || undefined;

  return {
    total: rows.length,
    valid: validRows.length,
    invalid: rows.length - validRows.length,
    rangeFrom,
    rangeTo,
    errors,
    preview: validRows.slice(0, 5).map(buildPreviewRow),
    rows: validRows,
  };
};

const buildRowsFromObjects = (items: Array<Record<string, unknown>>): RawRow[] =>
  items.map((item) => {
    const row: RawRow = {};
    Object.entries(item).forEach(([key, value]) => {
      const mapped = resolveHeaderKey(key);
      if (!mapped) return;
      row[mapped] = value;
    });
    return row;
  });

const parseDelimited = (text: string, delimiter: string): string[][] => {
  const rows: string[][] = [];
  let current = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && char === delimiter) {
      row.push(current);
      current = '';
      continue;
    }
    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(current);
      rows.push(row);
      row = [];
      current = '';
      continue;
    }
    current += char;
  }
  row.push(current);
  rows.push(row);
  return rows.filter((item) => item.some((cell) => cell.trim() !== ''));
};

const parseTable = (table: Array<Array<unknown>>): ImportReport => {
  if (!table.length) {
    return { total: 0, valid: 0, invalid: 0, errors: [], preview: [], rows: [] };
  }
  const headerRow = table[0].map((cell) => resolveHeaderKey(toText(cell)));
  const rows = table.slice(1).map((cells) => {
    const row: RawRow = {};
    headerRow.forEach((header, index) => {
      if (!header) return;
      row[header] = cells[index];
    });
    return row;
  });
  return buildReport(rows, 2);
};

export const parseCsv = async (file: File): Promise<ImportReport> => {
  const text = (await file.text()).replace(/^\ufeff/, '');
  const delimiter = text.includes(';') ? ';' : ',';
  const rows = parseDelimited(text, delimiter);
  return parseTable(rows);
};

export const parseJson = async (file: File): Promise<ImportReport> => {
  const raw = (await file.text()).replace(/^\ufeff/, '');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error('JSON invalido');
  }
  const rows = buildRowsFromObjects(parsed as Array<Record<string, unknown>>);
  return buildReport(rows, 1);
};

export const parseXlsx = async (file: File): Promise<ImportReport> => {
  const XLSX = await import('xlsx');
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array' });
  const sheetName =
    workbook.SheetNames.find((name) => name.toLowerCase() === 'plantilla') || workbook.SheetNames[0];
  if (!sheetName) {
    return { total: 0, valid: 0, invalid: 0, errors: [], preview: [], rows: [] };
  }
  const sheet = workbook.Sheets[sheetName];
  const table = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    raw: true,
  }) as Array<Array<unknown>>;
  return parseTable(table);
};

export const parseTransactionsFile = async (file: File): Promise<ImportReport> => {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv')) return parseCsv(file);
  if (name.endsWith('.xlsx')) return parseXlsx(file);
  throw new Error('Solo Excel (.xlsx) o CSV por ahora.');
};
