import { useRef } from 'react';
import ReactECharts from 'echarts-for-react';
import type { BarSeriesOption, EChartsOption } from 'echarts';
import { createCssVarReader } from '../../utils/cssVars';

export type CategorySpendMode = 'spent' | 'budget';

export type CategorySpendItem = {
  categoryId: string;
  label: string;
  spent: number;
  budget?: number; // undefined => "Sin presupuesto"
  fallbackId?: string;
};

export type CategorySpendChartProps = {
  title?: string;
  subtitle?: string;
  items: CategorySpendItem[]; // pre-ordered desc by spent
  mode: CategorySpendMode;
  limit?: number;
  currency?: 'COP';
  showFallbackId?: boolean;
  valueLabel?: string;
  onCategoryNavigate?: (categoryId: string) => void;
  enableCategoryNavigate?: boolean;
};

const fmtCOP = (value: number) => `$${Math.round(value).toLocaleString('es-CO')}`;

const BAR_RADIUS = 10;
const BAR_HEIGHT = 14;

const hashCategoryId = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
};
const stableCategoryColor = (categoryId: string, palette: readonly string[]) =>
  palette[hashCategoryId(categoryId) % palette.length];

const formatCategoryLabel = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return value;
  const lower = trimmed.toLocaleLowerCase('es-CO');
  return lower.charAt(0).toLocaleUpperCase('es-CO') + lower.slice(1);
};

type CategoryChartTokens = {
  palette: string[];
  budgetRemaining: string;
  budgetOver: string;
  budgetOk: string;
  budgetWarn: string;
  budgetNoBudget: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
  tooltipMuted: string;
  axisLabel: string;
  barTrack: string;
  barLabel: string;
};

const getCategoryChartTokens = (): CategoryChartTokens => {
  const readVar = createCssVarReader();
  return {
    palette: [
      readVar('--chart-1', '#22C55E'),
      readVar('--chart-2', '#0EA5E9'),
      readVar('--chart-3', '#A78BFA'),
      readVar('--chart-4', '#F59E0B'),
      readVar('--chart-5', '#F97316'),
      readVar('--chart-6', '#14B8A6'),
      readVar('--chart-7', '#EF4444'),
      readVar('--chart-8', '#94A3B8'),
    ],
    budgetRemaining: readVar('--chart-budget-remaining', 'rgba(148,163,184,0.18)'),
    budgetOver: readVar('--chart-budget-over', '#EF4444'),
    budgetOk: readVar('--chart-budget-ok', '#14B8A6'),
    budgetWarn: readVar('--chart-budget-warn', '#F59E0B'),
    budgetNoBudget: readVar('--chart-budget-no-budget', '#0EA5E9'),
    tooltipBg: readVar('--chart-tooltip-bg', 'rgba(0,0,0,0.55)'),
    tooltipBorder: readVar('--chart-tooltip-border', 'rgba(255,255,255,0.12)'),
    tooltipText: readVar('--chart-tooltip-text', '#fff'),
    tooltipMuted: readVar('--chart-tooltip-muted', '#94A3B8'),
    axisLabel: readVar('--chart-axis-strong', 'rgba(255,255,255,0.82)'),
    barTrack: readVar('--chart-track', 'rgba(255,255,255,0.05)'),
    barLabel: readVar('--chart-label', 'rgba(255,255,255,0.75)'),
  };
};

const pctColor = (pct: number, tokens: CategoryChartTokens) => {
  if (pct > 100) return tokens.budgetOver;
  if (pct >= 80) return tokens.budgetWarn;
  return tokens.budgetOk;
};

const tooltipShell = (inner: string) => `
  <div style="display:flex;flex-direction:column;gap:4px;">
    ${inner}
  </div>
`;

type BudgetMeta = {
  hasBudget: boolean;
  budgetValue: number;
  spentWithin: number;
  over: number;
};

