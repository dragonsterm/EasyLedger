import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import type { EChartsOption } from 'echarts';
import ReactGridLayout, { useContainerWidth } from 'react-grid-layout';
import type { Layout } from 'react-grid-layout';
import EChart from './EChart';
import Icon from './Icon';
import LedgerJournal from './Ledger';
import Catalog, { type CatalogSection } from './Catalog';
import HomeWorkspace from './HomeWorkspace';
import { AuthModal, type MerchantIdentity } from './AuthModal';
import { VoiceControl, useVoiceAgent } from './VoiceControl';
import type { VoiceDashboardDraft } from './VoiceControl';
import {
  createAppendedDashboardLayoutItem,
  createDashboardWidget,
  createInitialDashboardLayout,
  createInitialDashboardWidgets,
  createUniqueDashboardWidgetId,
  canMoveDashboardLayoutItem,
  applyLayoutSizePreset,
  computePreviewLayout,
  dashboardWidgetKindForType,
  dashboardWidgetKindsForType,
  moveDashboardLayoutItem,
  dashboardWidgetOptions,
  mapVoiceDashboardDraft,
  normalizeDashboardLayout,
  reconfigureDashboardWidget,
  removeDashboardLayoutItem,
  sanitizeDashboardWidgetTitle,
  updateDashboardLayoutForWidgetKind,
} from './dashboardLayout';
import type { DashboardLayoutItem, DashboardWidgetDefinition, DashboardWidgetKind, DashboardWidgetMetric, DashboardWidgetStyle, DashboardWidgetType, LayoutSizePreset } from './dashboardLayout';
import {
  AnalyticsHttpError,
  buildSourceTransactionsRequest,
  escapeTooltipHtml,
  fetchAnalyticsQuery,
  fetchSourceTransactions,
  formatAnalyticsTotal,
  formatMoneyMinor,
  mapAnalyticsRowsToChart,
  sampleDailyRevenue,
  sampleProductUnits,
  sampleTotalRevenue,
  sampleTotalUnits,
} from './analytics';
import type { AnalyticsQueryResponse, ChartMapping, ChartPoint, LedgerCurrency, SourceTransaction, SourceTransactionsResponse } from './analytics';

interface WidgetSelection extends DashboardWidgetDefinition {
  data: AnalyticsQueryResponse | null;
  dataSource: 'sample' | 'live';
}

interface DashboardAnalytics {
  revenue: AnalyticsQueryResponse;
  products: AnalyticsQueryResponse;
  totalRevenue: AnalyticsQueryResponse;
  totalUnits: AnalyticsQueryResponse;
}

interface SelectedDatum {
  dimension: 'date' | 'product';
  key: string;
  label: string;
  response: AnalyticsQueryResponse;
  focusTarget: HTMLElement | null;
  isLive: boolean;
}

type SourceDialogState =
  | { status: 'sample' }
  | { status: 'loading' }
  | { status: 'ready'; pages: SourceTransactionsResponse[] }
  | { status: 'loading-more'; pages: SourceTransactionsResponse[] }
  | { status: 'unauthorized' }
  | { status: 'stale' }
  | { status: 'error' };

type DashboardMode = 'preview' | 'editing';

function sampleDataForWidget(kind: DashboardWidgetKind): AnalyticsQueryResponse | null {
  switch (kind) {
    case 'revenue-kpi': return sampleTotalRevenue;
    case 'units-kpi': return sampleTotalUnits;
    case 'daily-revenue': return sampleDailyRevenue;
    case 'product-sales': return sampleProductUnits;
    case 'complete-days': return null;
  }
}

const initialWidgetSelections: WidgetSelection[] = createInitialDashboardWidgets().map((widget) => ({
  ...widget,
  data: sampleDataForWidget(widget.kind),
  dataSource: 'sample',
}));

function isReady(mapping: ChartMapping): mapping is Extract<ChartMapping, { status: 'ready' }> {
  return mapping.status === 'ready';
}

function dashboardLayoutsEqual(left: ReadonlyArray<DashboardLayoutItem>, right: ReadonlyArray<DashboardLayoutItem>): boolean {
  return left.length === right.length && left.every((item, index) => {
    const candidate = right[index];
    return candidate !== undefined
      && item.i === candidate.i
      && item.x === candidate.x
      && item.y === candidate.y
      && item.w === candidate.w
      && item.h === candidate.h
      && item.minW === candidate.minW
      && item.maxW === candidate.maxW
      && item.minH === candidate.minH
      && item.maxH === candidate.maxH;
  });
}

function shortDateLabel(label: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(label);
  if (!match) return label;
  const month = new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' })
    .format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))));
  return `${Number(match[3])} ${month}`;
}

function tooltipIndex(parameters: unknown): number | null {
  const candidate = Array.isArray(parameters) ? parameters[0] : parameters;
  if (typeof candidate !== 'object' || candidate === null || !('dataIndex' in candidate)) return null;
  const index = candidate.dataIndex;
  return typeof index === 'number' && Number.isInteger(index) ? index : null;
}

function coverageLabel(point: ChartPoint): string {
  if (point.coverageState === 'complete') return 'Complete day';
  if (point.coverageState === 'open') return 'Open day';
  return '';
}

function salesStateLabel(point: ChartPoint, detail: string): string {
  const coverage = coverageLabel(point);
  return `${coverage ? `${coverage} · ` : ''}${detail}`;
}

function formatMoneyTick(value: string | number, currency: LedgerCurrency): string {
  const numeric = typeof value === 'number' ? value : Number(value);
  const minorUnits = Math.round(numeric);
  if (!Number.isSafeInteger(minorUnits) || minorUnits < 0) return '—';
  return formatMoneyMinor(String(minorUnits), currency);
}

function formatCountTick(value: string | number): string {
  const numeric = typeof value === 'number' ? value : Number(value);
  const count = Math.round(numeric);
  if (!Number.isSafeInteger(count) || count < 0) return '—';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(BigInt(count));
}

function revenueTooltip(parameters: unknown, points: ChartPoint[], currency: LedgerCurrency): string {
  const index = tooltipIndex(parameters);
  if (index === null || index >= points.length) return '';
  const point = points[index];
  if (point.state === 'gap') {
    return `${escapeTooltipHtml(point.label)}<br/><strong>Open day · no sales · gap</strong>`;
  }
  if (point.state === 'confirmed-zero') {
    return `${escapeTooltipHtml(point.label)}<br/><strong>Complete day · no sales · 0</strong>`;
  }
  const amount = point.exactValue === null
    ? 'Sales recorded · revenue unknown'
    : formatMoneyMinor(point.exactValue, currency);
  const unknownNote = point.state === 'unknown-price' ? '<br/>Some recorded prices are unknown' : '';
  const coverageNote = coverageLabel(point);
  return `${escapeTooltipHtml(point.label)}<br/><strong>${escapeTooltipHtml(amount)}</strong>${coverageNote ? `<br/>${coverageNote}` : ''}${unknownNote}`;
}

function quantityTooltip(parameters: unknown, points: ChartPoint[]): string {
  const index = tooltipIndex(parameters);
  if (index === null || index >= points.length) return '';
  const point = points[index];
  if (point.state === 'gap') return `${escapeTooltipHtml(point.label)}<br/><strong>Open day · no sales</strong>`;
  if (point.state === 'confirmed-zero') return `${escapeTooltipHtml(point.label)}<br/><strong>Complete day · no sales · 0 units</strong>`;
  const units = point.exactValue === null
    ? 'Sales recorded · quantity unknown'
    : new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(BigInt(point.exactValue));
  const unknownNote = point.state === 'unknown-price' ? '<br/>Some recorded prices are unknown' : '';
  return `${escapeTooltipHtml(point.label)}<br/><strong>${escapeTooltipHtml(units)} units</strong>${unknownNote}`;
}

function revenueChartOption(mapping: ChartMapping, currency: LedgerCurrency): EChartsOption {
  const points = isReady(mapping) ? mapping.points : [];
  return {
    animation: false,
    grid: { left: 65, right: 13, top: 8, bottom: 30 },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#fbfbf7',
      borderColor: '#e5e8df',
      textStyle: { color: '#30382c', fontFamily: 'Roboto, Segoe UI, Arial, sans-serif', fontSize: 11 },
      formatter: (parameters) => revenueTooltip(parameters, points, currency),
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: points.map((point) => shortDateLabel(point.label)),
      axisLine: { lineStyle: { color: '#dfe3d9' } },
      axisTick: { show: false },
      axisLabel: { color: '#68715f', fontSize: 10, hideOverlap: true },
    },
    yAxis: {
      type: 'value',
      min: 0,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: '#68715f',
        fontSize: 10,
        formatter: (value) => formatMoneyTick(value, currency),
      },
      splitLine: { lineStyle: { color: '#edf0e8', type: 'dashed' } },
    },
    series: [{
      name: 'Known-price revenue',
      type: 'line',
      smooth: false,
      connectNulls: false,
      showSymbol: true,
      symbol: 'circle',
      symbolSize: 7,
      data: points.map((point) => point.value),
      lineStyle: { color: '#6d865f', width: 2 },
      itemStyle: { color: '#6d865f', borderColor: '#ffffff', borderWidth: 1.5 },
    }],
  };
}

