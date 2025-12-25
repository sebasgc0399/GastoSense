import type { Transaction } from '../../types';
import { resolveCanonicalCategoryId, resolveCategoryLabel, type CategoryResolver } from '../categoryResolver';

export type ExportFormat = 'csv' | 'xlsx' | 'json';

export type ExportOptions = {
  includeNote?: boolean;
  includePaymentMethod?: boolean;
  includeCategory?: boolean;
  signedAmounts?: boolean;
  includeBudgetStats?: boolean;
};

export type ExportBudgetContext = {
  perCategory?: Record<string, number | string | undefined>;
};

export type ExportRow = Record<string, string | number>;

const escapeCsvValue = (value: string) => `"${value.replace(/"/g, '""')}"`;

const formatPaymentMethod = (value?: string | null) => {
  const raw = value?.trim() ?? '';
  if (!raw) return '';
  const lower = raw.toLocaleLowerCase('es-CO');
  if (raw !== lower) return raw;
  return `${lower.charAt(0).toLocaleUpperCase('es-CO')}${lower.slice(1)}`;
};

const resolveCategoryName = (categoryId: string, resolver?: CategoryResolver) => {
  const canonical = resolveCanonicalCategoryId(categoryId, resolver);
  return resolveCategoryLabel(canonical, resolver) ?? categoryId;
};

const buildBudgetMap = (context?: ExportBudgetContext, resolver?: CategoryResolver) => {
  const perCategory = context?.perCategory ?? {};
  const normalized: Record<string, number> = {};
  for (const [rawId, rawValue] of Object.entries(perCategory)) {
    const canonical = resolveCanonicalCategoryId(rawId, resolver);
    const numeric = typeof rawValue === 'number' ? rawValue : Number(rawValue);
    if (!Number.isFinite(numeric)) continue;
    const prev = normalized[canonical];
    normalized[canonical] = prev === undefined ? numeric : Math.max(prev, numeric);
  }
  return normalized;
};

const buildSpentMap = (transactions: Transaction[], resolver?: CategoryResolver) => {
  const spentByCategory: Record<string, number> = {};
  for (const tx of transactions) {
    if (tx.type !== 'expense') continue;
    const canonical = resolveCanonicalCategoryId(tx.categoryId, resolver);
    spentByCategory[canonical] = (spentByCategory[canonical] ?? 0) + Math.abs(tx.amount);
  }
  return spentByCategory;
};

export const buildExportColumns = (options: ExportOptions = {}) => {
  const opts = {
    includeNote: true,
    includePaymentMethod: true,
    includeCategory: true,
    signedAmounts: true,
    includeBudgetStats: false,
    ...options,
  };

  const columns = ['fecha', 'tipo'];
  if (opts.includeCategory) columns.push('categoria');
  if (opts.includeNote) columns.push('nota');
  columns.push('monto');
  if (opts.includePaymentMethod) columns.push('metodo_pago');
  if (opts.includeBudgetStats) {
    columns.push('presupuesto_categoria', 'gastado_categoria', 'porcentaje_usado', 'exceso_categoria');
  }
  return columns;
};

export const buildExportRows = (
  transactions: Transaction[],
  resolver?: CategoryResolver,
  options: ExportOptions = {},
  budgetContext?: ExportBudgetContext,
) => {
  const opts = {
    includeNote: true,
    includePaymentMethod: true,
    includeCategory: true,
    signedAmounts: true,
    includeBudgetStats: false,
    ...options,
  };

  const spentByCategory = opts.includeBudgetStats ? buildSpentMap(transactions, resolver) : {};
  const budgetByCategory = opts.includeBudgetStats ? buildBudgetMap(budgetContext, resolver) : {};

  return transactions.map((tx) => {
    const typeLabel = tx.type === 'expense' ? 'gasto' : 'ingreso';
    const amountValue = opts.signedAmounts
      ? tx.type === 'expense'
        ? -Math.abs(tx.amount)
        : Math.abs(tx.amount)
      : Math.abs(tx.amount);

    const row: ExportRow = {
      fecha: tx.date,
      tipo: typeLabel,
    };
    if (opts.includeCategory) {
      row.categoria = resolveCategoryName(tx.categoryId, resolver);
    }
    if (opts.includeNote) {
      row.nota = tx.note ?? '';
    }
    row.monto = amountValue;
    if (opts.includePaymentMethod) {
      row.metodo_pago = formatPaymentMethod(tx.paymentMethod);
    }

    if (opts.includeBudgetStats) {
      if (tx.type === 'expense') {
        const canonical = resolveCanonicalCategoryId(tx.categoryId, resolver);
        const spent = spentByCategory[canonical] ?? 0;
        const budgetValue = budgetByCategory[canonical];
        const safeBudget = typeof budgetValue === 'number' && Number.isFinite(budgetValue) ? budgetValue : null;
        const percentUsed = safeBudget && safeBudget > 0 ? Math.round((spent / safeBudget) * 100) : '';
        const excess = safeBudget && safeBudget > 0 ? Math.max(spent - safeBudget, 0) : '';
        row.presupuesto_categoria = safeBudget ?? '';
        row.gastado_categoria = spent;
        row.porcentaje_usado = percentUsed;
        row.exceso_categoria = excess;
      } else {
        row.presupuesto_categoria = '';
        row.gastado_categoria = '';
        row.porcentaje_usado = '';
        row.exceso_categoria = '';
      }
    }

    return row;
  });
};

export const transactionsToCsv = (
  transactions: Transaction[],
  resolver?: CategoryResolver,
  options: ExportOptions = {},
  budgetContext?: ExportBudgetContext,
) => {
  const columns = buildExportColumns(options);
  const rows = buildExportRows(transactions, resolver, options, budgetContext);
  const headerLine = columns.map((value) => escapeCsvValue(value)).join(';');
  const bodyLines = rows.map((row) =>
    columns.map((column) => escapeCsvValue(String(row[column] ?? ''))).join(';'),
  );
  return `\ufeff${[headerLine, ...bodyLines].join('\n')}`;
};

export const transactionsToJson = (
  transactions: Transaction[],
  resolver?: CategoryResolver,
  options: ExportOptions = {},
  budgetContext?: ExportBudgetContext,
) => JSON.stringify(buildExportRows(transactions, resolver, options, budgetContext), null, 2);

export const downloadBlobFile = (filename: string, blob: Blob) => {
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
};

export const downloadTextFile = (filename: string, content: string, mime = 'text/csv;charset=utf-8') => {
  const blob = new Blob([content], { type: mime });
  downloadBlobFile(filename, blob);
};
