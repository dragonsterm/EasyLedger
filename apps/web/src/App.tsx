import { useCallback, useEffect, useRef, useState } from 'react';
import type { EChartsOption } from 'echarts';
import EChart from './EChart';
import LedgerJournal from './Ledger';
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

type WidgetType = 'Line chart' | 'Bar chart' | 'KPI';
type WidgetMetric = 'Revenue' | 'Units sold' | 'Day completeness';
type WidgetDimension = 'Day' | 'Product' | 'None';

interface WidgetSelection {
  id: string;
  title: string;
  type: WidgetType;
  metric: WidgetMetric;
  dimension: WidgetDimension;
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

const revenueWidget: WidgetSelection = {
  id: 'total-revenue',
  title: 'Total revenue',
  type: 'KPI',
  metric: 'Revenue',
  dimension: 'None',
  data: sampleTotalRevenue,
  dataSource: 'sample',
};

const unitsWidget: WidgetSelection = {
  id: 'total-units',
  title: 'Units sold',
  type: 'KPI',
  metric: 'Units sold',
  dimension: 'None',
  data: sampleTotalUnits,
  dataSource: 'sample',
};

const dailyRevenueWidget: WidgetSelection = {
  id: 'daily-revenue',
  title: 'Daily revenue',
  type: 'Line chart',
  metric: 'Revenue',
  dimension: 'Day',
  data: sampleDailyRevenue,
  dataSource: 'sample',
};

const productSalesWidget: WidgetSelection = {
  id: 'sales-by-product',
  title: 'Sales by product',
  type: 'Bar chart',
  metric: 'Units sold',
  dimension: 'Product',
  data: sampleProductUnits,
  dataSource: 'sample',
};

const completeDaysWidget: WidgetSelection = {
  id: 'complete-days',
  title: 'Complete days',
  type: 'KPI',
  metric: 'Day completeness',
  dimension: 'Day',
  data: null,
  dataSource: 'sample',
};

function isReady(mapping: ChartMapping): mapping is Extract<ChartMapping, { status: 'ready' }> {
  return mapping.status === 'ready';
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
  data,
  isLive,
  selected,
  onSelect,
  onDatumSelect,
}: {
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
  const openDatum = (index: number, focusTarget: HTMLElement | null) => {
    const point = points[index];
    if (point) onDatumSelect('date', point.key, point.label, data, focusTarget);
  };

  return (
    <div className="chart-column">
      <div className={`selected-widget${selected ? ' widget-selected' : ''}`}>
        <figure className="chart-card chart-card-line" aria-labelledby="daily-revenue-title">
          <div className="chart-card-heading">
            <div>
              <ChartTitleButton id={`widget-${dailyRevenueWidget.id}`} headingId="daily-revenue-title" title="Daily revenue" selected={selected} onClick={() => onSelect({ ...dailyRevenueWidget, data, dataSource: isLive ? 'live' : 'sample' })} />
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
              onDataPointClick={(index) => openDatum(index, document.getElementById(`widget-${dailyRevenueWidget.id}`))}
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
  data,
  isLive,
  selected,
  onSelect,
  onDatumSelect,
}: {
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
  const openDatum = (index: number, focusTarget: HTMLElement | null) => {
    const point = points[index];
    if (point) onDatumSelect('product', point.key, point.label, data, focusTarget);
  };

  return (
    <div className="chart-column">
      <article className={`chart-card product-card${selected ? ' widget-selected' : ''}`}>
        <figure aria-labelledby="product-chart-title">
          <div className="chart-card-heading product-card-heading">
            <div>
              <ChartTitleButton id={`widget-${productSalesWidget.id}`} headingId="product-chart-title" title="Sales by product" selected={selected} onClick={() => onSelect({ ...productSalesWidget, data, dataSource: isLive ? 'live' : 'sample' })} />
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
              onDataPointClick={(index) => openDatum(index, document.getElementById(`widget-${productSalesWidget.id}`))}
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

function DashboardFilters() {
  return (
    <section className="canvas-toolbar" aria-label="Dashboard filters and actions">
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
      <div className="canvas-toolbar-actions">
        <button className="button button-add" id="add-widget" type="button" disabled title="Widget creation is not connected in this preview">+ Add widget</button>
        <label className="zoom-control">
          <span className="sr-only">Canvas zoom</span>
          <select defaultValue="100" aria-label="Canvas zoom" disabled>
            <option value="100">100%</option>
          </select>
        </label>
      </div>
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

function Inspector({ widget, onClose }: { widget: WidgetSelection | null; onClose: () => void }) {
  if (!widget) return null;
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

      <p className="inspector-preview-note">Editing, arranging and saving are not enabled in this preview.</p>
    </aside>
  );
}

function Dashboard({
  widget,
  onSelect,
  onClose,
  analytics,
  liveStatus,
  onRefresh,
}: {
  widget: WidgetSelection | null;
  onSelect: (widget: WidgetSelection) => void;
  onClose: () => void;
  analytics: DashboardAnalytics | null;
  liveStatus: 'checking' | 'live' | 'unauthorized' | 'unavailable';
  onRefresh: () => void;
}) {
  const isLive = analytics !== null;
  const revenueData = analytics?.totalRevenue ?? sampleTotalRevenue;
  const unitsData = analytics?.totalUnits ?? sampleTotalUnits;
  const lineData = analytics?.revenue ?? sampleDailyRevenue;
  const productData = analytics?.products ?? sampleProductUnits;
  const currentWidget = widget
    ? {
      ...widget,
      data: widget.id === revenueWidget.id
        ? revenueData
        : widget.id === unitsWidget.id
          ? unitsData
          : widget.id === dailyRevenueWidget.id
            ? lineData
            : widget.id === productSalesWidget.id
              ? productData
              : null,
      dataSource: widget.id === completeDaysWidget.id ? 'sample' as const : isLive ? 'live' as const : 'sample' as const,
    }
    : null;
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
    const data = selection.id === revenueWidget.id
      ? revenueData
      : selection.id === unitsWidget.id
        ? unitsData
        : selection.id === dailyRevenueWidget.id
          ? lineData
          : selection.id === productSalesWidget.id
            ? productData
            : null;
    onSelect({ ...selection, data, dataSource: data && isLive ? 'live' : 'sample' });
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
    <div className={`editor-body${widget ? ' inspector-open' : ' inspector-closed'}`}>
      <main className="canvas" id="dashboard">
        <div className="canvas-inner">
          <section className="voice-card" aria-labelledby="voice-title">
            <img className="voice-icon" src="/assets/voice-waveform.svg" width="32" height="32" alt="" aria-hidden="true" />
            <div className="voice-copy">
              <h2 id="voice-title">Ask EasyLedger</h2>
              <p>Try “show revenue this week”</p>
            </div>
            <button className="voice-shortcut" type="button" aria-label="Voice controls are not connected in this preview" disabled>
              Voice preview only
            </button>
          </section>

          <DashboardFilters />

          <section className="stat-grid" aria-label={isLive ? 'Live sales summary with example coverage values' : 'Sample weekly sales summary'}>
            <MetricCard
              widget={revenueWidget}
              value={formatAnalyticsTotal(revenueData)}
              note={revenueNote}
              tone="revenue"
              selected={widget?.id === revenueWidget.id}
              onSelect={selectWidget}
            />
            <MetricCard
              widget={unitsWidget}
              value={formatAnalyticsTotal(unitsData)}
              note={unitsNote}
              tone="units"
              selected={widget?.id === unitsWidget.id}
              onSelect={selectWidget}
            />
            <MetricCard
              widget={completeDaysWidget}
              value="5 of 7"
              note="Example coverage values"
              tone="days"
              selected={widget?.id === completeDaysWidget.id}
              onSelect={selectWidget}
            />
          </section>

          <section className="chart-grid" aria-label={isLive ? 'Live dashboard charts' : 'Sample dashboard charts'}>
            <RevenueChart data={lineData} isLive={isLive} selected={widget?.id === dailyRevenueWidget.id} onSelect={selectWidget} onDatumSelect={openDatum} />
            <ProductChart data={productData} isLive={isLive} selected={widget?.id === productSalesWidget.id} onSelect={selectWidget} onDatumSelect={openDatum} />
          </section>

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

          <p className="canvas-footer">Select a chart or KPI title to view properties. Select a datum to open its source transaction details.</p>
        </div>
      </main>
      <Inspector widget={currentWidget} onClose={onClose} />
      {selectedDatum && sourceState && <SourceTransactionsDialog datum={selectedDatum} state={sourceState} onClose={closeSourceDialog} onLoadMore={loadMore} onRefresh={onRefresh} />}
    </div>
  );
}

function App() {
  const [activeNav, setActiveNav] = useState<'dashboard' | 'ledger' | 'catalog'>('dashboard');
  const [selectedWidget, setSelectedWidget] = useState<WidgetSelection | null>(null);
  const [dashboardAnalytics, setDashboardAnalytics] = useState<DashboardAnalytics | null>(null);
  const [liveStatus, setLiveStatus] = useState<'checking' | 'live' | 'unauthorized' | 'unavailable'>('checking');
  const [refreshCount, setRefreshCount] = useState(0);
  const isLive = dashboardAnalytics !== null;
  const currency = dashboardAnalytics?.revenue.currency ?? sampleDailyRevenue.currency;

  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.replace('#', '').toLowerCase();
      if (hash.includes('ledger')) setActiveNav('ledger');
      else if (hash.includes('catalog')) setActiveNav('catalog');
      else setActiveNav('dashboard');
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

  return (
    <div className="app-shell">
      <header className="builder-toolbar">
        <div className="rail-brand">
          <strong>EasyLedger</strong>
          <span>Sales, made clear.</span>
        </div>

        <nav className="primary-nav" aria-label="Primary navigation">
          <a
            className={`primary-link primary-link-dashboard ${activeNav === 'dashboard' ? 'primary-link-active' : ''}`}
            href="#dashboard"
            onClick={() => setActiveNav('dashboard')}
            aria-current={activeNav === 'dashboard' ? 'page' : undefined}
          >
            <img src="/assets/nav-dashboard.svg" width="16" height="16" alt="" aria-hidden="true" />Dashboard
          </a>
          <a
            className={`primary-link primary-link-ledger ${activeNav === 'ledger' ? 'primary-link-active' : ''}`}
            href="#ledger"
            onClick={() => setActiveNav('ledger')}
            aria-current={activeNav === 'ledger' ? 'page' : undefined}
          >
            <img src="/assets/nav-ledger.svg" width="16" height="16" alt="" aria-hidden="true" />Ledger
          </a>
          <a
            className={`primary-link primary-link-catalog ${activeNav === 'catalog' ? 'primary-link-active' : ''}`}
            href="#catalog"
            onClick={() => setActiveNav('catalog')}
            aria-current={activeNav === 'catalog' ? 'page' : undefined}
          >
            <img src="/assets/nav-catalog.svg" width="16" height="16" alt="" aria-hidden="true" />Catalog
          </a>
        </nav>

        <span className="toolbar-space" aria-hidden="true" />

        <div className="builder-actions">
          <span className="mode-pill">{isLive ? 'Live data · preview' : 'Sample preview'}</span>
          <button className="button button-preview" type="button" disabled title="This dashboard is already in preview mode">Preview</button>
          <button className="button button-save" type="button" disabled title="Dashboard saving is not connected in this preview">Save unavailable</button>
        </div>
      </header>

      <div className="dashboard-shell">
        <aside className="nav-rail" aria-label="Dashboard builder shortcuts">
          <div className="rail-spacer-top" aria-hidden="true" />

          <nav className="rail-actions" aria-label="Builder actions">
            <a
              className={`rail-action ${activeNav === 'dashboard' ? 'rail-action-active' : ''}`}
              href="#dashboard"
              onClick={() => setActiveNav('dashboard')}
              aria-label="Dashboard canvas"
            >
              <img src="/assets/rail-dashboard.svg" width="18" height="18" alt="" aria-hidden="true" />
            </a>
            <a
              className="rail-action"
              href="#voice-title"
              aria-label="Ask EasyLedger"
            >
              <img src="/assets/rail-voice.svg" width="18" height="18" alt="" aria-hidden="true" />
            </a>
            <a
              className="rail-action"
              href="#add-widget"
              aria-label="Add widget"
            >
              <img src="/assets/rail-add-widget.svg" width="18" height="18" alt="" aria-hidden="true" />
            </a>
            <a
              className={`rail-action ${activeNav === 'ledger' ? 'rail-action-active' : ''}`}
              href="#ledger"
              onClick={() => setActiveNav('ledger')}
              aria-label="Sales Ledger journal"
            >
              <img src="/assets/rail-source-sales.svg" width="18" height="18" alt="" aria-hidden="true" />
            </a>
          </nav>

          <div className="rail-spacer" aria-hidden="true" />

          <aside className="rail-help">
            <strong>Make it yours</strong>
            <p>{isLive ? 'Chart and KPI values use live ledger data.' : 'Chart and KPI values are sample data.'}</p>
            <p>Widget layout controls are unavailable.</p>
          </aside>

          <section className="rail-footer" aria-label={isLive ? 'Authenticated workspace' : 'Sample workspace'}>
            <div className="rail-avatar" aria-hidden="true">EL</div>
            <div className="rail-workspace">
              <strong>{isLive ? 'Authenticated business' : 'Example business'}</strong>
              <span>{currency}{isLive ? ' · live' : ' · sample'}</span>
              <span>{isLive ? 'Owner session connected' : liveStatus === 'unauthorized' ? 'Sign in to connect a ledger' : 'No live ledger connection'}</span>
            </div>
          </section>
        </aside>

        <div className="workspace">
          <header className="dashboard-header">
            <div className="dashboard-header-inner">
              <div className="dashboard-heading">
                <p className="breadcrumb">
                  {isLive ? 'Authenticated workspace' : 'Sample workspace'}{' '}
                  <span aria-hidden="true">/</span>{' '}
                  {activeNav === 'ledger' ? 'Ledger journal' : 'Dashboard preview'}
                </p>
                <h1>{activeNav === 'ledger' ? 'Sales Ledger Journal' : 'Weekly sales overview'}</h1>
                <p>
                  {isLive ? 'Authenticated business' : 'Example business'}{' '}
                  <span aria-hidden="true">·</span> {currency}{' '}
                  <span aria-hidden="true">·</span>{' '}
                  {activeNav === 'ledger'
                    ? 'Daily sales transaction logs · Fixture revision 142'
                    : isLive
                    ? 'Live analytics data.'
                    : 'Sample data only.'}
                </p>
              </div>
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
            </div>
          </header>

          {activeNav === 'ledger' ? (
            <div className="editor-body inspector-closed">
              <main className="canvas" id="ledger">
                <div className="canvas-inner">
                  <LedgerJournal isLive={isLive} />
                </div>
              </main>
            </div>
          ) : (
            <Dashboard
              widget={selectedWidget}
              onSelect={setSelectedWidget}
              onClose={closeInspector}
              analytics={dashboardAnalytics}
              liveStatus={liveStatus}
              onRefresh={refreshCharts}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
