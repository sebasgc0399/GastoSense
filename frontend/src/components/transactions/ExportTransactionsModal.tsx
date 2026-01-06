import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { Upload } from 'lucide-react';
import { useConfirm } from '../../hooks/useConfirm';
import type { TransactionsFilters } from '../../hooks/useTransactionsController';
import { callImportTransactions } from '../../services/functions';
import type { Budget, Category, Transaction } from '../../types';
import { normalizeCategoryLabel, type CategoryResolver } from '../../utils/categoryResolver';
import {
  buildExportColumns,
  buildExportRows,
  downloadBlobFile,
  downloadTextFile,
  transactionsToCsv,
  transactionsToJson,
  type ExportFormat,
} from '../../utils/exporters/csv';
import { parseTransactionsFile, type ImportReport } from '../../utils/importers/transactionsImport';

type PeriodPreset = 'month' | 'last30' | 'last90' | 'last365' | 'custom';
type ImportMode = 'append' | 'replace_range';

type PresetRanges = {
  month: { startDate: string; endDate: string; label: string };
  last30: { startDate: string; endDate: string; label: string };
  last90: { startDate: string; endDate: string; label: string };
  last365: { startDate: string; endDate: string; label: string };
};

const MONTH_LABELS = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

const pad = (value: number) => String(value).padStart(2, '0');

const toIsoDate = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const addDays = (date: Date, days: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

const FALLBACK_TEMPLATE_EXPENSE_CATEGORIES = [
  'Comida',
  'Transporte',
  'Hogar',
  'Salud',
  'Educacion',
  'Entretenimiento',
  'Servicios',
];

const FALLBACK_TEMPLATE_INCOME_CATEGORIES = [
  'Ingreso',
  'Salario',
  'Inversion',
  'Recompensa',
  'Regalos',
  'Negocio',
];

const resolveCategoryKind = (value?: Category['kind']) => (value === 'income' ? 'income' : 'expense');

const buildTemplateCategories = (resolver?: CategoryResolver, budget?: Budget | null) => {
  const expenseLabels: string[] = [];
  const incomeLabels: string[] = [];
  const categories = resolver ? Object.values(resolver.categoriesById) : [];
  for (const category of categories) {
    if (category.isArchived) continue;
    const trimmed = category.label?.trim();
    if (!trimmed) continue;
    if (resolveCategoryKind(category.kind) === 'income') {
      incomeLabels.push(trimmed);
    } else {
      expenseLabels.push(trimmed);
    }
  }

  if (!expenseLabels.length && budget?.perCategory && resolver) {
    Object.keys(budget.perCategory).forEach((categoryId) => {
      const label = resolver.categoriesById[categoryId]?.label?.trim();
      if (label) expenseLabels.push(label);
    });
  }

  if (!expenseLabels.length) {
    expenseLabels.push(...FALLBACK_TEMPLATE_EXPENSE_CATEGORIES);
  }

  if (!incomeLabels.length) {
    incomeLabels.push(...FALLBACK_TEMPLATE_INCOME_CATEGORIES);
  }

  const dedupeAndSort = (labels: string[], fallbackLabels: string[]) => {
    const normalizedSet = new Set<string>();
    const deduped: string[] = [];
    const pushLabel = (value: string) => {
      const normalized = normalizeCategoryLabel(value);
      if (!normalized || normalizedSet.has(normalized)) return;
      normalizedSet.add(normalized);
      deduped.push(value);
    };
    labels.forEach(pushLabel);
    fallbackLabels.forEach(pushLabel);
    return deduped.sort((a, b) => a.localeCompare(b, 'es-CO'));
  };

  return {
    expense: dedupeAndSort(expenseLabels, ['Otros']),
    income: dedupeAndSort(incomeLabels, ['Ingreso']),
  };
};

const parseIsoDate = (value: string): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
};

const getRangeDays = (from?: string, to?: string): number | null => {
  if (!from || !to) return null;
  const fromDate = parseIsoDate(from);
  const toDate = parseIsoDate(to);
  if (!fromDate || !toDate) return null;
  const diffMs = toDate.getTime() - fromDate.getTime();
  if (diffMs < 0) return null;
  return Math.floor(diffMs / 86400000) + 1;
};