function productChartOption(mapping: ChartMapping): EChartsOption {
  const points = isReady(mapping) ? mapping.points : [];
  const colors = ['#d3de9b', '#b4d5c7', '#e7c0a8', '#c9c4de'];
  return {
    animation: false,
    grid: { left: 100, right: 26, top: 8, bottom: 22 },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: '#fbfbf7',
      borderColor: '#e5e8df',
      textStyle: { color: '#30382c', fontFamily: 'Roboto, Segoe UI, Arial, sans-serif', fontSize: 11 },
      formatter: (parameters) => quantityTooltip(parameters, points),
    },
    xAxis: {
      type: 'value',
      min: 0,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#68715f', fontSize: 10, formatter: (value) => formatCountTick(value) },
      splitLine: { lineStyle: { color: '#edf0e8', type: 'dashed' } },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: points.map((point) => point.label),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#68715f', fontSize: 11, width: 90, overflow: 'truncate' },
    },
    series: [{
      name: 'Units sold',
      type: 'bar',
      barWidth: 14,
      data: points.map((point, index) => ({ value: point.value, itemStyle: { color: colors[index % colors.length] } })),
      itemStyle: { borderRadius: [0, 7, 7, 0] },
    }],
  };
}

function MetricCard({
  widget,
  value,
  note,
  tone,
  selected,
  onSelect,
}: {
  widget: WidgetSelection;
  value: string;
  note: string;
  tone: 'revenue' | 'units' | 'days';
  selected: boolean;
  onSelect: (widget: WidgetSelection) => void;
}) {
  return (
    <button
      id={`widget-${widget.id}`}
      className={`stat-card stat-card-${tone} widget-selectable${selected ? ' widget-selected' : ''}`}
      type="button"
      aria-label={`${widget.title}: ${value}. ${note}. Open widget properties.`}
      aria-pressed={selected}
      onClick={() => onSelect(widget)}
    >
      <span className="stat-label">{widget.title}</span>
      <strong className="stat-value">{value}</strong>
      <span className="stat-note">{note}</span>
    </button>
  );
}

function CompletenessNote({ data, isLive }: { data: AnalyticsQueryResponse; isLive: boolean }) {
  return data.has_unknown_prices
    ? <span className="sample-completeness">Some prices are unknown; known-price revenue excludes them.</span>
    : <span className="sample-completeness">Revenue is complete for this {isLive ? 'query' : 'sample'}.</span>;
}

function ChartTitleButton({ id, headingId, title, selected, onClick }: { id: string; headingId: string; title: string; selected: boolean; onClick: () => void }) {
  return (
    <h3 id={headingId}>
      <button id={id} className="chart-title-button" type="button" aria-pressed={selected} onClick={onClick}>
        {title}
      </button>
    </h3>
  );
}

