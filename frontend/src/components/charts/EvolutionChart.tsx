import ReactECharts from 'echarts-for-react';
import type { BarSeriesOption, EChartsOption, LineSeriesOption } from 'echarts';

export type EvolutionChartPoint = { date: string; day: number; amount: number };

export type EvolutionChartProps = {
  view: 'daily' | 'cumulative';
  selectedMonth: string;
  isCurrentMonth: boolean;

  daily: EvolutionChartPoint[];
  cumulative: EvolutionChartPoint[];

  avgDailyExpense: number;

  budgetTotal?: number;
  paceIdeal?: EvolutionChartPoint[];
};

const fmtCOP = (value: number) => `$${Math.round(value).toLocaleString('es-CO')}`;

export function EvolutionChart({
  view,
  isCurrentMonth,
  daily,
  cumulative,
  avgDailyExpense,
  budgetTotal,
  paceIdeal,
}: EvolutionChartProps) {
  const seriesData = view === 'daily' ? daily : cumulative;
  const xLabels = seriesData.map((d) => String(d.day).padStart(2, '0'));
  const lastDayLabel = xLabels.length ? xLabels[xLabels.length - 1] : '01';
  const todayIso = new Date().toISOString().slice(0, 10);
  const todayPoint = isCurrentMonth ? daily.find((d) => d.date === todayIso) : undefined;
  const todayLabel = todayPoint ? String(todayPoint.day).padStart(2, '0') : null;

  const tickSet = new Set<string>(['01', '15', lastDayLabel]);
  if (todayLabel) tickSet.add(todayLabel);

  const dailyTooltipFormatter = (params: unknown) => {
    const list = Array.isArray(params) ? params : [params];
    const first = list[0] as { dataIndex?: number } | undefined;
    const idx = first?.dataIndex ?? 0;
    const point = daily[idx];
    if (!point) return '';

    const amount = point.amount;
    const hasAvg = avgDailyExpense > 0;
    const delta = hasAvg ? amount - avgDailyExpense : null;
    const deltaLabel = delta !== null ? `${delta >= 0 ? '+' : '-'}${fmtCOP(Math.abs(delta))}` : null;
    const deltaColor = delta === null ? '#94A3B8' : delta > 0 ? '#F87171' : delta < 0 ? '#22C55E' : '#94A3B8';

    return `
      <div style="display:flex;flex-direction:column;gap:4px;">
        <div style="font-weight:600;color:#F8FAFC;">${point.date}</div>
        <div style="display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;">
          <span style="color:#94A3B8;">Gasto del día</span>
          <span style="font-weight:800;color:#F8FAFC;">${fmtCOP(amount)}</span>
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
    const pct = budgetTotal && budgetTotal > 0 ? Math.round((acc / budgetTotal) * 100) : null;
    const hasPace = typeof paceIdeal?.[idx]?.amount === 'number' && Number.isFinite(paceIdeal[idx].amount);
    const delta = hasPace ? acc - paceIdeal[idx].amount : null;
    const deltaLabel = delta !== null ? `${delta >= 0 ? '+' : '-'}${fmtCOP(Math.abs(delta))}` : null;
    const deltaColor = delta !== null && delta >= 0 ? '#F87171' : '#22C55E';

    return `
      <div style="display:flex;flex-direction:column;gap:4px;">
        <div style="font-weight:600;color:#F8FAFC;">${point.date}</div>
        <div style="display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;">
          <span style="color:#94A3B8;">Acumulado</span>
          <span style="font-weight:800;color:#F8FAFC;">${fmtCOP(acc)}</span>
          ${pct !== null ? `<span style="color:#94A3B8;">· ${pct}%</span>` : ``}
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
    itemStyle: { color: 'rgba(56,189,248,0.8)' },
    markLine: {
      symbol: 'none',
      lineStyle: { type: 'dashed', color: 'rgba(255,255,255,0.22)' },
      label: { color: 'rgba(255,255,255,0.7)', fontSize: 10 },
      data: [
        ...(avgDailyExpense > 0 ? [{ yAxis: avgDailyExpense, name: 'Promedio', label: { formatter: 'Promedio' } }] : []),
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
    lineStyle: { width: 2, color: 'rgba(16,185,129,0.85)' },
    areaStyle: { color: 'rgba(16,185,129,0.12)' },
    markLine: {
      symbol: 'none',
      lineStyle: { type: 'dashed', color: 'rgba(255,255,255,0.22)' },
      label: { color: 'rgba(255,255,255,0.7)', fontSize: 10 },
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
    lineStyle: { width: 1.5, type: 'dashed', color: 'rgba(255,255,255,0.35)' },
  };

  const option: EChartsOption = {
    backgroundColor: 'transparent',
    animation: false,
    grid: { left: 12, right: 12, top: 16, bottom: 28, containLabel: false },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: view === 'daily' ? 'shadow' : 'line' },
      backgroundColor: 'rgba(0,0,0,0.55)',
      borderColor: 'rgba(255,255,255,0.12)',
      textStyle: { color: '#fff', fontSize: 12 },
      confine: true,
      appendToBody: true,
      extraCssText: 'max-width:220px; white-space:normal; border-radius:12px; padding:10px;',
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
        color: 'rgba(255,255,255,0.55)',
        fontSize: 10,
        margin: 10,
        formatter: (value: string) => {
          if (!tickSet.has(value)) return '';
          if (todayLabel && value === todayLabel) return `{today|${value}}`;
          return value;
        },
        rich: {
          today: { color: '#34d399', fontWeight: 700 },
        },
      },
    },
    yAxis: {
      type: 'value',
      min: 0,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { show: false },
      splitLine: { show: true, lineStyle: { color: 'rgba(255,255,255,0.08)' } },
    },
    series:
      view === 'daily'
        ? [dailySeries]
        : [cumulativeSeries, ...(paceIdeal?.length ? [paceSeries] : [])],
  };

  return (
    <div data-testid="evolution-chart">
      <ReactECharts option={option} notMerge={true} lazyUpdate={true} style={{ height: 170 }} opts={{ renderer: 'svg' }} />
    </div>
  );
}
