import ReactECharts from 'echarts-for-react';
import type { BarSeriesOption, EChartsOption } from 'echarts';

export type CategorySpendMode = 'spent' | 'budget';

export type CategorySpendItem = {
  category: string;
  spent: number;
  budget?: number; // undefined => "Sin presupuesto"
};

export type CategorySpendChartProps = {
  title?: string;
  subtitle?: string;
  items: CategorySpendItem[]; // pre-ordered desc by spent
  mode: CategorySpendMode;
  limit?: number;
  currency?: 'COP';
};

const fmtCOP = (value: number) => `$${Math.round(value).toLocaleString('es-CO')}`;

const BAR_RADIUS = 10;
const BAR_HEIGHT = 14;

const RANK_PALETTE = [
  '#22C55E',
  '#0EA5E9',
  '#A78BFA',
  '#F59E0B',
  '#F97316',
  '#14B8A6',
  '#EF4444',
  '#94A3B8',
] as const;

const rankColor = (index: number) => RANK_PALETTE[index % RANK_PALETTE.length];

const formatCategoryLabel = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return value;
  const lower = trimmed.toLocaleLowerCase('es-CO');
  return lower.charAt(0).toLocaleUpperCase('es-CO') + lower.slice(1);
};

const pctColor = (pct: number) => {
  if (pct > 100) return '#EF4444';
  if (pct >= 80) return '#F59E0B';
  return '#14B8A6';
};

const BUDGET_REMAINING_COLOR = 'rgba(148,163,184,0.18)';
const BUDGET_OVER_COLOR = '#EF4444';
const BUDGET_SPENT_OK = '#14B8A6';
const BUDGET_SPENT_WARN = '#F59E0B';
const BUDGET_SPENT_NO_BUDGET = '#0EA5E9';

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