function RevenueChart({
  widget,
  data,
  isLive,
  selected,
  onSelect,
  onDatumSelect,
}: {
  widget: WidgetSelection;
  data: AnalyticsQueryResponse;
  isLive: boolean;
  selected: boolean;
  onSelect: (widget: WidgetSelection) => void;
  onDatumSelect: (dimension: 'date' | 'product', key: string, label: string, response: AnalyticsQueryResponse, focusTarget: HTMLElement | null) => void;
}) {
  const mapping = mapAnalyticsRowsToChart(data);
  const option = revenueChartOption(mapping, data.currency);
  const chartMessage = mapping.status === 'empty'
    ? `No data for this ${isLive ? 'ledger query' : 'sample'}.`
    : mapping.status === 'unsupported-range'
      ? mapping.reason
      : null;
  const points = isReady(mapping) ? mapping.points : [];
  const titleId = `heading-${widget.id}`;
  const openDatum = (index: number, focusTarget: HTMLElement | null) => {
    const point = points[index];
    if (point) onDatumSelect('date', point.key, point.label, data, focusTarget);
  };

  return (
    <div className="chart-column">
      <div className={`selected-widget${selected ? ' widget-selected' : ''}`}>
        <figure className="chart-card chart-card-line" aria-labelledby={titleId}>
          <div className="chart-card-heading">
            <div>
              <ChartTitleButton id={`widget-${widget.id}`} headingId={titleId} title={widget.title} selected={selected} onClick={() => onSelect({ ...widget, data, dataSource: isLive ? 'live' : 'sample' })} />
              <p className="chart-subtitle">{isLive ? 'Live ledger' : 'Sample'} · Known-price revenue · {data.currency}</p>
            </div>
            {selected && <span className="selected-pill">Selected</span>}
          </div>
          {chartMessage
            ? <div className="chart-state chart-state-line">{chartMessage}</div>
            : <div className="chart-visual chart-visual-line"><EChart
              option={option}
              label={`${isLive ? 'Live' : 'Sample'} daily known-price revenue line chart`}
              dataPointCount={points.length}
              onDataPointClick={(index) => openDatum(index, document.getElementById(`widget-${widget.id}`))}
            /></div>}
          <p className="chart-data-note">Open no-sale days are gaps; complete no-sale days are zero. Unknown-price sales are labeled separately.</p>
        </figure>
      </div>
      <details className="chart-data-details">
        <summary>View daily data as text and select a date</summary>
        <table>
          <caption>{isLive ? 'Live daily revenue details' : 'Sample daily revenue details'}</caption>
          <thead><tr><th>Date</th><th>Known-price revenue</th><th>Quantity</th><th>Day and price state</th><th>Source</th></tr></thead>
          <tbody>
            {points.length === 0
              ? <tr><td colSpan={5}>{chartMessage ?? 'No data for this query.'}</td></tr>
              : points.map((point) => (
                <tr key={point.key}>
                  <td>{point.label}</td>
                  <td>{point.state === 'gap'
                    ? 'No sale · open day · gap'
                    : point.state === 'confirmed-zero'
                      ? '0 · complete no-sale day'
                      : point.exactValue === null
                        ? 'Recorded sale · revenue unknown'
                        : `${formatMoneyMinor(point.exactValue, data.currency)}${point.state === 'unknown-price' ? ' · some prices unknown' : ''}`}</td>
                  <td>{point.quantity ?? 'No sales recorded'}</td>
                  <td>{point.state === 'gap'
                    ? 'Open day · missing activity is unknown'
                    : point.state === 'confirmed-zero'
                      ? 'Complete day · confirmed no sales'
                      : point.state === 'unknown-price'
                        ? salesStateLabel(point, 'sales recorded · unknown-price revenue is excluded')
                        : salesStateLabel(point, 'sales recorded · prices known')}</td>
                  <td><button type="button" className="chart-datum-link" onClick={(event) => openDatum(points.indexOf(point), event.currentTarget)}>Open source rows</button></td>
                </tr>
              ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

function ProductChart({
  widget,
  data,
  isLive,
  selected,
  onSelect,
  onDatumSelect,
}: {
  widget: WidgetSelection;
  data: AnalyticsQueryResponse;
  isLive: boolean;
  selected: boolean;
  onSelect: (widget: WidgetSelection) => void;
  onDatumSelect: (dimension: 'date' | 'product', key: string, label: string, response: AnalyticsQueryResponse, focusTarget: HTMLElement | null) => void;
}) {
  const mapping = mapAnalyticsRowsToChart(data);
  const option = productChartOption(mapping);
  const chartMessage = mapping.status === 'empty'
    ? `No data for this ${isLive ? 'ledger query' : 'sample'}.`
    : mapping.status === 'unsupported-range'
      ? mapping.reason
      : null;
  const points = isReady(mapping) ? mapping.points : [];
  const titleId = `heading-${widget.id}`;
  const openDatum = (index: number, focusTarget: HTMLElement | null) => {
    const point = points[index];
    if (point) onDatumSelect('product', point.key, point.label, data, focusTarget);
  };

  return (
    <div className="chart-column">
      <article className={`chart-card product-card${selected ? ' widget-selected' : ''}`}>
        <figure aria-labelledby={titleId}>
          <div className="chart-card-heading product-card-heading">
            <div>
              <ChartTitleButton id={`widget-${widget.id}`} headingId={titleId} title={widget.title} selected={selected} onClick={() => onSelect({ ...widget, data, dataSource: isLive ? 'live' : 'sample' })} />
              <p className="chart-subtitle">{isLive ? 'Live ledger' : 'Sample'} · Units sold</p>
            </div>
            {selected && <span className="selected-pill">Selected</span>}
          </div>
          {chartMessage
            ? <div className="chart-state chart-state-product">{chartMessage}</div>
            : <div className="chart-visual chart-visual-product"><EChart
              option={option}
              label={`${isLive ? 'Live' : 'Sample'} units sold by product horizontal bar chart`}
              dataPointCount={points.length}
              onDataPointClick={(index) => openDatum(index, document.getElementById(`widget-${widget.id}`))}
            /></div>}
          <p className="product-card-footer">All quantities include rows with unknown prices</p>
        </figure>
      </article>
      <details className="chart-data-details">
        <summary>View product data as text and select a product</summary>
        <table>
          <caption>{isLive ? 'Live units sold by product' : 'Sample units sold by product'}</caption>
          <thead><tr><th>Product</th><th>Units sold</th><th>Source</th></tr></thead>
          <tbody>
            {points.length === 0
              ? <tr><td colSpan={3}>{chartMessage ?? 'No data for this query.'}</td></tr>
              : points.map((point, index) => (
                <tr key={point.key}>
                  <td>{point.label}</td><td>{point.exactValue ?? 'No quantity'}</td>
                  <td><button type="button" className="chart-datum-link" onClick={(event) => openDatum(index, event.currentTarget)}>Open source rows</button></td>
                </tr>
              ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

function DashboardWidgetCard({
  widget,
  isEditing,
  selected,
  onRemove,
  children,
}: {
  widget: WidgetSelection;
  isEditing: boolean;
  selected?: boolean;
  onRemove: (id: string) => void;
  children: ReactNode;
}) {
  return (
    <article
      className={`dashboard-widget-card dashboard-widget-card-${widget.kind} dashboard-widget-style-${widget.style}${isEditing ? ' dashboard-widget-editing' : ' dashboard-widget-preview'}${selected ? ' widget-selected' : ''}`}
      aria-label={`${widget.title} widget`}
    >
      {isEditing && (
        <header className="dashboard-widget-tools">
          <span className="widget-drag-handle" title={`Drag to move ${widget.title}`} aria-hidden="true">
            <svg viewBox="0 0 16 16" width="16" height="16" focusable="false">
              <circle cx="5" cy="3" r="1" /><circle cx="11" cy="3" r="1" />
              <circle cx="5" cy="8" r="1" /><circle cx="11" cy="8" r="1" />
              <circle cx="5" cy="13" r="1" /><circle cx="11" cy="13" r="1" />
            </svg>
          </span>
          <span className="dashboard-widget-type">{widget.type}</span>
          <button
            className="widget-remove-button"
            type="button"
            aria-label={`Remove ${widget.title} widget`}
            onClick={() => onRemove(widget.id)}
          >
            Remove
          </button>
        </header>
      )}
      <div className="dashboard-widget-content">{children}</div>
    </article>
  );
}

function DashboardFilters({
  widgetKind,
  editable,
  onWidgetKindChange,
  onAddWidget,
}: {
  widgetKind: DashboardWidgetKind;
  editable: boolean;
  onWidgetKindChange: (kind: DashboardWidgetKind) => void;
  onAddWidget: () => void;
}) {
  return (
    <section className={`canvas-toolbar dashboard-toolbar${editable ? ' dashboard-toolbar-editing' : ' dashboard-toolbar-preview'}`} aria-label="Dashboard filters and actions">
      <div className="filter-controls">
        <label className="filter-control">
          <span className="sr-only">Date range</span>
          <select defaultValue="week" aria-label="Date range" disabled>
            <option value="week">16–22 Sep 2026</option>
          </select>
        </label>
        <label className="filter-control">
          <span className="sr-only">Product filter</span>
          <select defaultValue="all" aria-label="Product filter" disabled>
            <option value="all">All products</option>
          </select>
        </label>
        <label className="filter-control">
          <span className="sr-only">Comparison period</span>
          <select defaultValue="previous" aria-label="Comparison period" disabled>
            <option value="previous">Previous week</option>
          </select>
        </label>
      </div>
      <span className="filter-spacer" aria-hidden="true" />
      {editable && (
        <div className="canvas-toolbar-actions">
          <label className="filter-control add-widget-type">
            <span className="sr-only">Widget type to add</span>
            <select value={widgetKind} aria-label="Widget type to add" onChange={(event) => onWidgetKindChange(event.target.value as DashboardWidgetKind)}>
              {dashboardWidgetOptions.map((option) => <option key={option.kind} value={option.kind}>{option.label}</option>)}
            </select>
          </label>
          <button className="button button-add" id="add-widget" type="button" onClick={onAddWidget}>+ Add widget</button>
        </div>
      )}
    </section>
  );
}

function SourceTransactionsDialog({
  datum,
  state,
  onClose,
  onLoadMore,
  onRefresh,
}: {
  datum: SelectedDatum;
  state: SourceDialogState;
  onClose: () => void;
  onLoadMore: () => void;
  onRefresh: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const pages = state.status === 'ready' || state.status === 'loading-more' ? state.pages : [];
  const rows: SourceTransaction[] = pages.flatMap((page) => page.items);
  const latestPage = pages.at(-1);

  useEffect(() => {
    closeRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) {
        event.preventDefault();
        closeRef.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const stateMessage = state.status === 'sample'
    ? 'This datum belongs to an illustrative sample fixture. No source transaction rows are connected to this preview.'
    : state.status === 'loading'
      ? `Requesting authorized source transactions for chart revision ${datum.response.ledger_revision}…`
      : state.status === 'unauthorized'
        ? 'Sign in to an authorized EasyLedger session to view source transactions. No rows were returned.'
        : state.status === 'stale'
          ? 'Chart data changed. Refresh the chart before opening source transactions. No rows are shown.'
          : state.status === 'error'
            ? 'Source transactions could not be loaded. No rows are shown; retry after refreshing the chart.'
            : null;

  return (
    <div className="source-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div
        ref={dialogRef}
        className="source-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="source-dialog-title"
        aria-describedby="source-dialog-context"
      >
        <header className="source-dialog-heading">
          <div>
            <h2 id="source-dialog-title">Source transactions</h2>
            <p id="source-dialog-context">{datum.label} · {datum.dimension === 'date' ? 'Date' : 'Product'} datum</p>
          </div>
          <button ref={closeRef} className="inspector-close" type="button" aria-label="Close source transactions" onClick={onClose}>
            <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false">
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </header>
        <p className="source-dialog-revision">{datum.isLive ? `Chart ledger revision ${datum.response.ledger_revision}` : 'Sample fixture only'}</p>
        {stateMessage && <p className={`source-dialog-message source-dialog-${state.status}`} role="status">{stateMessage}</p>}
        {state.status === 'stale' && <button className="button source-dialog-more" type="button" onClick={() => { onClose(); onRefresh(); }}>Refresh chart data</button>}
        {rows.length > 0 && (
          <>
            <div className="source-dialog-table-wrap">
              <table className="source-dialog-table">
                <caption>{rows.length} authorized transaction{rows.length === 1 ? '' : 's'} · exact minor-unit amounts</caption>
                <thead><tr><th>Date</th><th>Product</th><th>Quantity</th><th>Unit price</th><th>Line revenue</th><th>Transaction</th></tr></thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.sale_date}</td>
                      <td>{row.product_name}</td>
                      <td>{new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(BigInt(row.quantity))}</td>
                      <td>{row.unit_price === null ? 'Unknown' : formatMoneyMinor(row.unit_price, row.currency)}</td>
                      <td>{row.line_revenue === null ? 'Unknown' : formatMoneyMinor(row.line_revenue, row.currency)}</td>
                      <td><code>{row.id}</code></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {latestPage?.has_more && (
              <button className="button source-dialog-more" type="button" onClick={onLoadMore} disabled={state.status === 'loading-more'}>
                {state.status === 'loading-more' ? 'Loading…' : 'Load more transactions'}
              </button>
            )}
          </>
        )}
        {state.status === 'ready' && rows.length === 0 && (
          <p className="source-dialog-message" role="status">No source transactions match this chart datum and its filters.</p>
        )}
      </div>
    </div>
  );
}

function Inspector({
  widget,
  mode,
  canMoveLeft,
  canMoveRight,
  canMoveUp,
  canMoveDown,
  onClose,
  onTitleChange,
  onKindChange,
  onStyleChange,
  onMove,
  onApplyPreset,
  onRemove,
}: {
  widget: WidgetSelection | null;
  mode: DashboardMode;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onClose: () => void;
  onTitleChange: (id: string, title: string) => void;
  onKindChange: (id: string, kind: DashboardWidgetKind) => void;
  onStyleChange: (id: string, style: DashboardWidgetStyle) => void;
  onMove: (id: string, direction: 'left' | 'right' | 'up' | 'down') => void;
  onApplyPreset: (id: string, preset: LayoutSizePreset) => void;
  onRemove: (id: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<'setup' | 'style'>('setup');
  useEffect(() => { setActiveTab('setup'); }, [widget?.id, mode]);
  if (!widget) return null;
  const isEditing = mode === 'editing';
  const editChoices = dashboardWidgetKindsForType(widget.type).map((kind) => createDashboardWidget(kind, `choice-${kind}`));
  const metrics = [...new Set(editChoices.map((choice) => choice.metric))];
  const dimensions = [...new Set(editChoices.filter((choice) => choice.metric === widget.metric).map((choice) => choice.dimension))];
  const completeness = widget.data
    ? widget.metric === 'Units sold'
      ? widget.data.has_unknown_prices
        ? 'Quantities include sales with unknown prices'
        : 'Quantities contain no unknown-price sales'
      : widget.data.has_unknown_prices ? 'Revenue incomplete · unknown prices present' : 'Revenue complete'
    : 'Illustrative only · not read from the API';
  const closeAndRestoreFocus = () => {
    onClose();
    window.requestAnimationFrame(() => document.getElementById(`widget-${widget.id}`)?.focus());
  };
  const selectMetric = (metric: string) => {
    const choice = editChoices.find((candidate) => candidate.metric === metric);
    if (choice) onKindChange(widget.id, choice.kind);
  };
  const selectDimension = (dimension: string) => {
    const choice = editChoices.find((candidate) => candidate.dimension === dimension && candidate.metric === widget.metric);
    if (choice) onKindChange(widget.id, choice.kind);
  };
  const fallbackTitle = createDashboardWidget(widget.kind, widget.id).title;
  const typeOptions: ReadonlyArray<{ type: DashboardWidgetType; label: string }> = [
    { type: 'Line chart', label: 'Line' },
    { type: 'Bar chart', label: 'Bar' },
    { type: 'KPI', label: 'KPI' },
  ];
  const metricLabel = (metric: DashboardWidgetMetric) => metric === 'Revenue' ? 'Known-price revenue' : metric;

  return (
    <aside className="inspector" aria-label={`${widget.title} widget properties`} aria-labelledby="inspector-title">
      <header className="inspector-heading">
        <div>
          <h2 id="inspector-title">Widget properties</h2>
          <p>{widget.title}</p>
        </div>
        <button className="inspector-close" type="button" aria-label="Close widget properties" onClick={closeAndRestoreFocus}>
          <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false">
            <path d="M5 5l10 10M15 5L5 15" />
          </svg>
        </button>
      </header>

      <section className="inspector-sample" aria-label={widget.dataSource === 'live' ? 'Live data status' : 'Sample data status'}>
        <strong>{widget.dataSource === 'live' ? 'Live ledger data' : 'Sample data'}</strong>
        <p>{widget.dataSource === 'live'
          ? 'Values were returned by the authenticated analytics API. Source rows require the same ledger revision.'
          : widget.data ? 'This widget is not connected to a live ledger.' : 'Coverage values are examples and are not connected to day coverage.'}</p>
      </section>

      {isEditing ? (
        <>
          <div className="inspector-tabs" role="tablist" aria-label="Widget settings">
            <button className={`inspector-tab${activeTab === 'setup' ? ' inspector-tab-active' : ''}`} type="button" role="tab" aria-selected={activeTab === 'setup'} onClick={() => setActiveTab('setup')}>Setup</button>
            <button className={`inspector-tab${activeTab === 'style' ? ' inspector-tab-active' : ''}`} type="button" role="tab" aria-selected={activeTab === 'style'} onClick={() => setActiveTab('style')}>Style</button>
          </div>

          {activeTab === 'setup' ? (
            <>
              <label className="inspector-field">
                <span>Widget title</span>
                <input
                  type="text"
                  value={widget.title}
                  maxLength={80}
                  aria-label="Widget title"
                  onChange={(event) => onTitleChange(widget.id, event.target.value)}
                  onBlur={() => onTitleChange(widget.id, sanitizeDashboardWidgetTitle(widget.title, fallbackTitle))}
                />
              </label>

              <fieldset className="chart-type-field">
                <legend>Chart type</legend>
                <div className="chart-type-options">
                  {typeOptions.map(({ type, label }) => (
                    <button
                      key={type}
                      className={widget.type === type ? 'chart-type-active' : ''}
                      type="button"
                      aria-pressed={widget.type === type}
                      onClick={() => onKindChange(widget.id, dashboardWidgetKindForType(type, widget.metric))}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </fieldset>

              <label className="inspector-field inspector-select-field">
                <span>Metric</span>
                <select aria-label="Metric" value={widget.metric} disabled={metrics.length < 2} onChange={(event) => selectMetric(event.target.value)}>
                  {metrics.map((metric) => <option key={metric} value={metric}>{metricLabel(metric)}</option>)}
                </select>
              </label>

              <label className="inspector-field inspector-select-field">
                <span>Group by</span>
                <select aria-label="Group by" value={widget.dimension} disabled={dimensions.length < 2} onChange={(event) => selectDimension(event.target.value)}>
                  {dimensions.map((dimension) => <option key={dimension} value={dimension}>{dimension}</option>)}
                </select>
              </label>

              <section className="inspector-rules" aria-label="Supported data mapping">
                <h3>Supported data mapping</h3>
                <p>{widget.metric === 'Day completeness'
                  ? 'Illustrative sample only. Live day coverage is not available for this widget.'
                  : widget.metric === 'Revenue'
                    ? widget.dimension === 'Day'
                      ? 'Known-price revenue by day excludes unknown-price sales and preserves open gaps and confirmed zero days.'
                      : 'This KPI uses the known-price revenue total; unknown-price sales are excluded.'
                    : 'Units include sales with unknown prices. This view uses the returned analytics query and revision.'}</p>
              </section>
            </>
          ) : (
            <fieldset className="chart-type-field widget-style-field">
              <legend>Widget card style</legend>
              <div className="chart-type-options widget-style-options">
                <button className={widget.style === 'sage' ? 'chart-type-active' : ''} type="button" aria-pressed={widget.style === 'sage'} onClick={() => onStyleChange(widget.id, 'sage')}>Sage</button>
                <button className={widget.style === 'warm' ? 'chart-type-active' : ''} type="button" aria-pressed={widget.style === 'warm'} onClick={() => onStyleChange(widget.id, 'warm')}>Warm paper</button>
              </div>
              <p className="inspector-preview-note">Both styles use EasyLedger’s existing sage and warm paper palette.</p>
            </fieldset>
          )}

          <section className="position-controls" aria-label="Widget position">
            <h3>Position &amp; Order</h3>
            <div className="position-buttons-grid">
              <button type="button" disabled={!canMoveLeft} onClick={() => onMove(widget.id, 'left')}>Move left</button>
              <button type="button" disabled={!canMoveRight} onClick={() => onMove(widget.id, 'right')}>Move right</button>
              <button type="button" disabled={!canMoveUp} onClick={() => onMove(widget.id, 'up')} aria-label={`Move ${widget.title} up`}>Move up</button>
              <button type="button" disabled={!canMoveDown} onClick={() => onMove(widget.id, 'down')} aria-label={`Move ${widget.title} down`}>Move down</button>
            </div>
          </section>

          <section className="position-controls size-presets-controls" aria-label="Widget size presets">
            <h3>Size Presets (Mobile &amp; Touch)</h3>
            <div className="preset-buttons-group">
              <button type="button" onClick={() => onApplyPreset(widget.id, 'compact')}>Compact</button>
              <button type="button" onClick={() => onApplyPreset(widget.id, 'standard')}>Standard</button>
              <button type="button" onClick={() => onApplyPreset(widget.id, 'expanded')}>Full Width</button>
            </div>
          </section>

          <section className="inspector-source" aria-label={widget.dataSource === 'live' ? 'Connected ledger source' : 'Sample widget source'}>
            <h3>{widget.dataSource === 'live' ? 'Connected to your ledger' : 'Sample widget source'}</h3>
            <p>{widget.data
              ? `${widget.dataSource === 'live' ? 'Ledger' : 'Sample fixture'} revision ${widget.data.ledger_revision} · same query filters.`
              : 'Sample fixture · no live day coverage revision.'}</p>
            <p>Widget changes stay in this local draft.</p>
          </section>

          <button className="remove-widget" type="button" onClick={() => onRemove(widget.id)}>Remove widget</button>
        </>
      ) : (
        <>
          <dl className="inspector-properties">
            <div><dt>Title</dt><dd>{widget.title}</dd></div>
            <div><dt>Widget type</dt><dd>{widget.type}</dd></div>
            <div><dt>Metric</dt><dd>{widget.metric}</dd></div>
            <div><dt>Group by</dt><dd>{widget.dimension}</dd></div>
            <div><dt>Currency</dt><dd>{widget.data?.currency ?? 'Not applicable'}</dd></div>
            <div><dt>Completeness</dt><dd>{completeness}</dd></div>
            <div><dt>Revision</dt><dd>{widget.data ? `${widget.dataSource === 'live' ? 'Ledger' : 'Sample fixture'} · ${widget.data.ledger_revision}` : 'No API revision'}</dd></div>
          </dl>

          <section className="inspector-rules" aria-label={widget.dataSource === 'live' ? 'How live values are shown' : 'How this sample is shown'}>
            <h3>How values are shown</h3>
            <p>{widget.data
              ? 'Open no-sale days are gaps; complete no-sale days show 0. Unknown-price sales are flagged separately and excluded from known-price revenue.'
              : '5 of 7 days are shown as an illustrative sample. The analytics response does not provide day coverage.'}</p>
          </section>

          <p className="inspector-preview-note">Layout changes stay in this local draft. They do not change sales or save to an account.</p>
        </>
      )}
    </aside>
  );
}

function Dashboard({
  widget,
  mode,
  onSelect,
  onClose,
  analytics,
  liveStatus,
  onRefresh,
  voiceControl,
  voiceDashboardDraft,
}: {
  widget: WidgetSelection | null;
  mode: DashboardMode;
  onSelect: (widget: WidgetSelection) => void;
  onClose: () => void;
  analytics: DashboardAnalytics | null;
  liveStatus: 'checking' | 'live' | 'unauthorized' | 'unavailable';
  onRefresh: () => void;
  voiceControl: ReturnType<typeof useVoiceAgent>;
  voiceDashboardDraft: VoiceDashboardDraft | null;
}) {
  const [widgets, setWidgets] = useState(initialWidgetSelections);
  const [layout, setLayout] = useState<DashboardLayoutItem[]>(createInitialDashboardLayout);
  const [newWidgetKind, setNewWidgetKind] = useState<DashboardWidgetKind>('revenue-kpi');
  const [unsupportedVoiceWidgets, setUnsupportedVoiceWidgets] = useState<Array<{ id: string; title: string }>>([]);
  const nextWidgetSequence = useRef(1);
  const { width: gridWidth, containerRef: gridContainerRef, mounted: gridMounted } = useContainerWidth({ initialWidth: 920 });
  // RGL's nullable element generic differs from @types/react 18's ref type; both use the same runtime ref contract.
  const gridContainerRefForReact18 = gridContainerRef as unknown as RefObject<HTMLDivElement>;
  const isEditing = mode === 'editing';
  const isLive = analytics !== null;
  const revenueData = analytics?.totalRevenue ?? sampleTotalRevenue;
  const unitsData = analytics?.totalUnits ?? sampleTotalUnits;
  const lineData = analytics?.revenue ?? sampleDailyRevenue;
  const productData = analytics?.products ?? sampleProductUnits;
  const widgetIds = useMemo(() => widgets.map((item) => item.id), [widgets]);
  const gridLayout = useMemo<Layout>(() => {
    const normalized = normalizeDashboardLayout(layout, widgetIds);
    return isEditing ? normalized : computePreviewLayout(normalized, widgets);
  }, [isEditing, layout, widgetIds, widgets]);
  const layoutPositions = useMemo(() => new Map(gridLayout.map((item) => [item.i, item])), [gridLayout]);
  const orderedWidgets = useMemo(() => [...widgets].sort((left, right) => {
    const leftPosition = layoutPositions.get(left.id);
    const rightPosition = layoutPositions.get(right.id);
    if (!leftPosition || !rightPosition) return 0;
    return leftPosition.y - rightPosition.y || leftPosition.x - rightPosition.x;
  }), [widgets, layoutPositions]);
  const isDesktopGrid = gridMounted && gridWidth >= 720;

  useEffect(() => {
    if (!voiceDashboardDraft) return;
    const mapped = mapVoiceDashboardDraft(voiceDashboardDraft);
    setWidgets(mapped.widgets.map((item) => ({
      ...item,
      data: sampleDataForWidget(item.kind),
      dataSource: 'sample',
    })));
    setLayout(mapped.layout);
    setUnsupportedVoiceWidgets(mapped.unsupportedWidgets.map(({ id, title }) => ({ id, title })));
  }, [voiceDashboardDraft]);
  const handleLayoutChange = useCallback((nextLayout: Layout) => {
    if (!isEditing) return;
    const normalized = normalizeDashboardLayout(nextLayout, widgetIds);
    setLayout((current) => dashboardLayoutsEqual(current, normalized) ? current : normalized);
  }, [isEditing, widgetIds]);

  const dataForWidget = (item: DashboardWidgetDefinition): AnalyticsQueryResponse | null => {
    switch (item.kind) {
      case 'revenue-kpi': return revenueData;
      case 'units-kpi': return unitsData;
      case 'daily-revenue': return lineData;
      case 'product-sales': return productData;
      case 'complete-days': return null;
    }
  };
  const currentSelection = (item: WidgetSelection): WidgetSelection => ({
    ...item,
    data: dataForWidget(item),
    dataSource: item.kind === 'complete-days' ? 'sample' : isLive ? 'live' : 'sample',
  });
  const selectedDefinition = widget ? widgets.find((item) => item.id === widget.id) ?? null : null;
  const currentWidget = selectedDefinition ? currentSelection(selectedDefinition) : null;
  const [selectedDatum, setSelectedDatum] = useState<SelectedDatum | null>(null);
  const [sourceState, setSourceState] = useState<SourceDialogState | null>(null);
  const drilldownRequest = useRef(0);
  const revenueNote = revenueData.has_unknown_prices
    ? 'Known-price revenue · unknown prices excluded'
    : 'Known-price revenue';
  const unitsNote = unitsData.has_unknown_prices
    ? 'Includes sales with unknown prices'
    : 'Complete quantity total';
  const selectWidget = (selection: WidgetSelection) => {
    onSelect(currentSelection(selection));
  };

  const addWidget = () => {
    if (!isEditing) return;
    const nextId = createUniqueDashboardWidgetId(widgetIds, nextWidgetSequence.current);
    nextWidgetSequence.current = nextId.nextSequence;
    const definition = createDashboardWidget(newWidgetKind, nextId.id);
    setWidgets((current) => {
      const ordinal = current.filter((item) => item.kind === newWidgetKind).length + 1;
      return [...current, {
        ...createDashboardWidget(newWidgetKind, nextId.id, ordinal),
        data: sampleDataForWidget(newWidgetKind),
        dataSource: 'sample',
      }];
    });
    setLayout((current) => [...current, createAppendedDashboardLayoutItem(current, definition)]);
    window.requestAnimationFrame(() => document.getElementById(`widget-${nextId.id}`)?.focus());
  };

  const removeWidget = (id: string) => {
    if (!isEditing) return;
    setWidgets((current) => current.filter((item) => item.id !== id));
    setLayout((current) => removeDashboardLayoutItem(current, id));
    if (widget?.id === id) onClose();
    window.requestAnimationFrame(() => document.getElementById('add-widget')?.focus());
  };

  const changeWidgetTitle = (id: string, title: string) => {
    if (!isEditing) return;
    setWidgets((current) => current.map((item) => item.id === id ? { ...item, title } : item));
  };

  const changeWidgetKind = (id: string, kind: DashboardWidgetKind) => {
    if (!isEditing) return;
    const existingWidget = widgets.find((item) => item.id === id);
    if (!existingWidget) return;
    setLayout((layoutItems) => updateDashboardLayoutForWidgetKind(layoutItems, id, existingWidget.kind, kind));
    setWidgets((currentWidgets) => currentWidgets.map((item) => item.id === id ? reconfigureDashboardWidget(item, kind) as WidgetSelection : item));
  };

  const changeWidgetStyle = (id: string, style: DashboardWidgetStyle) => {
    if (!isEditing) return;
    setWidgets((current) => current.map((item) => item.id === id ? { ...item, style } : item));
  };

  const moveWidget = (id: string, direction: 'left' | 'right' | 'up' | 'down') => {
    if (!isEditing) return;
    setLayout((current) => moveDashboardLayoutItem(current, id, direction));
  };

  const applySizePreset = (id: string, preset: LayoutSizePreset) => {
    if (!isEditing) return;
    setLayout((current) => applyLayoutSizePreset(current, id, preset, 12));
  };

  const canMoveSelectedWidget = (direction: 'left' | 'right' | 'up' | 'down') => currentWidget !== null
    && canMoveDashboardLayoutItem(layout, currentWidget.id, direction);

  const renderWidget = (item: WidgetSelection) => {
    const selection = currentSelection(item);
    const selected = widget?.id === item.id;
    let content: ReactNode;
    switch (item.kind) {
      case 'revenue-kpi':
        content = <MetricCard widget={selection} value={formatAnalyticsTotal(revenueData)} note={revenueNote} tone="revenue" selected={selected} onSelect={selectWidget} />;
        break;
      case 'units-kpi':
        content = <MetricCard widget={selection} value={formatAnalyticsTotal(unitsData)} note={unitsNote} tone="units" selected={selected} onSelect={selectWidget} />;
        break;
      case 'complete-days':
        content = <MetricCard widget={selection} value="5 of 7" note="Example coverage values" tone="days" selected={selected} onSelect={selectWidget} />;
        break;
      case 'daily-revenue':
        content = <RevenueChart widget={selection} data={lineData} isLive={isLive} selected={selected} onSelect={selectWidget} onDatumSelect={openDatum} />;
        break;
      case 'product-sales':
        content = <ProductChart widget={selection} data={productData} isLive={isLive} selected={selected} onSelect={selectWidget} onDatumSelect={openDatum} />;
        break;
    }
    return (
      <div className={`dashboard-widget-frame dashboard-widget-${item.kind}`} key={item.id}>
        <DashboardWidgetCard widget={selection} isEditing={isEditing} selected={selected} onRemove={removeWidget}>{content}</DashboardWidgetCard>
      </div>
    );
  };

  const openDatum = (dimension: 'date' | 'product', key: string, label: string, response: AnalyticsQueryResponse, focusTarget: HTMLElement | null) => {
    const selected = { dimension, key, label, response, focusTarget, isLive };
    setSelectedDatum(selected);
    const requestId = ++drilldownRequest.current;
    if (!isLive) {
      setSourceState({ status: 'sample' });
      return;
    }
    setSourceState({ status: 'loading' });
    const request = buildSourceTransactionsRequest(response, dimension, key);
    void fetchSourceTransactions(request).then((page) => {
      if (requestId === drilldownRequest.current) setSourceState({ status: 'ready', pages: [page] });
    }).catch((error: unknown) => {
      if (requestId !== drilldownRequest.current) return;
      setSourceState({
        status: error instanceof AnalyticsHttpError
          ? error.status === 401 ? 'unauthorized' : error.status === 409 ? 'stale' : 'error'
          : 'error',
      });
    });
  };

  const closeSourceDialog = useCallback(() => {
    drilldownRequest.current += 1;
    const focusTarget = selectedDatum?.focusTarget;
    setSelectedDatum(null);
    setSourceState(null);
    window.requestAnimationFrame(() => focusTarget?.focus());
  }, [selectedDatum]);

  const loadMore = () => {
    if (!selectedDatum || sourceState?.status !== 'ready') return;
    const pages = sourceState.pages;
    const cursor = pages.at(-1)?.next_cursor;
    if (!cursor || !pages.at(-1)?.has_more) return;
    const requestId = ++drilldownRequest.current;
    setSourceState({ status: 'loading-more', pages });
    const request = buildSourceTransactionsRequest(selectedDatum.response, selectedDatum.dimension, selectedDatum.key, cursor);
    void fetchSourceTransactions(request).then((page) => {
      if (requestId === drilldownRequest.current) setSourceState({ status: 'ready', pages: [...pages, page] });
    }).catch((error: unknown) => {
      if (requestId !== drilldownRequest.current) return;
      setSourceState({
        status: error instanceof AnalyticsHttpError
          ? error.status === 401 ? 'unauthorized' : error.status === 409 ? 'stale' : 'error'
          : 'error',
      });
    });
  };

  return (
    <div className={`editor-body${currentWidget ? ' inspector-open' : ' inspector-closed'} dashboard-mode-${mode}`}>
      <main className="canvas" id="dashboard">
        <div className="canvas-inner">
          <VoiceControl
            controller={voiceControl}
            headingId="voice-title"
            description="Try “show revenue this week”"
          />

          <DashboardFilters editable={isEditing} widgetKind={newWidgetKind} onWidgetKindChange={setNewWidgetKind} onAddWidget={addWidget} />
          <p className="layout-draft-note">{isEditing
            ? 'Widget and layout changes stay in this local draft. They do not change sales or save to an account.'
            : 'Preview mode is read-only. Switch to Editing mode to change this local dashboard draft.'}</p>

          {voiceDashboardDraft && (
            <p className="layout-draft-note voice-grid-source-note" role="status">
              Showing server draft version {voiceDashboardDraft.version}. Manual widget edits stay in this browser and do not change the server draft; the visible voice Save button saves the server draft.
            </p>
          )}
          {unsupportedVoiceWidgets.length > 0 && (
            <p className="layout-draft-note voice-grid-source-note" role="status">
              {unsupportedVoiceWidgets.length} server-draft widget{unsupportedVoiceWidgets.length === 1 ? '' : 's'} cannot be charted in this canvas: {unsupportedVoiceWidgets.map((item) => item.title || item.id).join(', ')}. The server draft details remain visible in the Ask EasyLedger card.
            </p>
          )}

          <div className={`dashboard-grid-container dashboard-grid-${mode}`} ref={gridContainerRefForReact18} aria-label={voiceDashboardDraft ? `Server dashboard draft version ${voiceDashboardDraft.version}` : isLive ? 'Live dashboard widgets' : 'Sample dashboard widgets'}>
            {widgets.length === 0
              ? <div className="dashboard-grid-empty" role="status">{isEditing ? 'No widgets in this draft. Choose a widget type above and add it to the dashboard.' : 'No widgets in this dashboard draft. Switch to Editing mode to add a widget.'}</div>
              : isDesktopGrid
                ? <ReactGridLayout
                  width={gridWidth}
                  layout={gridLayout}
                  gridConfig={{ cols: 12, rowHeight: 26, margin: [16, 16], containerPadding: [0, 0] }}
                  dragConfig={{ enabled: isEditing, bounded: true, handle: '.widget-drag-handle', cancel: 'button, a, input, select, textarea, details, summary' }}
                  resizeConfig={{ enabled: isEditing, handles: ['se'] }}
                  className="dashboard-widget-grid"
                  onLayoutChange={handleLayoutChange}
                >
                  {orderedWidgets.map(renderWidget)}
                </ReactGridLayout>
                : <div className="dashboard-widget-stack">{orderedWidgets.map(renderWidget)}</div>}
          </div>

          <aside className="quality-notice" aria-label={isLive ? 'Live data quality notice' : 'Sample data quality notice'}>
            <div>
              <strong>{isLive ? 'Live values, with price context' : 'Sample values, with price context'}</strong>
              <p><CompletenessNote data={lineData} isLive={isLive} /> Open no-sale days are gaps; complete no-sale days show 0.</p>
            </div>
            <span className="quality-sample-tag">{isLive ? 'Authenticated query' : 'Preview only'}</span>
          </aside>

          <section className="source-card" id="source-sales" tabIndex={-1} aria-labelledby="source-title">
            <div className="source-card-heading">
              <h2 id="source-title">{isLive ? 'Source transaction drilldown' : 'Source preview'}</h2>
              <span>{isLive ? `Ledger revision ${lineData.ledger_revision}` : 'Sample fixture · revision 142'}</span>
            </div>
            {isLive ? (
              <div className="source-summary source-summary-live">
                <div><strong>Chart date filters</strong><span>{lineData.filters.date_from ?? 'All dates'} – {lineData.filters.date_to ?? 'All dates'}</span></div>
                <div><strong>Exact chart revision</strong><span>{lineData.ledger_revision} · stale reads are rejected</span></div>
                <div><strong>Authorized rows</strong><span>Loaded only after selecting a datum</span></div>
              </div>
            ) : (
              <div className="source-summary">
                <div>
                  <strong>7 sample dates</strong>
                  <span>Values used in the line chart</span>
                </div>
                <div>
                  <strong>Product quantities</strong>
                  <span>Values used in the bar chart</span>
                </div>
                <div>
                  <strong>{formatAnalyticsTotal(sampleTotalRevenue)} known-price total</strong>
                  <span>{sampleTotalRevenue.currency} · sample only</span>
                </div>
              </div>
            )}
            <p className="source-helper">{isLive
              ? 'Select a point, bar, or text-table row to request owner-authorized source rows.'
                : liveStatus === 'checking'
                ? 'Checking for an authenticated ledger; sample values remain clearly labeled until all queries succeed.'
                : liveStatus === 'unauthorized'
                  ? 'Sign in to an authenticated session to connect live data. These rows are sample values only.'
                  : liveStatus === 'unavailable'
                    ? 'Live analytics could not be loaded. These sample values remain clearly labeled; retry the page after checking the connection.'
                    : 'Live source transactions are not connected in this preview.'}</p>
          </section>

          <p className="canvas-footer">{isEditing
            ? isDesktopGrid ? 'Drag a widget by its grip or resize from the lower-right corner.' : 'Widgets stack at this width; use the inspector to move them.'
            : 'Widget layout is read-only in Preview mode.'} Select a title for properties, or a datum for source details.</p>
        </div>
      </main>
      <Inspector
        widget={currentWidget}
        mode={mode}
        canMoveLeft={canMoveSelectedWidget('left')}
        canMoveRight={canMoveSelectedWidget('right')}
        canMoveUp={canMoveSelectedWidget('up')}
        canMoveDown={canMoveSelectedWidget('down')}
        onClose={onClose}
        onTitleChange={changeWidgetTitle}
        onKindChange={changeWidgetKind}
        onStyleChange={changeWidgetStyle}
        onMove={moveWidget}
        onApplyPreset={applySizePreset}
        onRemove={removeWidget}
      />
      {selectedDatum && sourceState && <SourceTransactionsDialog datum={selectedDatum} state={sourceState} onClose={closeSourceDialog} onLoadMore={loadMore} onRefresh={onRefresh} />}
    </div>
  );
}

function App() {
  const [activeNav, setActiveNav] = useState<'home' | 'dashboard' | 'ledger' | 'catalog'>('home');
  const [dashboardMode, setDashboardMode] = useState<DashboardMode>('preview');
  const [activeDashboardName, setActiveDashboardName] = useState('Weekly sales overview');
  const [catalogSection, setCatalogSection] = useState<CatalogSection>(null);
  const [selectedWidget, setSelectedWidget] = useState<WidgetSelection | null>(null);
  const [dashboardAnalytics, setDashboardAnalytics] = useState<DashboardAnalytics | null>(null);
  const [liveStatus, setLiveStatus] = useState<'checking' | 'live' | 'unauthorized' | 'unavailable'>('checking');
  const [refreshCount, setRefreshCount] = useState(0);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [currentMerchant, setCurrentMerchant] = useState<MerchantIdentity | null>(null);

  useEffect(() => {
    fetch('/api/v1/auth/session')
      .then((res) => res.json())
      .then((payload) => {
        if (payload.data?.authenticated && payload.data.business) {
          setCurrentMerchant(payload.data.business);
        }
      })
      .catch(() => {});
  }, []);
  const isLive = dashboardAnalytics !== null;
  const currency = dashboardAnalytics?.revenue.currency ?? sampleDailyRevenue.currency;
  const voiceControl = useVoiceAgent({
    onLedgerCommitted: () => setRefreshCount((count) => count + 1),
    onDashboardDraft: (draft) => {
      setActiveDashboardName(draft.name);
      setDashboardMode('editing');
      setActiveNav('dashboard');
      window.location.hash = 'dashboard';
    },
    onDashboardSaved: (dashboard) => {
      setActiveDashboardName(dashboard.name);
    },
  });

  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.replace('#', '').toLowerCase();
      if (hash.includes('ledger')) setActiveNav('ledger');
      else if (hash.includes('catalog')) setActiveNav('catalog');
      else if (hash.includes('dashboard') || hash === 'voice-title' || hash === 'add-widget') setActiveNav('dashboard');
      else setActiveNav('home');
    };
    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setDashboardAnalytics(null);
    setLiveStatus('checking');
    const { date_from: dateFrom, date_to: dateTo } = sampleDailyRevenue.filters;
    const filter = {
      ...(dateFrom ? { date_from: dateFrom } : {}),
      ...(dateTo ? { date_to: dateTo } : {}),
      product_ids: [],
    };
    void Promise.all([
      fetchAnalyticsQuery({ metric: 'revenue', dimension: 'date', ...filter }),
      fetchAnalyticsQuery({ metric: 'units', dimension: 'product', ...filter }),
      fetchAnalyticsQuery({ metric: 'revenue', dimension: 'none', ...filter }),
      fetchAnalyticsQuery({ metric: 'units', dimension: 'none', ...filter }),
    ]).then(([revenue, products, totalRevenue, totalUnits]) => {
      const revisions = new Set([revenue.ledger_revision, products.ledger_revision, totalRevenue.ledger_revision, totalUnits.ledger_revision]);
      if (revisions.size !== 1) throw new Error('Analytics responses do not share one ledger revision');
      if (cancelled) return;
      setDashboardAnalytics({ revenue, products, totalRevenue, totalUnits });
      setLiveStatus('live');
    }).catch((error: unknown) => {
      if (cancelled) return;
      setDashboardAnalytics(null);
      setLiveStatus(error instanceof AnalyticsHttpError && error.status === 401 ? 'unauthorized' : 'unavailable');
    });
    return () => { cancelled = true; };
  }, [refreshCount]);

  const closeInspector = () => setSelectedWidget(null);
  const refreshCharts = () => setRefreshCount((count) => count + 1);
  const catalogSectionTitle = catalogSection === 'all-products'
    ? 'All products'
    : catalogSection === 'needs-price'
    ? 'Needs a price'
    : 'Product catalog';
  const openDashboardFromHome = (dashboard: { id: string; name: string }, created: boolean) => {
    setActiveDashboardName(dashboard.name);
    setDashboardMode(created ? 'editing' : 'preview');
    setSelectedWidget(null);
    setActiveNav('dashboard');
    window.location.hash = 'dashboard';
  };
  const voiceActive = voiceControl.status === 'connecting'
    || voiceControl.status === 'listening'
    || voiceControl.status === 'processing';
  const voiceNeedsReview = Boolean(voiceControl.proposal || voiceControl.dashboardSave);
  const handleRailVoiceAction = () => {
    if (voiceActive) {
      voiceControl.stop();
      return;
    }
    voiceControl.start();
    if (activeNav === 'home') {
      setActiveNav('dashboard');
      window.location.hash = 'dashboard';
    }
  };
  const railVoiceLabel = voiceActive
    ? `Stop microphone and voice session (${voiceControl.status})`
    : voiceNeedsReview
    ? 'Review the pending EasyLedger action before starting voice'
    : `Start microphone and voice session (${voiceControl.status})`;

  return (
    <div className={`app-shell${activeNav === 'catalog' ? ' app-shell-catalog' : ''}${activeNav === 'home' ? ' app-shell-home' : ''}`}>
      <header className="builder-toolbar">
        <div className="rail-brand">
          <strong>EasyLedger</strong>
          <span>Sales, made clear.</span>
        </div>

        <nav className="primary-nav" aria-label="Primary navigation">
          <a
            className={`primary-link primary-link-home ${activeNav === 'home' ? 'primary-link-active' : ''}`}
            href="#home"
            onClick={() => setActiveNav('home')}
            aria-current={activeNav === 'home' ? 'page' : undefined}
          >
            <img className="home-primary-nav-icon" src="/assets/home-nav-home.svg" alt="" aria-hidden="true" />Home
          </a>
          <a
            className={`primary-link primary-link-dashboard ${activeNav === 'dashboard' ? 'primary-link-active' : ''}`}
            href="#dashboard"
            onClick={() => setActiveNav('dashboard')}
            aria-current={activeNav === 'dashboard' ? 'page' : undefined}
          >
            <Icon name="dashboard" size={16} />Dashboard
          </a>
          <a
            className={`primary-link primary-link-ledger ${activeNav === 'ledger' ? 'primary-link-active' : ''}`}
            href="#ledger"
            onClick={() => setActiveNav('ledger')}
            aria-current={activeNav === 'ledger' ? 'page' : undefined}
          >
            <Icon name="ledger" size={16} />Ledger
          </a>
          <a
            className={`primary-link primary-link-catalog ${activeNav === 'catalog' ? 'primary-link-active' : ''}`}
            href="#catalog"
            onClick={() => setActiveNav('catalog')}
            aria-current={activeNav === 'catalog' ? 'page' : undefined}
          >
            <Icon name="catalog" size={16} />Catalog
          </a>
        </nav>

        <span className="toolbar-space" aria-hidden="true" />

        <div className="builder-actions">
          {activeNav === 'dashboard' && (
            <>
              <span className="mode-pill" aria-label={isLive ? 'Live data status' : 'Sample data status'}>{isLive ? 'Live data' : 'Sample data'}</span>
              <button
                className="button button-preview"
                type="button"
                role="switch"
                aria-label={dashboardMode === 'editing' ? 'Editing mode' : 'Preview mode'}
                aria-checked={dashboardMode === 'editing'}
                aria-controls="dashboard"
                onClick={() => setDashboardMode((current) => current === 'preview' ? 'editing' : 'preview')}
              >
                <span className="mode-switch-label">{dashboardMode === 'editing' ? 'Editing mode' : 'Preview mode'}</span>
                <span className="mode-switch-track" aria-hidden="true"><span className="mode-switch-thumb" /></span>
              </button>
              <button className="button button-save" type="button" disabled title="Dashboard saving is not connected in this preview">Save unavailable</button>
            </>
          )}

          <div
            className="home-toolbar-workspace home-toolbar-workspace-clickable"
            aria-label="Current merchant workspace account"
            role="button"
            tabIndex={0}
            onClick={() => setAuthModalOpen(true)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setAuthModalOpen(true); }}
            title="Select merchant workspace or sign in"
          >
            <span className="home-toolbar-business">
              <span>{currentMerchant?.name ?? 'Sign In / Demo'}</span>
              <img src="/assets/home-chevron.svg" alt="" aria-hidden="true" />
            </span>
            <span className="home-toolbar-avatar" aria-hidden="true">
              {currentMerchant?.name ? currentMerchant.name.slice(0, 2).toUpperCase() : 'EL'}
            </span>
          </div>
        </div>
      </header>

      <div className={`dashboard-shell${activeNav === 'home' ? ' dashboard-shell-home' : ''}`}>
        <aside className="nav-rail" aria-label="Workspace shortcuts">
          <div className="rail-spacer-top" aria-hidden="true" />

          <nav className="rail-actions" aria-label="Workspace navigation">
            <a
              className={`rail-action ${activeNav === 'dashboard' ? 'rail-action-active' : ''}`}
              href="#dashboard"
              onClick={() => setActiveNav('dashboard')}
              aria-label="Dashboard canvas"
            >
              <Icon name="dashboard" size={activeNav === 'catalog' ? 16 : 18} />
            </a>
            <button
              className="rail-action rail-action-voice"
              type="button"
              aria-label={railVoiceLabel}
              title={railVoiceLabel}
              aria-pressed={voiceActive}
              disabled={!voiceActive && voiceNeedsReview}
              onClick={handleRailVoiceAction}
            >
              <Icon name="voice" size={activeNav === 'catalog' ? 16 : 18} />
            </button>
            {activeNav === 'dashboard' && dashboardMode === 'editing' && (
              <a className="rail-action" href="#add-widget" aria-label="Add widget">
                <Icon name="add" size={18} />
              </a>
            )}
            <a
              className={`rail-action ${activeNav === 'ledger' ? 'rail-action-active' : ''}`}
              href="#ledger"
              onClick={() => setActiveNav('ledger')}
              aria-label="Sales Ledger journal"
            >
              <Icon name="ledger" size={16} />
            </a>
            <a
              className={`rail-action ${activeNav === 'catalog' ? 'rail-action-active' : ''}`}
              href="#catalog"
              onClick={() => setActiveNav('catalog')}
              aria-label="Catalog"
              aria-current={activeNav === 'catalog' ? 'page' : undefined}
            >
              <Icon name="catalog" size={16} />
            </a>
          </nav>

          <div className="rail-spacer" aria-hidden="true" />

          <aside className="rail-help">
            {activeNav === 'catalog' ? (
              <>
                <strong>Your catalog</strong>
                <p>Your products, in one place.</p>
              </>
            ) : (
              <>
                <strong>Make it yours</strong>
                <p>{isLive ? 'Chart and KPI values use live ledger data.' : 'Chart and KPI values are sample data.'}</p>
                <p>{dashboardMode === 'editing'
                  ? 'Add, move, resize, and remove widgets in this local draft.'
                  : 'Dashboard widgets are read-only in Preview mode.'}</p>
              </>
            )}
          </aside>

          <section className="rail-footer" aria-label={isLive ? 'Authenticated workspace' : 'Sample workspace'}>
            <div className="rail-avatar" aria-hidden="true">EL</div>
            <div className="rail-workspace">
              <strong>{isLive ? 'Authenticated business' : 'Example business'}</strong>
              <span>{currency}{isLive ? ' · live' : ' · sample'}</span>
              {activeNav !== 'catalog' && (
                <span>{isLive ? 'Owner session connected' : liveStatus === 'unauthorized' ? 'Sign in to connect a ledger' : 'No live ledger connection'}</span>
              )}
            </div>
          </section>
        </aside>

        <div className="workspace">
          {activeNav === 'home' ? (
            <HomeWorkspace workspaceLabel="Example business" currency={currency} onOpenDashboard={openDashboardFromHome} />
          ) : (
            <>
          <header className="dashboard-header">
            <div className="dashboard-header-inner">
              <div className="dashboard-heading">
                <p className="breadcrumb">
                  {isLive ? 'Authenticated workspace' : 'Sample workspace'}{' '}
                  <span aria-hidden="true">/</span>{' '}
                  {activeNav === 'ledger' ? 'Ledger journal' : activeNav === 'catalog' ? 'Catalog' : `Dashboard ${dashboardMode} mode`}
                  {activeNav === 'catalog' && catalogSection !== null && (
                    <>
                      <span aria-hidden="true">/</span>{' '}
                      {catalogSectionTitle}
                    </>
                  )}
                </p>
                <h1>{activeNav === 'ledger' ? 'Sales Ledger Journal' : activeNav === 'catalog' ? catalogSectionTitle : activeDashboardName}</h1>
                <p>
                  {activeNav === 'catalog'
                    ? catalogSection === 'all-products'
                      ? '2 products · Product names and default prices'
                      : catalogSection === 'needs-price'
                      ? '0 products · Default price review'
                      : `${isLive ? 'Authenticated business' : 'Example business'} · ${currency} · Sample products`
                    : <>
                        {isLive ? 'Authenticated business' : 'Example business'}{' '}
                        <span aria-hidden="true">·</span> {currency}{' '}
                        <span aria-hidden="true">·</span>{' '}
                        {activeNav === 'ledger'
                          ? 'Daily sales transaction logs · Fixture revision 142'
                          : isLive
                          ? 'Live analytics data.'
                          : 'Sample data only.'}
                      </>}
                </p>
              </div>
              {activeNav === 'catalog' ? (
                <div className="catalog-status" aria-label="Catalog sample data status">
                  <strong>Sample preview</strong>
                  <span>Local sample values</span>
                </div>
              ) : (
                <div className="dashboard-status" aria-label="Dashboard data status">
                  <div className="saved-status">
                    <strong>
                      {isLive
                        ? 'Analytics connected'
                        : liveStatus === 'checking'
                        ? 'Checking connection'
                        : liveStatus === 'unauthorized'
                        ? 'Sign in required'
                        : 'Sample preview'}
                    </strong>
                    <span>
                      {isLive
                        ? 'Authenticated ledger queries'
                        : liveStatus === 'unauthorized'
                        ? 'No authorized session'
                        : liveStatus === 'checking'
                        ? 'Sample values remain labeled during check'
                        : 'Not connected to a live ledger'}
                    </span>
                  </div>
                  <div className="refreshed-status">
                    <strong>{isLive ? 'Live query snapshot' : 'Local sample values'}</strong>
                    <span>
                      {isLive
                        ? `Ledger revision ${dashboardAnalytics.revenue.ledger_revision}`
                        : 'Fixture revision 142 · example data'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </header>

          {activeNav === 'ledger' ? (
            <div className="editor-body inspector-closed">
              <main className="canvas" id="ledger">
                <div className="canvas-inner">
                  <LedgerJournal isLive={isLive} voiceControl={voiceControl} currency={currency} />
                </div>
              </main>
            </div>
          ) : activeNav === 'catalog' ? (
            <div className="editor-body catalog-editor-body">
              <main className="canvas catalog-canvas" id="catalog">
                <Catalog currency={currency} section={catalogSection} onSectionChange={setCatalogSection} voiceControl={voiceControl} />
              </main>
            </div>
          ) : (
            <Dashboard
              widget={selectedWidget}
              mode={dashboardMode}
              onSelect={setSelectedWidget}
              onClose={closeInspector}
              analytics={dashboardAnalytics}
              liveStatus={liveStatus}
              onRefresh={refreshCharts}
              voiceControl={voiceControl}
              voiceDashboardDraft={voiceControl.dashboardDraft}
            />
          )}
            </>
          )}
        </div>
      </div>
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onLoginSuccess={(business) => {
          setCurrentMerchant(business);
          setRefreshCount((c) => c + 1);
        }}
        currentBusiness={currentMerchant ?? undefined}
      />
    </div>
  );
}

export default App;