const detectPreset = (filters: TransactionsFilters, ranges: PresetRanges): PeriodPreset => {
  if (filters.startDate === ranges.month.startDate && filters.endDate === ranges.month.endDate) return 'month';
  if (filters.startDate === ranges.last30.startDate && filters.endDate === ranges.last30.endDate) return 'last30';
  if (filters.startDate === ranges.last90.startDate && filters.endDate === ranges.last90.endDate) return 'last90';
  if (filters.startDate === ranges.last365.startDate && filters.endDate === ranges.last365.endDate) return 'last365';
  return 'custom';
};

const TEMPLATE_ROWS = [
  {
    fecha: '2025-01-10',
    tipo: 'gasto',
    categoria: 'Transporte',
    nota: 'Taxi',
    monto: 18000,
    metodo_pago: 'debito',
  },
  {
    fecha: '2025-01-15',
    tipo: 'ingreso',
    categoria: 'Ingreso',
    nota: 'Salario',
    monto: 1500000,
    metodo_pago: 'digital',
  },
];

interface ExportTransactionsModalProps {
  open: boolean;
  transactions: Transaction[];
  filters: TransactionsFilters;
  budget?: Budget | null;
  categoryResolver: CategoryResolver;
  onChangeFilters: (next: TransactionsFilters) => void;
  onImportSuccess?: (message: string) => void;
  onClose: () => void;
}

