import { useEffect, useMemo, useState } from 'react';
import type { Budget, Transaction } from '../../types';
import type { CategoryResolver } from '../../utils/categoryResolver';
import {
  buildExportColumns,
  buildExportRows,
  downloadBlobFile,
  downloadTextFile,
  transactionsToCsv,
  transactionsToJson,
  type ExportFormat,
} from '../../utils/exporters/csv';

interface ExportTransactionsModalProps {
  open: boolean;
  transactions: Transaction[];
  filters: { startDate: string; endDate: string; category: string; search: string };
  budget?: Budget | null;
  categoryResolver: CategoryResolver;
  onClose: () => void;
}

export function ExportTransactionsModal({
  open,
  transactions,
  filters,
  budget,
  categoryResolver,
  onClose,
}: ExportTransactionsModalProps) {
  const [includeNote, setIncludeNote] = useState(true);
  const [includePaymentMethod, setIncludePaymentMethod] = useState(true);
  const [includeCategory, setIncludeCategory] = useState(true);
  const [signedAmounts, setSignedAmounts] = useState(true);
  const [includeBudgetStats, setIncludeBudgetStats] = useState(false);
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [downloading, setDownloading] = useState(false);

  const countLabel = useMemo(() => (transactions.length === 1 ? 'movimiento' : 'movimientos'), [transactions.length]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, open]);

  if (!open) return null;

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    const exportOptions = {
      includeNote,
      includePaymentMethod,
      includeCategory,
      signedAmounts,
      includeBudgetStats,
    };
    const budgetContext = { perCategory: budget?.perCategory };
    const start = filters.startDate || 'inicio';
    const end = filters.endDate || 'fin';
    const baseFilename = `gastosense_movimientos_${start}_a_${end}`;

    try {
      if (format === 'csv') {
        const csvContent = transactionsToCsv(transactions, categoryResolver, exportOptions, budgetContext);
        downloadTextFile(`${baseFilename}.csv`, csvContent);
      } else if (format === 'json') {
        const jsonContent = transactionsToJson(transactions, categoryResolver, exportOptions, budgetContext);
        downloadTextFile(`${baseFilename}.json`, jsonContent, 'application/json;charset=utf-8');
      } else {
        const XLSX = await import('xlsx');
        const rows = buildExportRows(transactions, categoryResolver, exportOptions, budgetContext);
        const columns = buildExportColumns(exportOptions);
        const worksheet = XLSX.utils.json_to_sheet(rows, { header: columns });
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Movimientos');
        const data = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([data], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        downloadBlobFile(`${baseFilename}.xlsx`, blob);
      }
      setDownloading(false);
      onClose();
    } catch (err) {
      console.error('No pudimos exportar movimientos', err);
      setDownloading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-3"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-[var(--modal-border)] bg-[var(--modal-surface)] p-4 text-[var(--text)] shadow-2xl backdrop-blur"
        role="dialog"
        aria-modal="true"
        aria-label="Exportar movimientos"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-[var(--text)]">Exportar movimientos</h3>
            <p className="text-sm text-[var(--text-muted)]">
              Se exportar&aacute;n {transactions.length} {countLabel} seg&uacute;n tus filtros actuales.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-semibold text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            Cerrar
          </button>
        </div>

        <div className="space-y-3">
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card-surface)] p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Formato</p>
            <div className="mt-2 space-y-2 text-sm">
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="export-format"
                  checked={format === 'csv'}
                  onChange={() => setFormat('csv')}
                  className="mt-1 accent-emerald-400"
                />
                <span>
                  <span className="font-semibold text-[var(--text)]">CSV (recomendado)</span>{' '}
                  <span className="text-[var(--text-muted)]">(Compatible con Excel/Google Sheets)</span>
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="export-format"
                  checked={format === 'xlsx'}
                  onChange={() => setFormat('xlsx')}
                  className="mt-1 accent-emerald-400"
                />
                <span>
                  <span className="font-semibold text-[var(--text)]">Excel (.xlsx)</span>{' '}
                  <span className="text-[var(--text-muted)]">(Mejor formato: tablas y anchos)</span>
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="export-format"
                  checked={format === 'json'}
                  onChange={() => setFormat('json')}
                  className="mt-1 accent-emerald-400"
                />
                <span>
                  <span className="font-semibold text-[var(--text)]">JSON</span>{' '}
                  <span className="text-[var(--text-muted)]">(Backup / soporte)</span>
                </span>
              </label>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card-surface)] p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Opciones</p>
            <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={includeNote}
                  onChange={(event) => setIncludeNote(event.target.checked)}
                  className="accent-emerald-400"
                />
                <span>Incluir nota</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={includePaymentMethod}
                  onChange={(event) => setIncludePaymentMethod(event.target.checked)}
                  className="accent-emerald-400"
                />
                <span>Incluir m&eacute;todo de pago</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={includeCategory}
                  onChange={(event) => setIncludeCategory(event.target.checked)}
                  className="accent-emerald-400"
                />
                <span>Incluir categor&iacute;a</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={signedAmounts}
                  onChange={(event) => setSignedAmounts(event.target.checked)}
                  className="accent-emerald-400"
                />
                <span>Montos con signo</span>
              </label>
              <label className="flex items-center gap-2 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={includeBudgetStats}
                  onChange={(event) => setIncludeBudgetStats(event.target.checked)}
                  className="accent-emerald-400"
                />
                <span>Incluir presupuesto y % usado (seg&uacute;n este rango)</span>
              </label>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={downloading}
            className="rounded-xl border border-[var(--card-border)] bg-[var(--input-bg)] px-4 py-2 text-sm font-semibold text-[var(--text)] hover:border-primary disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-700 disabled:opacity-60"
          >
            {downloading ? 'Generando...' : 'Descargar'}
          </button>
        </div>
      </div>
    </div>
  );
}
