import ReactECharts from 'echarts-for-react';
import type { BarSeriesOption, EChartsOption, LineSeriesOption } from 'echarts';
import { todayIso } from '../../utils/dates';
import { createCssVarReader } from '../../utils/cssVars';

export type EvolutionChartPoint = { date: string; day: number; amount: number };

export type EvolutionChartProps = {
  view: 'daily' | 'cumulative';
  selectedMonth: string;
  isCurrentMonth: boolean;

  daily: EvolutionChartPoint[];
  cumulative: EvolutionChartPoint[];

  avgDailyAmount: number;

  budgetTotal?: number;
  paceIdeal?: EvolutionChartPoint[];
  metricLabel?: string;
  tone?: 'expense' | 'income';
};

const fmtCOP = (value: number) => `$${Math.round(value).toLocaleString('es-CO')}`;
const formatTooltipDate = (iso: string) => {
  const parts = iso.split('-').map(Number);
  if (parts.length !== 3 || parts.some((value) => Number.isNaN(value))) return iso;
  const [year, month, day] = parts;
  const date = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short' }).format(date);
};

type EvolutionChartTokens = {
  incomeBar: string;
  expenseBar: string;
  incomeLine: string;
  expenseLine: string;
  incomeArea: string;
  expenseArea: string;
  incomeLabel: string;
  expenseLabel: string;
  deltaMuted: string;
  deltaPositive: string;
  deltaNegative: string;
  markLine: string;
  markLineLabel: string;
  markLineStrong: string;
  axisLabel: string;
  gridLine: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
  tooltipMuted: string;
};

const getEvolutionChartTokens = (): EvolutionChartTokens => {
  const readVar = createCssVarReader();
  return {
    incomeBar: readVar('--chart-income-bar', 'rgba(34,197,94,0.8)'),
    expenseBar: readVar('--chart-expense-bar', 'rgba(248,113,113,0.8)'),
    incomeLine: readVar('--chart-income-line', 'rgba(16,185,129,0.85)'),
    expenseLine: readVar('--chart-expense-line', 'rgba(249,115,22,0.85)'),
    incomeArea: readVar('--chart-income-area', 'rgba(16,185,129,0.12)'),
    expenseArea: readVar('--chart-expense-area', 'rgba(249,115,22,0.12)'),
    incomeLabel: readVar('--chart-income-label', '#34d399'),
    expenseLabel: readVar('--chart-expense-label', '#F87171'),
    deltaMuted: readVar('--chart-delta-muted', '#94A3B8'),
    deltaPositive: readVar('--chart-delta-positive', '#22C55E'),
    deltaNegative: readVar('--chart-delta-negative', '#F87171'),
    markLine: readVar('--chart-markline', 'rgba(255,255,255,0.22)'),
    markLineLabel: readVar('--chart-markline-label', 'rgba(255,255,255,0.7)'),
    markLineStrong: readVar('--chart-markline-strong', 'rgba(255,255,255,0.35)'),
    axisLabel: readVar('--chart-axis', 'rgba(255,255,255,0.55)'),
    gridLine: readVar('--chart-grid', 'rgba(255,255,255,0.08)'),
    tooltipBg: readVar('--chart-tooltip-bg', 'rgba(0,0,0,0.55)'),
    tooltipBorder: readVar('--chart-tooltip-border', 'rgba(255,255,255,0.12)'),
    tooltipText: readVar('--chart-tooltip-text', '#fff'),
    tooltipMuted: readVar('--chart-tooltip-muted', '#94A3B8'),
  };
};