export function ExportTransactionsModal({
  open,
  transactions,
  filters,
  budget,
  categoryResolver,
  onChangeFilters,
  onImportSuccess,
  onClose,
}: ExportTransactionsModalProps) {
  const confirm = useConfirm();
  const [includeNote, setIncludeNote] = useState(true);
  const [includePaymentMethod, setIncludePaymentMethod] = useState(true);
  const [includeCategory, setIncludeCategory] = useState(true);
  const [signedAmounts, setSignedAmounts] = useState(true);
  const [includeBudgetStats, setIncludeBudgetStats] = useState(false);
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [downloading, setDownloading] = useState(false);
  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export');
  const [presetRanges, setPresetRanges] = useState<PresetRanges | null>(null);
  const [forceCustomPeriod, setForceCustomPeriod] = useState(false);
  const [importMode, setImportMode] = useState<ImportMode>('append');
  const [importFileName, setImportFileName] = useState('');
  const [importParsing, setImportParsing] = useState(false);
  const [importReport, setImportReport] = useState<ImportReport | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const maxImportRows = 1000;
  const exceedsMaxRows = Boolean(importReport && importReport.total > maxImportRows);

  const countLabel = useMemo(() => (transactions.length === 1 ? 'movimiento' : 'movimientos'), [transactions.length]);
  const replaceRangeDays = useMemo(
    () => getRangeDays(importReport?.rangeFrom, importReport?.rangeTo),
    [importReport?.rangeFrom, importReport?.rangeTo],
  );
  const isLargeRange = Boolean(replaceRangeDays && replaceRangeDays > 180);
  const detectedPreset = useMemo(
    () => (presetRanges ? detectPreset(filters, presetRanges) : 'custom'),
    [filters, presetRanges],
  );
  const periodPreset = forceCustomPeriod ? 'custom' : detectedPreset;

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, open]);

  useEffect(() => {
    if (!open) return;
    setActiveTab('export');
    setForceCustomPeriod(false);
    setImportMode('append');
    setImportFileName('');
    setImportReport(null);
    setImportError(null);
    setImportParsing(false);
    setImporting(false);
    setImportProgress(null);
    setShowAdvanced(false);
    const now = new Date();
    const todayIso = toIsoDate(now);
    const monthLabel = MONTH_LABELS[now.getMonth()] ?? 'Mes actual';
    const ranges: PresetRanges = {
      month: {
        startDate: toIsoDate(new Date(now.getFullYear(), now.getMonth(), 1)),
        endDate: todayIso,
        label: `Mes actual (${monthLabel})`,
      },
      last30: {
        startDate: toIsoDate(addDays(now, -29)),
        endDate: todayIso,
        label: 'Ultimos 30 dias',
      },
      last90: {
        startDate: toIsoDate(addDays(now, -89)),
        endDate: todayIso,
        label: 'Ultimos 90 dias',
      },
      last365: {
        startDate: toIsoDate(addDays(now, -364)),
        endDate: todayIso,
        label: 'Ultimos 365 dias',
      },
    };
    setPresetRanges(ranges);
  }, [open]);

  useEffect(() => {
    if (importMode !== 'replace_range') return;
    if (!importReport) return;
    if (!importReport.rangeFrom || !importReport.rangeTo || importReport.invalid > 0) {
      setImportMode('append');
    }
  }, [importMode, importReport]);

  if (!open) return null;

  const updateFilters = (next: Partial<TransactionsFilters>) => {
    onChangeFilters({ ...filters, ...next });
  };

  const handlePresetSelect = (preset: PeriodPreset) => {
    if (!presetRanges) {
      setForceCustomPeriod(preset === 'custom');
      return;
    }
    setForceCustomPeriod(preset === 'custom');
    if (preset === 'custom') return;
    const range =
      preset === 'month'
        ? presetRanges.month
        : preset === 'last30'
          ? presetRanges.last30
          : preset === 'last90'
            ? presetRanges.last90
            : presetRanges.last365;
    updateFilters({ startDate: range.startDate, endDate: range.endDate });
  };

  const handleCustomDateChange = (field: 'startDate' | 'endDate') => (value: string) => {
    setForceCustomPeriod(true);
    updateFilters({ [field]: value } as Partial<TransactionsFilters>);
  };

  const handleDownloadTemplate = async () => {
    const columns = buildExportColumns({ includeBudgetStats: false });
    const rows = TEMPLATE_ROWS.map((row) => {
      const entry: Record<string, string | number> = {};
      columns.forEach((column) => {
        entry[column] = row[column as keyof typeof row] ?? '';
      });
      return entry;
    });
    const baseFilename = 'gastosense_plantilla_movimientos';

    const XLSX = await import('xlsx');
    const worksheet = XLSX.utils.json_to_sheet(rows, { header: columns });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Plantilla');
    const tipos = ['gasto', 'ingreso'];
    const metodosPago = ['efectivo', 'debito', 'credito', 'digital', 'otro'];
    const categorias = buildTemplateCategories(categoryResolver, budget);
    const rowCount = Math.max(tipos.length, metodosPago.length, categorias.expense.length, categorias.income.length);
    const maestrosAoA: Array<Array<string>> = [
      ['GUIA DE REFERENCIA PARA IMPORTACION'],
      [],
      ['TIPOS', '', 'METODOS DE PAGO', '', 'CATEGORIAS GASTOS', '', 'CATEGORIAS INGRESOS'],
    ];
    for (let i = 0; i < rowCount; i += 1) {
      maestrosAoA.push([
        tipos[i] ?? '',
        '',
        metodosPago[i] ?? '',
        '',
        categorias.expense[i] ?? '',
        '',
        categorias.income[i] ?? '',
      ]);
    }
    maestrosAoA.push([]);
    maestrosAoA.push(['NOTAS IMPORTANTES']);
    maestrosAoA.push(['- Solo se importara la hoja Plantilla. La hoja Maestros es de ayuda.']);
    maestrosAoA.push([
      '- Si escribes una categoria que no esta en tu lista, se importara como: Gasto -> "Otros", Ingreso -> "Ingreso", y se guardara [Cat: X] en la nota.',
    ]);
    const maestrosWs = XLSX.utils.aoa_to_sheet(maestrosAoA);
    maestrosWs['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }];
    maestrosWs['!cols'] = [
      { wch: 18 },
      { wch: 4 },
      { wch: 18 },
      { wch: 4 },
      { wch: 28 },
      { wch: 4 },
      { wch: 28 },
    ];
    XLSX.utils.book_append_sheet(workbook, maestrosWs, 'Maestros');
    const data = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    downloadBlobFile(`${baseFilename}.xlsx`, blob);
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const lowered = file.name.toLowerCase();
    const isCsv = lowered.endsWith('.csv');
    const isXlsx = lowered.endsWith('.xlsx');
    setImportFileName(file.name);
    setImportError(null);
    setImportReport(null);
    if (!isCsv && !isXlsx) {
      setImportError('Solo Excel (.xlsx) o CSV por ahora.');
      setImportProgress(null);
      event.target.value = '';
      return;
    }
    setImportParsing(true);
    setImportProgress('Analizando archivo...');
    try {
      const report = await parseTransactionsFile(file);
      setImportReport(report);
      setImportProgress(null);
    } catch (err) {
      console.error('Import parse failed', err);
      const message = (err as Error)?.message || 'No se pudo leer el archivo.';
      setImportError(message);
      setImportProgress(null);
    } finally {
      setImportParsing(false);
      event.target.value = '';
    }
  };

  const hasInvalidRows = Boolean(importReport && importReport.invalid > 0);
  const canEnableReplaceRange = Boolean(importReport?.rangeFrom && importReport?.rangeTo) && !hasInvalidRows;
  const replaceRangeDisableReason = !importReport
    ? 'Sube un archivo para detectar el rango.'
    : !importReport.rangeFrom || !importReport.rangeTo
      ? 'Necesitamos rango detectado para reemplazar.'
      : hasInvalidRows
        ? 'Corrige las filas invalidas antes de reemplazar.'
        : '';
  const canImport =
    Boolean(importReport && importReport.valid > 0) &&
    !exceedsMaxRows &&
    !importParsing &&
    !importing &&
    (importMode !== 'replace_range' || (canEnableReplaceRange && Boolean(importReport?.rangeFrom)));
  const isBusy = downloading || importing || importParsing;

  const handleImport = async () => {
    if (!importReport || importReport.valid === 0 || importing) return;
    if (importMode === 'replace_range') {
      if (!importReport.rangeFrom || !importReport.rangeTo) {
        setImportError('No pudimos detectar el rango del archivo.');
        return;
      }
      if (importReport.invalid > 0) {
        setImportError('Corrige las filas invalidas antes de reemplazar.');
        return;
      }
      const rangeLabel = `${importReport.rangeFrom} a ${importReport.rangeTo}`;
      const confirmed = await confirm({
        title: 'Reemplazar rango',
        description:
          `Vas a reemplazar movimientos del ${rangeLabel}. Esto puede borrar movimientos que no esten en el archivo.`,
        confirmText: 'Si, reemplazar rango',
        cancelText: 'Cancelar',
      });
      if (!confirmed) return;
    }
    setImportError(null);
    setImporting(true);
    setImportProgress('Importando...');
    try {
      const payload = {
        mode: importMode,
        rows: importReport.rows,
        rangeFrom: importReport.rangeFrom,
        rangeTo: importReport.rangeTo,
      };
      const response = await callImportTransactions(payload);
      const data = response.data as {
        inserted?: number;
        skipped?: number;
        errorsCount?: number;
        rangeFrom?: string;
        rangeTo?: string;
      };
      const inserted = Number(data.inserted ?? importReport.valid);
      const skipped = Number(data.skipped ?? data.errorsCount ?? 0);
      const message =
        skipped > 0
          ? `Importados ${inserted} movimientos. ${skipped} omitidos.`
          : `Importados ${inserted} movimientos.`;
      onImportSuccess?.(message);
      setImporting(false);
      setImportProgress(null);
      onClose();
    } catch (err) {
      console.error('Import failed', err);
      setImporting(false);
      setImportProgress(null);
      setImportError('No se pudo importar el archivo.');
    }
  };

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
      className="fixed inset-0 z-50 flex items-center justify-center modal-scrim backdrop-blur-sm p-3"
      onClick={onClose}
    >
      <div
        className="modal-surface flex max-h-[90svh] w-full max-w-lg flex-col overflow-hidden rounded-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Administrar datos"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="shrink-0 p-4">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-[var(--text)]">Administrar datos</h3>
              <p className="text-sm text-[var(--text-muted)]">Exporta o importa movimientos seg&uacute;n tu periodo.</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-ghost btn-compact text-xs"
            >
              Cerrar
            </button>
          </div>

          <div
            className="flex rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-1 text-xs font-semibold text-[var(--text-muted)]"
            role="tablist"
            aria-label="Administrar datos"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'export'}
              onClick={() => setActiveTab('export')}
              className={`flex-1 rounded-lg px-3 py-2 transition ${
                activeTab === 'export'
                  ? 'bg-[var(--overlay-10)] text-[var(--text)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)]'
              }`}
            >
              Exportar
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'import'}
              onClick={() => setActiveTab('import')}
              className={`flex-1 rounded-lg px-3 py-2 transition ${
                activeTab === 'import'
                  ? 'bg-[var(--overlay-10)] text-[var(--text)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)]'
              }`}
            >
              Importar
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4">
          {activeTab === 'export' ? (
            <div className="space-y-3">
              <div className="panel-card">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Periodo</p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  Se exportaran {transactions.length} {countLabel} seg&uacute;n este rango.
                </p>
                <div className="mt-3 rounded-lg border border-[var(--card-border)] bg-[var(--input-bg)] px-3 py-2">
                  <p className="text-sm font-semibold text-[var(--text)]">
                    {(filters.startDate || 'inicio') + ' a ' + (filters.endDate || 'hoy')}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {transactions.length} {countLabel}
                  </p>
                </div>
                <div className="mt-3 grid gap-2 text-sm">
                  <label className="surface-input flex items-center gap-2">
                    <input
                      type="radio"
                      name="export-period"
                      checked={periodPreset === 'month'}
                      onChange={() => handlePresetSelect('month')}
                      className="accent-[var(--success-border)]"
                    />
                    <span>{presetRanges?.month.label ?? 'Mes actual'}</span>
                  </label>
                  <label className="surface-input flex items-center gap-2">
                    <input
                      type="radio"
                      name="export-period"
                      checked={periodPreset === 'last30'}
                      onChange={() => handlePresetSelect('last30')}
                      className="accent-[var(--success-border)]"
                    />
                    <span>{presetRanges?.last30.label ?? 'Ultimos 30 dias'}</span>
                  </label>
                  <label className="surface-input flex items-center gap-2">
                    <input
                      type="radio"
                      name="export-period"
                      checked={periodPreset === 'last90'}
                      onChange={() => handlePresetSelect('last90')}
                      className="accent-[var(--success-border)]"
                    />
                    <span>{presetRanges?.last90.label ?? 'Ultimos 90 dias'}</span>
                  </label>
                  <label className="surface-input flex items-center gap-2">
                    <input
                      type="radio"
                      name="export-period"
                      checked={periodPreset === 'last365'}
                      onChange={() => handlePresetSelect('last365')}
                      className="accent-[var(--success-border)]"
                    />
                    <span>{presetRanges?.last365.label ?? 'Ultimos 365 dias'}</span>
                  </label>
                  <label className="surface-input flex items-center gap-2">
                    <input
                      type="radio"
                      name="export-period"
                      checked={periodPreset === 'custom'}
                      onChange={() => handlePresetSelect('custom')}
                      className="accent-[var(--success-border)]"
                    />
                    <span>Personalizado</span>
                  </label>
                </div>
                {periodPreset === 'custom' && (
                  <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                    <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
                      Desde
                      <input
                        type="date"
                        value={filters.startDate}
                        onChange={(event) => handleCustomDateChange('startDate')(event.target.value)}
                        className="rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text)]"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
                      Hasta
                      <input
                        type="date"
                        value={filters.endDate}
                        onChange={(event) => handleCustomDateChange('endDate')(event.target.value)}
                        className="rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text)]"
                      />
                    </label>
                  </div>
                )}
              </div>

              <div className="panel-card">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Formato</p>
                <div className="mt-2 space-y-2 text-sm">
                  <label className="flex items-start gap-2">
                    <input
                      type="radio"
                      name="export-format"
                      checked={format === 'csv'}
                      onChange={() => setFormat('csv')}
                      className="mt-1 accent-[var(--success-border)]"
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
                      className="mt-1 accent-[var(--success-border)]"
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
                      className="mt-1 accent-[var(--success-border)]"
                    />
                    <span>
                      <span className="font-semibold text-[var(--text)]">JSON</span>{' '}
                      <span className="text-[var(--text-muted)]">(Backup / soporte)</span>
                    </span>
                  </label>
                </div>
              </div>

              <div className="panel-card">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Opciones</p>
                <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={includeNote}
                      onChange={(event) => setIncludeNote(event.target.checked)}
                      className="accent-[var(--success-border)]"
                    />
                    <span>Incluir nota</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={includePaymentMethod}
                      onChange={(event) => setIncludePaymentMethod(event.target.checked)}
                      className="accent-[var(--success-border)]"
                    />
                    <span>Incluir m&eacute;todo de pago</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={includeCategory}
                      onChange={(event) => setIncludeCategory(event.target.checked)}
                      className="accent-[var(--success-border)]"
                    />
                    <span>Incluir categor&iacute;a</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={signedAmounts}
                      onChange={(event) => setSignedAmounts(event.target.checked)}
                      className="accent-[var(--success-border)]"
                    />
                    <span>Montos con signo</span>
                  </label>
                  <label className="flex items-center gap-2 sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={includeBudgetStats}
                      onChange={(event) => setIncludeBudgetStats(event.target.checked)}
                      className="accent-[var(--success-border)]"
                    />
                    <span>Incluir presupuesto y % usado (seg&uacute;n este rango)</span>
                  </label>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="panel-card">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Como funciona</p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-[var(--text-muted)]">
                  <li>Importa archivos Excel (.xlsx) exportados por GastoSense.</li>
                  <li>Revisa el preview y corrige errores antes de importar.</li>
                  <li>Maximo 1000 movimientos por importacion.</li>
                </ul>
                <p className="mt-2 text-xs text-[var(--text-muted)]">Tambien puedes subir CSV.</p>
              </div>

              <div className="panel-card">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Plantilla</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadTemplate}
                    className="btn btn-secondary btn-compact"
                  >
                    Descargar plantilla (Excel)
                  </button>
                </div>
              </div>

              <div className="panel-card">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  Como preparar tu archivo
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-[var(--text-muted)]">
                  <li>Descarga la plantilla y abrela en Excel o Google Sheets.</li>
                  <li>Llena una fila por movimiento con: fecha, tipo, categoria, nota, monto, metodo_pago.</li>
                  <li>Guarda en .xlsx (o CSV si prefieres) y sube el archivo.</li>
                  <li>Solo se importara la hoja Plantilla. La hoja Maestros es de ayuda.</li>
                  <li>Si Excel muestra un aviso de perdida de datos al guardar CSV, acepta.</li>
                </ul>
                <div className="surface-input mt-3 text-xs text-[var(--text-muted)]">
                  <p className="font-semibold text-[var(--text)]">Reglas rapidas</p>
                  <p>Fecha: YYYY-MM-DD o DD/MM/YYYY.</p>
                  <p>Tipo: gasto o ingreso.</p>
                  <p>Monto: positivo o negativo; se usa valor absoluto.</p>
                  <p>Metodo de pago: efectivo/debito/credito/digital/otro.</p>
                </div>
              </div>

              <div className="panel-card">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Archivo</p>
                <label className="mt-2 flex cursor-pointer items-center justify-between rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text)] hover:border-primary">
                  <span className="text-xs font-semibold">Seleccionar archivo</span>
                  <input
                    type="file"
                    accept=".xlsx,.csv"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  <Upload className="h-4 w-4 text-[var(--text-muted)]" />
                </label>
                {importFileName && (
                  <p className="mt-2 text-xs text-[var(--text-muted)]">Archivo: {importFileName}</p>
                )}
                {importProgress && <p className="mt-2 text-xs text-[var(--text-muted)]">{importProgress}</p>}
                {importError && <p className="mt-2 text-xs text-[var(--error-text)]">{importError}</p>}
              </div>

              {importReport && (
                <div className="panel-card">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Preview</p>
                  <div className="mt-2 text-sm text-[var(--text)]">
                    Filas: {importReport.total} | Validas: {importReport.valid} | Invalidas: {importReport.invalid}
                  </div>
                  {exceedsMaxRows && (
                    <p className="mt-1 text-xs text-[var(--error-text)]">
                      El archivo supera el maximo de {maxImportRows} movimientos.
                    </p>
                  )}
                  {importReport.rangeFrom && importReport.rangeTo && (
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      Rango detectado: {importReport.rangeFrom} a {importReport.rangeTo}
                    </p>
                  )}
                  {importMode === 'replace_range' && hasInvalidRows && (
                    <p className="mt-1 text-xs text-[var(--error-text)]">
                      Corrige las filas invalidas antes de usar evitar duplicados.
                    </p>
                  )}
                  {importReport.errors.length > 0 && (
                    <div className="surface-input mt-3 text-xs text-[var(--text-muted)]">
                      <p className="font-semibold text-[var(--text)]">Errores</p>
                      <ul className="mt-1 space-y-1">
                        {importReport.errors.slice(0, 5).map((error, index) => (
                          <li key={`${error.row}-${index}`}>
                            Fila {error.row}: {error.message}
                          </li>
                        ))}
                      </ul>
                      {importReport.errors.length > 5 && (
                        <p className="mt-1 text-[var(--text-muted)]">
                          +{importReport.errors.length - 5} errores mas
                        </p>
                      )}
                    </div>
                  )}
                  {importReport.preview.length > 0 && (
                    <div className="mt-3 overflow-hidden rounded-lg border border-[var(--card-border)]">
                      <table className="w-full text-left text-xs text-[var(--text-muted)]">
                        <thead className="bg-[var(--input-bg)] text-[10px] uppercase tracking-wide text-[var(--text)]">
                          <tr>
                            <th className="px-2 py-2">Fecha</th>
                            <th className="px-2 py-2">Tipo</th>
                            <th className="px-2 py-2">Categoria</th>
                            <th className="px-2 py-2">Monto</th>
                          </tr>
                        </thead>
                        <tbody>
                          {importReport.preview.map((row, index) => (
                            <tr key={`${row.date}-${index}`} className="border-t surface-divider">
                              <td className="px-2 py-2">{row.date}</td>
                              <td className="px-2 py-2">{row.type}</td>
                              <td className="px-2 py-2">{row.category || '-'}</td>
                              <td className="px-2 py-2">{row.amount}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              <div className="panel-card">
                <button
                  type="button"
                  onClick={() => setShowAdvanced((prev) => !prev)}
                  className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]"
                  aria-expanded={showAdvanced}
                >
                  <span>Opciones avanzadas</span>
                  <span className="text-[var(--text-muted)]">{showAdvanced ? 'Ocultar' : 'Mostrar'}</span>
                </button>
                {!showAdvanced && importMode === 'replace_range' && (
                  <p className="mt-2 text-xs text-[var(--warn-text)]">Reemplazar rango detectado activo.</p>
                )}
                {showAdvanced && (
                  <div className="mt-3 space-y-2 text-sm">
                    <label className={`flex items-start gap-2 ${!canEnableReplaceRange ? 'opacity-60' : ''}`}>
                      <input
                        type="checkbox"
                        checked={importMode === 'replace_range'}
                        onChange={(event) => setImportMode(event.target.checked ? 'replace_range' : 'append')}
                        disabled={!canEnableReplaceRange}
                        className="mt-1 accent-[var(--success-border)]"
                      />
                      <span>
                        <span className="font-semibold text-[var(--text)]">Evitar duplicados</span>
                        <span className="block text-xs text-[var(--text-muted)]">Reemplazar rango detectado</span>
                      </span>
                    </label>
                    {!canEnableReplaceRange && (
                      <p className="text-xs text-[var(--text-muted)]">{replaceRangeDisableReason}</p>
                    )}
                    {importMode === 'replace_range' && (
                      <div className="rounded-lg border state-warn px-3 py-2 text-xs">
                        <p className="font-semibold">Reemplazar rango detectado</p>
                        <p>
                          Se borraran TODOS los movimientos dentro del rango antes de importar. Usa esto solo si tu
                          archivo contiene todo lo que quieres conservar en ese rango.
                        </p>
                        <p className="mt-1">
                          Rango:{' '}
                          {importReport?.rangeFrom && importReport?.rangeTo
                            ? `${importReport.rangeFrom} a ${importReport.rangeTo}`
                            : 'No detectado'}
                        </p>
                        {isLargeRange && replaceRangeDays && (
                          <p className="mt-1">Tu rango es muy grande ({replaceRangeDays} dias). Revisa fechas.</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="shrink-0 border-t surface-divider bg-[var(--modal-surface)] px-4 pb-4 pt-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isBusy}
              className="btn btn-secondary"
            >
              Cancelar
            </button>
            {activeTab === 'export' ? (
              <button
                type="button"
                onClick={handleDownload}
                disabled={downloading}
                className="btn btn-primary"
              >
                {downloading ? 'Generando...' : 'Descargar'}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleImport}
                disabled={!canImport}
                className="btn btn-primary"
              >
                {importing ? 'Importando...' : 'Importar'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

