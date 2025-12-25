import type { Transaction } from '../../types';
import { resolveCanonicalCategoryId, resolveCategoryLabel, type CategoryResolver } from '../categoryResolver';

export type CsvExportOptions = {
  includeNote?: boolean;
  includePaymentMethod?: boolean;
  includeCategory?: boolean;
  signedAmounts?: boolean;
};

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

export const transactionsToCsv = (
  transactions: Transaction[],
  resolver?: CategoryResolver,
  options: CsvExportOptions = {},
) => {
  const opts = {
    includeNote: true,
    includePaymentMethod: true,
    includeCategory: true,
    signedAmounts: true,
    ...options,
  };

  const headers = ['fecha', 'tipo'];
  if (opts.includeCategory) headers.push('categoria');
  if (opts.includeNote) headers.push('nota');
  headers.push('monto');
  if (opts.includePaymentMethod) headers.push('metodo_pago');

  const rows = transactions.map((tx) => {
    const typeLabel = tx.type === 'expense' ? 'gasto' : 'ingreso';
    const amountValue = opts.signedAmounts
      ? tx.type === 'expense'
        ? -Math.abs(tx.amount)
        : Math.abs(tx.amount)
      : Math.abs(tx.amount);

    const row: Array<string | number> = [tx.date, typeLabel];

    if (opts.includeCategory) {
      row.push(resolveCategoryName(tx.categoryId, resolver));
    }
    if (opts.includeNote) {
      row.push(tx.note ?? '');
    }

    row.push(amountValue);

    if (opts.includePaymentMethod) {
      row.push(formatPaymentMethod(tx.paymentMethod));
    }

    return row.map((value) => escapeCsvValue(String(value ?? ''))).join(';');
  });

  const headerLine = headers.map((value) => escapeCsvValue(value)).join(';');
  return `\ufeff${[headerLine, ...rows].join('\n')}`;
};

export const downloadTextFile = (filename: string, content: string, mime = 'text/csv;charset=utf-8') => {
  const blob = new Blob([content], { type: mime });
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