export function EvolutionChart({
  view,
  isCurrentMonth,
  daily,
  cumulative,
  avgDailyAmount,
  budgetTotal,
  paceIdeal,
  metricLabel = 'Gasto',
  tone = 'expense',
}: EvolutionChartProps) {
  const seriesData = view === 'daily' ? daily : cumulative;
  const xLabels = seriesData.map((d) => String(d.day).padStart(2, '0'));
  const lastDayLabel = xLabels.length ? xLabels[xLabels.length - 1] : '01';
  const today = todayIso();
  const todayPoint = isCurrentMonth ? daily.find((d) => d.date === today) : undefined;
  const todayLabel = todayPoint ? String(todayPoint.day).padStart(2, '0') : null;
  const isIncome = tone === 'income';
  const chartTokens = getEvolutionChartTokens();
  const dailyBarColor = isIncome ? chartTokens.incomeBar : chartTokens.expenseBar;
  const cumulativeLineColor = isIncome ? chartTokens.incomeLine : chartTokens.expenseLine;
  const cumulativeAreaColor = isIncome ? chartTokens.incomeArea : chartTokens.expenseArea;
  const todayLabelColor = isIncome ? chartTokens.incomeLabel : chartTokens.expenseLabel;

  const tickSet = new Set<string>(['01', '15', lastDayLabel]);
  if (todayLabel) tickSet.add(todayLabel);

  const dailyTooltipFormatter = (params: unknown) => {
    const list = Array.isArray(params) ? params : [params];
    const first = list[0] as { dataIndex?: number } | undefined;
    const idx = first?.dataIndex ?? 0;
    const point = daily[idx];
    if (!point) return '';

    const amount = point.amount;
    const dateLabel = formatTooltipDate(point.date);
    const hasAvg = avgDailyAmount > 0;
    const delta = hasAvg ? amount - avgDailyAmount : null;
    const deltaLabel = delta !== null ? `${delta >= 0 ? '+' : '-'}${fmtCOP(Math.abs(delta))}` : null;
    const deltaColor =
      delta === null
        ? chartTokens.deltaMuted
        : delta > 0
          ? isIncome
            ? chartTokens.deltaPositive
            : chartTokens.deltaNegative
          : delta < 0
            ? isIncome
              ? chartTokens.deltaNegative
              : chartTokens.deltaPositive
            : chartTokens.deltaMuted;

    return `
      <div style="display:flex;flex-direction:column;gap:4px;">
        <div style="font-weight:600;color:${chartTokens.tooltipText};">${dateLabel}</div>
        <div style="display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;">
          <span style="color:${chartTokens.tooltipMuted};">${metricLabel} del dia</span>
          <span style="font-weight:800;color:${chartTokens.tooltipText};">${fmtCOP(amount)}</span>
        </div>
        ${
          deltaLabel !== null && delta !== 0
            ? `<div style="color:${deltaColor};font-weight:600;">vs promedio ${deltaLabel}</div>`
            : ``
        }
      </div>
    `;
  };

  const cumulativeTooltipFormatter = (params: unknown) => {
    const list = Array.isArray(params) ? params : [params];
    const first = list[0] as { dataIndex?: number } | undefined;
    const idx = first?.dataIndex ?? 0;
    const point = cumulative[idx];
    if (!point) return '';

    const acc = point.amount;
    const dateLabel = formatTooltipDate(point.date);
    const pct = budgetTotal && budgetTotal > 0 ? Math.round((acc / budgetTotal) * 100) : null;
    const hasPace = typeof paceIdeal?.[idx]?.amount === 'number' && Number.isFinite(paceIdeal[idx].amount);
    const delta = hasPace ? acc - paceIdeal[idx].amount : null;
    const deltaLabel = delta !== null ? `${delta >= 0 ? '+' : '-'}${fmtCOP(Math.abs(delta))}` : null;
    const deltaColor =
      delta === null
        ? chartTokens.deltaMuted
        : delta > 0
          ? isIncome
            ? chartTokens.deltaPositive
            : chartTokens.deltaNegative
          : delta < 0
            ? isIncome
              ? chartTokens.deltaNegative
              : chartTokens.deltaPositive
            : chartTokens.deltaMuted;

    return `
      <div style="display:flex;flex-direction:column;gap:4px;">
        <div style="font-weight:600;color:${chartTokens.tooltipText};">${dateLabel}</div>
        <div style="display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;">
          <span style="color:${chartTokens.tooltipMuted};">Acumulado</span>
          <span style="font-weight:800;color:${chartTokens.tooltipText};">${fmtCOP(acc)}</span>
          ${pct !== null ? `<span style="color:${chartTokens.tooltipMuted};">~ ${pct}%</span>` : ``}
        </div>
        ${
          deltaLabel !== null
            ? `<div style="color:${deltaColor};font-weight:600;">vs ritmo ${deltaLabel}</div>`
            : ``
        }
      </div>
    `;
  };

  const dailySeries: BarSeriesOption = {
    type: 'bar',
    data: daily.map((d) => d.amount),
    barWidth: '70%',
    itemStyle: { color: dailyBarColor },
    markLine: {
      symbol: 'none',
      lineStyle: { type: 'dashed', color: chartTokens.markLine },
      label: { color: chartTokens.markLineLabel, fontSize: 10 },
      data: [
        ...(avgDailyAmount > 0 ? [{ yAxis: avgDailyAmount, name: 'Promedio', label: { formatter: 'Promedio' } }] : []),
        ...(todayLabel ? [{ xAxis: todayLabel, name: 'hoy', label: { formatter: 'hoy' } }] : []),
      ] as unknown as NonNullable<BarSeriesOption['markLine']>['data'],
    },
  };

  const cumulativeSeries: LineSeriesOption = {
    name: 'Acumulado',
    type: 'line',
    smooth: true,
    showSymbol: false,
    data: cumulative.map((d) => d.amount),
    lineStyle: { width: 2, color: cumulativeLineColor },
    areaStyle: { color: cumulativeAreaColor },
    markLine: {
      symbol: 'none',
      lineStyle: { type: 'dashed', color: chartTokens.markLine },
      label: { color: chartTokens.markLineLabel, fontSize: 10 },
      data: [
        ...(budgetTotal && budgetTotal > 0 ? [{ yAxis: budgetTotal, name: 'Presupuesto', label: { formatter: 'Presupuesto' } }] : []),
        ...(todayLabel ? [{ xAxis: todayLabel, name: 'hoy', label: { formatter: 'hoy' } }] : []),
      ] as unknown as NonNullable<LineSeriesOption['markLine']>['data'],
    },
  };

  const paceSeries: LineSeriesOption = {
    name: 'Ritmo ideal',
    type: 'line',
    smooth: true,
    showSymbol: false,
    data: paceIdeal?.map((d) => d.amount) ?? [],
    lineStyle: { width: 1.5, type: 'dashed', color: chartTokens.markLineStrong },
  };

  const option: EChartsOption = {
    backgroundColor: 'transparent',
    animation: false,
    grid: { left: 12, right: 12, top: 16, bottom: 28, containLabel: false },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: view === 'daily' ? 'shadow' : 'line' },
      backgroundColor: chartTokens.tooltipBg,
      borderColor: chartTokens.tooltipBorder,
      borderWidth: 1,
      textStyle: { color: chartTokens.tooltipText, fontSize: 12 },
      confine: true,
      appendToBody: false,
      extraCssText:
        'max-width:220px; white-space:normal; border-radius:12px; padding:10px; box-shadow: var(--shadow-glass); backdrop-filter: blur(var(--glass-blur)); -webkit-backdrop-filter: blur(var(--glass-blur));',
      formatter:
        view === 'daily'
          ? (dailyTooltipFormatter as unknown as (params: unknown) => string)
          : (cumulativeTooltipFormatter as unknown as (params: unknown) => string),
    },
    xAxis: {
      type: 'category',
      data: xLabels,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: chartTokens.axisLabel,
        fontSize: 10,
        margin: 10,
        formatter: (value: string) => {
          if (!tickSet.has(value)) return '';
          if (todayLabel && value === todayLabel) return `{today|${value}}`;
          return value;
        },
        rich: {
          today: { color: todayLabelColor, fontWeight: 700 },
        },
      },
    },
    yAxis: {
      type: 'value',
      min: 0,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { show: false },
      splitLine: { show: true, lineStyle: { color: chartTokens.gridLine } },
    },
    series:
      view === 'daily'
        ? [dailySeries]
        : [cumulativeSeries, ...(paceIdeal?.length ? [paceSeries] : [])],
  };

  return (
    <div data-testid="evolution-chart" className="relative overflow-visible">
      <ReactECharts
        option={option}
        notMerge={true}
        lazyUpdate={true}
        style={{ height: 170, overflow: 'visible' }}
        opts={{ renderer: 'svg' }}
      />
    </div>
  );
}