const getBudgetMeta = (item: CategorySpendItem): BudgetMeta => {
  const hasBudget = typeof item.budget === 'number' && Number.isFinite(item.budget) && item.budget > 0;
  const budgetValue = hasBudget ? (item.budget as number) : 0;
  const spentWithin = hasBudget ? Math.min(item.spent, budgetValue) : item.spent;
  const over = hasBudget ? Math.max(item.spent - budgetValue, 0) : 0;
  return { hasBudget, budgetValue, spentWithin, over };
};

export function CategorySpendChart({
  title,
  subtitle,
  items,
  mode,
  limit,
  showFallbackId = false,
  valueLabel = 'Gastado',
  onCategoryNavigate,
  enableCategoryNavigate = true,
}: CategorySpendChartProps) {
  const lastTapRef = useRef<{ id: string; at: number } | null>(null);
  const canNavigate = Boolean(enableCategoryNavigate && onCategoryNavigate);
  const visibleItems = limit ? items.slice(0, limit) : items;
  const showValueLabels = Boolean(limit);
  const chartTokens = getCategoryChartTokens();

  if (!visibleItems.length) {
    return <p className="text-sm text-[var(--text-muted)]">Aún no hay categorías para mostrar.</p>;
  }

  const categories = visibleItems.map((i) => formatCategoryLabel(i.label));
  const xMax = Math.max(
    ...visibleItems.map((item) => {
      const meta = getBudgetMeta(item);
      if (mode === 'budget' && meta.hasBudget) return Math.max(meta.budgetValue, item.spent);
      return item.spent;
    }),
    0,
  );

  const spentOnlySeries: BarSeriesOption = {
    name: valueLabel,
    type: 'bar',
    data: visibleItems.map((item) => ({
      value: item.spent,
      itemStyle: { color: stableCategoryColor(item.categoryId, chartTokens.palette), borderRadius: BAR_RADIUS },
    })) as unknown as BarSeriesOption['data'],
    barWidth: BAR_HEIGHT,
    showBackground: true,
    backgroundStyle: { color: chartTokens.barTrack, borderRadius: BAR_RADIUS },
    label: showValueLabels
      ? ({
          show: true,
          position: 'right',
          color: chartTokens.barLabel,
          fontSize: 11,
          fontWeight: 600,
          formatter: (p: { value?: unknown }) => fmtCOP(Number(p.value ?? 0)),
        } as unknown as BarSeriesOption['label'])
      : { show: false },
    emphasis: { focus: 'series' },
  };

  const budgetSpentSeries: BarSeriesOption = {
    name: valueLabel,
    type: 'bar',
    stack: 'budget',
    data: visibleItems.map((item) => {
      const meta = getBudgetMeta(item);
      const remaining = meta.hasBudget ? Math.max(meta.budgetValue - item.spent, 0) : 0;
      const isLast = meta.over <= 0 && remaining <= 0;
      const borderRadius = isLast ? BAR_RADIUS : [BAR_RADIUS, 0, 0, BAR_RADIUS];

      const pct = meta.hasBudget ? Math.round((item.spent / meta.budgetValue) * 100) : null;
      const spentColor =
        !meta.hasBudget ? chartTokens.budgetNoBudget : (pct ?? 0) < 80 ? chartTokens.budgetOk : chartTokens.budgetWarn;
      const label =
        showValueLabels && meta.hasBudget && isLast
          ? ({
              show: true,
              position: 'right',
              color: pctColor(pct ?? 0, chartTokens),
              fontSize: 11,
              fontWeight: 700,
              formatter: () => `${pct ?? 0}%`,
            } as const)
          : ({ show: false } as const);

      const dataItem = { value: meta.spentWithin, itemStyle: { borderRadius, color: spentColor } };
      return showValueLabels ? { ...dataItem, label } : dataItem;
    }) as unknown as BarSeriesOption['data'],
    barWidth: BAR_HEIGHT,
    emphasis: { focus: 'series' },
    z: 3,
  };

  const budgetRemainingSeries: BarSeriesOption = {
    name: 'Restante',
    type: 'bar',
    stack: 'budget',
    data: visibleItems.map((item) => {
      const meta = getBudgetMeta(item);
      const remaining = meta.hasBudget ? Math.max(meta.budgetValue - item.spent, 0) : 0;
      const isLast = meta.over <= 0 && remaining > 0;

      const borderRadius =
        remaining > 0 ? (meta.spentWithin > 0 ? [0, BAR_RADIUS, BAR_RADIUS, 0] : BAR_RADIUS) : 0;

      const pct = meta.hasBudget ? Math.round((item.spent / meta.budgetValue) * 100) : null;
      const label =
        showValueLabels && meta.hasBudget && isLast
          ? ({
              show: true,
              position: 'right',
              color: pctColor(pct ?? 0, chartTokens),
              fontSize: 11,
              fontWeight: 700,
              formatter: () => `${pct ?? 0}%`,
            } as const)
          : ({ show: false } as const);

      return showValueLabels ? { value: remaining, itemStyle: { borderRadius }, label } : { value: remaining, itemStyle: { borderRadius } };
    }) as unknown as BarSeriesOption['data'],
    barWidth: BAR_HEIGHT,
    itemStyle: { color: chartTokens.budgetRemaining },
    z: 2,
  };

  const budgetOverSeries: BarSeriesOption = {
    name: 'Exceso',
    type: 'bar',
    stack: 'budget',
    data: visibleItems.map((item) => {
      const meta = getBudgetMeta(item);
      const borderRadius = meta.over > 0 ? [0, BAR_RADIUS, BAR_RADIUS, 0] : 0;

      const pct = meta.hasBudget ? Math.round((item.spent / meta.budgetValue) * 100) : null;
      const label =
        showValueLabels && meta.hasBudget && meta.over > 0
          ? ({
              show: true,
              position: 'right',
              color: pctColor(pct ?? 0, chartTokens),
              fontSize: 11,
              fontWeight: 700,
              formatter: () => `${pct ?? 0}%`,
            } as const)
          : ({ show: false } as const);

      return showValueLabels ? { value: meta.over, itemStyle: { borderRadius }, label } : { value: meta.over, itemStyle: { borderRadius } };
    }) as unknown as BarSeriesOption['data'],
    barWidth: BAR_HEIGHT,
    itemStyle: { color: chartTokens.budgetOver },
    emphasis: { focus: 'series' },
    z: 4,
  };

  const tooltipFormatter = (params: unknown) => {
    const list = Array.isArray(params) ? params : [params];
    const first = list[0] as { dataIndex?: number } | undefined;
    const idx = first?.dataIndex ?? 0;
    const item = visibleItems[idx];
    if (!item) return '';

    const headerLabel = `<div style="font-weight:700;color:${chartTokens.tooltipText};">${formatCategoryLabel(item.label)}</div>`;
    const fallbackLine =
      showFallbackId && item.fallbackId
        ? `<div style="color:${chartTokens.tooltipMuted};font-size:11px;">${item.fallbackId}</div>`
        : '';
    const header = `${headerLabel}${fallbackLine}`;

    if (mode === 'spent') {
      return tooltipShell(`
        ${header}
        <div style="color:${chartTokens.tooltipMuted};">
          ${valueLabel}: <span style="font-weight:800;color:${chartTokens.tooltipText};">${fmtCOP(item.spent)}</span>
        </div>
      `);
    }

    const meta = getBudgetMeta(item);
    const pct = meta.hasBudget ? Math.round((item.spent / meta.budgetValue) * 100) : null;
    const excess = meta.hasBudget && item.spent > meta.budgetValue ? item.spent - meta.budgetValue : null;

    return tooltipShell(`
      ${header}
      <div style="color:${chartTokens.tooltipMuted};">
        ${valueLabel}: <span style="font-weight:800;color:${chartTokens.tooltipText};">${fmtCOP(item.spent)}</span>
      </div>
      <div style="color:${chartTokens.tooltipMuted};">Presupuesto: ${meta.hasBudget ? fmtCOP(meta.budgetValue) : '\u2014'}</div>
      ${
        pct !== null
          ? `<div style="color:${chartTokens.tooltipMuted};">% usado: <span style="font-weight:700;color:${pctColor(
              pct,
              chartTokens,
            )};">${pct}%</span></div>`
          : ``
      }
      ${excess !== null ? `<div style="color:${chartTokens.budgetOver};font-weight:700;">Exceso: ${fmtCOP(excess)}</div>` : ``}
    `);
  };

  const height = Math.max(limit ? 170 : 240, visibleItems.length * 34 + 56);

  const handleChartClick = (params: { dataIndex?: number }) => {
    if (!canNavigate) return;
    const idx = typeof params?.dataIndex === 'number' ? params.dataIndex : null;
    if (idx === null) return;
    const item = visibleItems[idx];
    if (!item) return;
    const now = Date.now();
    const lastTap = lastTapRef.current;
    if (lastTap && lastTap.id === item.categoryId && now - lastTap.at < 1200) {
      lastTapRef.current = null;
      onCategoryNavigate?.(item.categoryId);
      return;
    }
    lastTapRef.current = { id: item.categoryId, at: now };
  };


  const option: EChartsOption = {
    backgroundColor: 'transparent',
    animation: false,
    grid: { left: 12, right: showValueLabels ? 72 : 18, top: 8, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      confine: true,
      appendToBody: false,
      extraCssText:
        'max-width:240px; white-space:normal; border-radius:12px; padding:10px; box-shadow: var(--shadow-glass); backdrop-filter: blur(var(--glass-blur)); -webkit-backdrop-filter: blur(var(--glass-blur));',
      backgroundColor: chartTokens.tooltipBg,
      borderColor: chartTokens.tooltipBorder,
      borderWidth: 1,
      textStyle: { color: chartTokens.tooltipText, fontSize: 12 },
      formatter: tooltipFormatter as unknown as (params: unknown) => string,
    },
    xAxis: {
      type: 'value',
      min: 0,
      max: xMax > 0 ? Math.round(xMax * (showValueLabels ? 1.18 : 1.04)) : undefined,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { show: false },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: categories,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: chartTokens.axisLabel, fontSize: 11 },
    },
    series:
      mode === 'spent'
        ? [spentOnlySeries]
        : [budgetSpentSeries, budgetRemainingSeries, budgetOverSeries],
  };

  return (
    <div data-testid="category-spend-chart" className="relative overflow-visible">
      {(title || subtitle) && (
        <div className="sr-only">
          {title && <div>{title}</div>}
          {subtitle && <div>{subtitle}</div>}
        </div>
      )}

      <ReactECharts
        key={`${mode}-${limit ?? 'all'}`}
        option={option}
        notMerge={true}
        lazyUpdate={true}
        style={{ height, overflow: 'visible' }}
        opts={{ renderer: 'svg' }}
        onEvents={canNavigate ? { click: handleChartClick } : undefined}
      />


      {canNavigate && (
        <p className="mt-2 text-[11px] text-[var(--text-muted)]">Toca de nuevo para ver movimientos</p>
      )}

      <ul className="sr-only" aria-label="Resumen por categoría">
        {visibleItems.map((item) => (
          <li key={item.categoryId}>
            <span>{formatCategoryLabel(item.label)}</span>
            <span>{` ${valueLabel}: ${fmtCOP(item.spent)}.`}</span>
            <span>{` Presupuesto: ${item.budget && item.budget > 0 ? fmtCOP(item.budget) : '\u2014'}.`}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}