export function CategorySpendChart({ title, subtitle, items, mode, limit }: CategorySpendChartProps) {
  const visibleItems = limit ? items.slice(0, limit) : items;
  const showValueLabels = Boolean(limit);

  if (!visibleItems.length) {
    return <p className="text-sm text-[var(--muted)]">{'Aún no hay categorías para mostrar.'}</p>;
  }

  const categories = visibleItems.map((i) => formatCategoryLabel(i.category));
  const xMax = Math.max(
    ...visibleItems.map((item) => {
      const meta = getBudgetMeta(item);
      if (mode === 'budget' && meta.hasBudget) return Math.max(meta.budgetValue, item.spent);
      return item.spent;
    }),
    0,
  );

  const spentOnlySeries: BarSeriesOption = {
    name: 'Gastado',
    type: 'bar',
    data: visibleItems.map((item, index) => ({
      value: item.spent,
      itemStyle: { color: rankColor(index), borderRadius: BAR_RADIUS },
    })) as unknown as BarSeriesOption['data'],
    barWidth: BAR_HEIGHT,
    showBackground: true,
    backgroundStyle: { color: 'rgba(255,255,255,0.05)', borderRadius: BAR_RADIUS },
    label: showValueLabels
      ? ({
          show: true,
          position: 'right',
          color: 'rgba(255,255,255,0.75)',
          fontSize: 11,
          fontWeight: 600,
          formatter: (p: { value?: unknown }) => fmtCOP(Number(p.value ?? 0)),
        } as unknown as BarSeriesOption['label'])
      : { show: false },
    emphasis: { focus: 'series' },
  };

  const budgetSpentSeries: BarSeriesOption = {
    name: 'Gastado',
    type: 'bar',
    stack: 'budget',
    data: visibleItems.map((item) => {
      const meta = getBudgetMeta(item);
      const remaining = meta.hasBudget ? Math.max(meta.budgetValue - item.spent, 0) : 0;
      const isLast = meta.over <= 0 && remaining <= 0;
      const borderRadius = isLast ? BAR_RADIUS : [BAR_RADIUS, 0, 0, BAR_RADIUS];

      const pct = meta.hasBudget ? Math.round((item.spent / meta.budgetValue) * 100) : null;
      const spentColor = !meta.hasBudget ? BUDGET_SPENT_NO_BUDGET : (pct ?? 0) < 80 ? BUDGET_SPENT_OK : BUDGET_SPENT_WARN;
      const label =
        showValueLabels && meta.hasBudget && isLast
          ? ({
              show: true,
              position: 'right',
              color: pctColor(pct ?? 0),
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
              color: pctColor(pct ?? 0),
              fontSize: 11,
              fontWeight: 700,
              formatter: () => `${pct ?? 0}%`,
            } as const)
          : ({ show: false } as const);

      return showValueLabels ? { value: remaining, itemStyle: { borderRadius }, label } : { value: remaining, itemStyle: { borderRadius } };
    }) as unknown as BarSeriesOption['data'],
    barWidth: BAR_HEIGHT,
    itemStyle: { color: BUDGET_REMAINING_COLOR },
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
              color: pctColor(pct ?? 0),
              fontSize: 11,
              fontWeight: 700,
              formatter: () => `${pct ?? 0}%`,
            } as const)
          : ({ show: false } as const);

      return showValueLabels ? { value: meta.over, itemStyle: { borderRadius }, label } : { value: meta.over, itemStyle: { borderRadius } };
    }) as unknown as BarSeriesOption['data'],
    barWidth: BAR_HEIGHT,
    itemStyle: { color: BUDGET_OVER_COLOR },
    emphasis: { focus: 'series' },
    z: 4,
  };

  const tooltipFormatter = (params: unknown) => {
    const list = Array.isArray(params) ? params : [params];
    const first = list[0] as { dataIndex?: number } | undefined;
    const idx = first?.dataIndex ?? 0;
    const item = visibleItems[idx];
    if (!item) return '';

    const header = `<div style="font-weight:700;color:#F8FAFC;">${formatCategoryLabel(item.category)}</div>`;

    if (mode === 'spent') {
      return tooltipShell(`
        ${header}
        <div style="color:#94A3B8;">
          Gastado: <span style="font-weight:800;color:#F8FAFC;">${fmtCOP(item.spent)}</span>
        </div>
      `);
    }

    const meta = getBudgetMeta(item);
    const pct = meta.hasBudget ? Math.round((item.spent / meta.budgetValue) * 100) : null;
    const excess = meta.hasBudget && item.spent > meta.budgetValue ? item.spent - meta.budgetValue : null;

    return tooltipShell(`
      ${header}
      <div style="color:#94A3B8;">
        Gastado: <span style="font-weight:800;color:#F8FAFC;">${fmtCOP(item.spent)}</span>
      </div>
      <div style="color:#94A3B8;">Presupuesto: ${meta.hasBudget ? fmtCOP(meta.budgetValue) : '\u2014'}</div>
      ${
        pct !== null
          ? `<div style="color:#94A3B8;">% usado: <span style="font-weight:700;color:${pctColor(pct)};">${pct}%</span></div>`
          : ``
      }
      ${excess !== null ? `<div style="color:${BUDGET_OVER_COLOR};font-weight:700;">Exceso: ${fmtCOP(excess)}</div>` : ``}
    `);
  };

  const height = limit ? 170 : Math.max(240, visibleItems.length * 34 + 56);

  const option: EChartsOption = {
    backgroundColor: 'transparent',
    animation: false,
    grid: { left: 12, right: showValueLabels ? 72 : 18, top: 8, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      confine: true,
      appendToBody: false,
      extraCssText: 'max-width:240px; white-space:normal; border-radius:12px; padding:10px;',
      backgroundColor: 'rgba(0,0,0,0.55)',
      borderColor: 'rgba(255,255,255,0.12)',
      textStyle: { color: '#fff', fontSize: 12 },
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
      axisLabel: { color: 'rgba(255,255,255,0.82)', fontSize: 11 },
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
      />

      <ul className="sr-only" aria-label="Resumen por categoría">
        {visibleItems.map((item) => (
          <li key={item.category}>
            <span>{formatCategoryLabel(item.category)}</span>
            <span>{` Gastado: ${fmtCOP(item.spent)}.`}</span>
            <span>{` Presupuesto: ${item.budget && item.budget > 0 ? fmtCOP(item.budget) : '\u2014'}.`}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

