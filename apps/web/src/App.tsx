import { useState } from 'react';
import type { EChartsOption } from 'echarts';
import EChart from './EChart';
import {
  escapeTooltipHtml,
  formatAnalyticsTotal,
  formatMoneyMinor,
  mapAnalyticsRowsToChart,
  sampleDailyRevenue,
  sampleProductUnits,
  sampleTotalRevenue,
  sampleTotalUnits,
} from './analytics';
import type { AnalyticsQueryResponse, ChartMapping, ChartPoint, LedgerCurrency } from './analytics';

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
}

const revenueByDate = mapAnalyticsRowsToChart(sampleDailyRevenue);
const unitsByProduct = mapAnalyticsRowsToChart(sampleProductUnits);

const revenueWidget: WidgetSelection = {
  id: 'total-revenue',
  title: 'Total revenue',
  type: 'KPI',
  metric: 'Revenue',
  dimension: 'None',
  data: sampleTotalRevenue,
};

const unitsWidget: WidgetSelection = {
  id: 'total-units',
  title: 'Units sold',
  type: 'KPI',
  metric: 'Units sold',
  dimension: 'None',
  data: sampleTotalUnits,
};

const dailyRevenueWidget: WidgetSelection = {
  id: 'daily-revenue',
  title: 'Daily revenue',
  type: 'Line chart',
  metric: 'Revenue',
  dimension: 'Day',
  data: sampleDailyRevenue,
};

const productSalesWidget: WidgetSelection = {
  id: 'sales-by-product',
  title: 'Sales by product',
  type: 'Bar chart',
  metric: 'Units sold',
  dimension: 'Product',
  data: sampleProductUnits,
};

const completeDaysWidget: WidgetSelection = {
  id: 'complete-days',
  title: 'Complete days',
  type: 'KPI',
  metric: 'Day completeness',
  dimension: 'Day',
  data: null,
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

const dailyRevenueOption = revenueChartOption(revenueByDate, sampleDailyRevenue.currency);
const productSalesOption = productChartOption(unitsByProduct);

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

function CompletenessNote({ data }: { data: AnalyticsQueryResponse }) {
  return data.has_unknown_prices
    ? <span className="sample-completeness">Some prices are unknown; known-price revenue excludes them.</span>
    : <span className="sample-completeness">Revenue is complete for this sample.</span>;
}

function RevenueChart({ selected, onSelect }: { selected: boolean; onSelect: (widget: WidgetSelection) => void }) {
  const chartMessage = revenueByDate.status === 'empty'
    ? 'No data for this sample.'
    : revenueByDate.status === 'unsupported-range'
      ? revenueByDate.reason
      : null;
  const points = isReady(revenueByDate) ? revenueByDate.points : [];

  return (
    <>
      <button
        id={`widget-${dailyRevenueWidget.id}`}
        className={`selected-widget widget-selectable${selected ? ' widget-selected' : ''}`}
        type="button"
        aria-label="Daily revenue line chart. Sample data. Open widget properties."
        aria-pressed={selected}
        onClick={() => onSelect(dailyRevenueWidget)}
      >
        <figure className="chart-card chart-card-line" aria-labelledby="daily-revenue-title">
          <div className="chart-card-heading">
            <div>
              <h3 id="daily-revenue-title">Daily revenue</h3>
              <p className="chart-subtitle">Sample · Known-price revenue · {sampleDailyRevenue.currency}</p>
            </div>
            {selected && <span className="selected-pill">Selected</span>}
          </div>
          {chartMessage
            ? <div className="chart-state chart-state-line">{chartMessage}</div>
            : <div className="chart-visual chart-visual-line"><EChart option={dailyRevenueOption} label="Daily known-price revenue line chart from 16 to 22 September 2026" /></div>}
          <p className="chart-data-note">Open no-sale days are gaps; complete no-sale days are zero. Unknown-price sales are labeled separately.</p>
        </figure>
      </button>
      <table className="sr-only">
        <caption>Sample daily revenue details</caption>
        <thead><tr><th>Date</th><th>Known-price revenue</th><th>Quantity</th><th>Day and price state</th></tr></thead>
        <tbody>
          {points.length === 0
            ? <tr><td colSpan={4}>{chartMessage ?? 'No data for this sample.'}</td></tr>
            : points.map((point) => (
              <tr key={point.key}>
                <td>{point.label}</td>
                <td>{point.state === 'gap'
                  ? 'No sale · open day · gap'
                  : point.state === 'confirmed-zero'
                    ? '0 · complete no-sale day'
                    : point.exactValue === null
                      ? 'Recorded sale · revenue unknown'
                      : `${formatMoneyMinor(point.exactValue, sampleDailyRevenue.currency)}${point.state === 'unknown-price' ? ' · some prices unknown' : ''}`}</td>
                <td>{point.quantity ?? 'No sales recorded'}</td>
                <td>{point.state === 'gap'
                  ? 'Open day · missing activity is unknown'
                  : point.state === 'confirmed-zero'
                    ? 'Complete day · confirmed no sales'
                    : point.state === 'unknown-price'
                      ? salesStateLabel(point, 'sales recorded · unknown-price revenue is excluded')
                      : salesStateLabel(point, 'sales recorded · prices known')}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </>
  );
}

function ProductChart({ selected, onSelect }: { selected: boolean; onSelect: (widget: WidgetSelection) => void }) {
  const chartMessage = unitsByProduct.status === 'empty'
    ? 'No data for this sample.'
    : unitsByProduct.status === 'unsupported-range'
      ? unitsByProduct.reason
      : null;
  const points = isReady(unitsByProduct) ? unitsByProduct.points : [];

  return (
    <>
      <button
        id={`widget-${productSalesWidget.id}`}
        className={`chart-card product-card widget-selectable${selected ? ' widget-selected' : ''}`}
        type="button"
        aria-label="Sales by product horizontal bar chart. Sample data. Open widget properties."
        aria-pressed={selected}
        onClick={() => onSelect(productSalesWidget)}
      >
        <figure aria-labelledby="product-chart-title">
          <div className="chart-card-heading product-card-heading">
            <div>
              <h3 id="product-chart-title">Sales by product</h3>
              <p className="chart-subtitle">Sample · Units sold</p>
            </div>
            {selected && <span className="selected-pill">Selected</span>}
          </div>
          {chartMessage
            ? <div className="chart-state chart-state-product">{chartMessage}</div>
            : <div className="chart-visual chart-visual-product"><EChart option={productSalesOption} label="Sample units sold by product horizontal bar chart" /></div>}
          <p className="product-card-footer">All sample quantities include rows with unknown prices</p>
        </figure>
      </button>
      <table className="sr-only">
        <caption>Sample units sold by product</caption>
        <thead><tr><th>Product</th><th>Units sold</th></tr></thead>
        <tbody>
          {points.length === 0
            ? <tr><td colSpan={2}>{chartMessage ?? 'No data for this sample.'}</td></tr>
            : points.map((point) => (
              <tr key={point.key}><td>{point.label}</td><td>{point.exactValue ?? 'No quantity'}</td></tr>
            ))}
        </tbody>
      </table>
    </>
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

      <section className="inspector-sample" aria-label="Sample data status">
        <strong>Sample data</strong>
        <p>{widget.data ? 'This widget is not connected to a live ledger.' : 'Coverage values are examples and are not connected to day coverage.'}</p>
      </section>

      <dl className="inspector-properties">
        <div><dt>Title</dt><dd>{widget.title}</dd></div>
        <div><dt>Widget type</dt><dd>{widget.type}</dd></div>
        <div><dt>Metric</dt><dd>{widget.metric}</dd></div>
        <div><dt>Group by</dt><dd>{widget.dimension}</dd></div>
        <div><dt>Currency</dt><dd>{widget.data?.currency ?? 'Not applicable'}</dd></div>
        <div><dt>Completeness</dt><dd>{completeness}</dd></div>
        <div><dt>Revision</dt><dd>{widget.data ? `Sample fixture · ${widget.data.ledger_revision}` : 'No API revision'}</dd></div>
      </dl>

      <section className="inspector-rules" aria-label="How this sample is shown">
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
}: {
  widget: WidgetSelection | null;
  onSelect: (widget: WidgetSelection) => void;
  onClose: () => void;
}) {
  const revenueNote = sampleTotalRevenue.has_unknown_prices
    ? 'Known-price revenue · unknown prices excluded'
    : 'Known-price revenue';
  const unitsNote = sampleTotalUnits.has_unknown_prices
    ? 'Includes sales with unknown prices'
    : 'Complete quantity total';

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

          <section className="stat-grid" aria-label="Sample weekly sales summary">
            <MetricCard
              widget={revenueWidget}
              value={formatAnalyticsTotal(sampleTotalRevenue)}
              note={revenueNote}
              tone="revenue"
              selected={widget?.id === revenueWidget.id}
              onSelect={onSelect}
            />
            <MetricCard
              widget={unitsWidget}
              value={formatAnalyticsTotal(sampleTotalUnits)}
              note={unitsNote}
              tone="units"
              selected={widget?.id === unitsWidget.id}
              onSelect={onSelect}
            />
            <MetricCard
              widget={completeDaysWidget}
              value="5 of 7"
              note="Example coverage values"
              tone="days"
              selected={widget?.id === completeDaysWidget.id}
              onSelect={onSelect}
            />
          </section>

          <section className="chart-grid" aria-label="Sample dashboard charts">
            <RevenueChart selected={widget?.id === dailyRevenueWidget.id} onSelect={onSelect} />
            <ProductChart selected={widget?.id === productSalesWidget.id} onSelect={onSelect} />
          </section>

          <aside className="quality-notice" aria-label="Sample data quality notice">
            <div>
              <strong>Sample values, with price context</strong>
              <p><CompletenessNote data={sampleDailyRevenue} /> Open no-sale days are gaps; complete no-sale days show 0.</p>
            </div>
            <span className="quality-sample-tag">Preview only</span>
          </aside>

          <section className="source-card" id="source-sales" tabIndex={-1} aria-labelledby="source-title">
            <div className="source-card-heading">
              <h2 id="source-title">Source preview</h2>
              <span>Sample fixture · revision 142</span>
            </div>
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
            <p className="source-helper">Live source transactions are not connected in this preview.</p>
          </section>

          <p className="canvas-footer">Select a chart or KPI to view its properties.</p>
        </div>
      </main>
      <Inspector widget={widget} onClose={onClose} />
    </div>
  );
}

function App() {
  const [selectedWidget, setSelectedWidget] = useState<WidgetSelection | null>(null);
  const closeInspector = () => setSelectedWidget(null);

  return (
    <div className="app-shell">
      <header className="builder-toolbar">
        <div className="rail-brand">
          <strong>EasyLedger</strong>
          <span>Sales, made clear.</span>
        </div>

        <nav className="primary-nav" aria-label="Primary navigation">
          <a className="primary-link primary-link-overview" href="#overview">
            <img src="/assets/nav-overview.svg" width="16" height="16" alt="" aria-hidden="true" />Overview
          </a>
          <a className="primary-link primary-link-ledger" href="#ledger">
            <img src="/assets/nav-ledger.svg" width="16" height="16" alt="" aria-hidden="true" />Ledger
          </a>
          <a className="primary-link primary-link-dashboard primary-link-active" href="#dashboard" aria-current="page">
            <img src="/assets/nav-dashboard.svg" width="16" height="16" alt="" aria-hidden="true" />Dashboard
          </a>
          <a className="primary-link primary-link-catalog" href="#catalog">
            <img src="/assets/nav-catalog.svg" width="16" height="16" alt="" aria-hidden="true" />Catalog
          </a>
        </nav>

        <span className="toolbar-space" aria-hidden="true" />

        <div className="builder-actions">
          <span className="mode-pill">Sample preview</span>
          <button className="button button-preview" type="button" disabled title="This dashboard is already in preview mode">Preview</button>
          <button className="button button-save" type="button" disabled title="Dashboard saving is not connected in this preview">Save unavailable</button>
        </div>
      </header>

      <div className="dashboard-shell">
        <aside className="nav-rail" aria-label="Dashboard builder shortcuts">
          <div className="rail-spacer-top" aria-hidden="true" />

          <nav className="rail-actions" aria-label="Builder actions">
            <a className="rail-action rail-action-active" href="#dashboard" aria-label="Dashboard canvas">
              <img src="/assets/rail-dashboard.svg" width="18" height="18" alt="" aria-hidden="true" />
            </a>
            <a className="rail-action" href="#voice-title" aria-label="Ask EasyLedger">
              <img src="/assets/rail-voice.svg" width="18" height="18" alt="" aria-hidden="true" />
            </a>
            <a className="rail-action" href="#add-widget" aria-label="Add widget">
              <img src="/assets/rail-add-widget.svg" width="18" height="18" alt="" aria-hidden="true" />
            </a>
            <a className="rail-action" href="#source-sales" aria-label="Source preview">
              <img src="/assets/rail-source-sales.svg" width="18" height="18" alt="" aria-hidden="true" />
            </a>
          </nav>

          <div className="rail-spacer" aria-hidden="true" />

          <aside className="rail-help">
            <strong>Make it yours</strong>
            <p>Chart and KPI values are sample data.</p>
            <p>Widget layout controls are unavailable.</p>
          </aside>

          <section className="rail-footer" aria-label="Sample workspace">
            <div className="rail-avatar" aria-hidden="true">EL</div>
            <div className="rail-workspace">
              <strong>Example business</strong>
              <span>IDR · sample</span>
              <span>No live ledger connection</span>
            </div>
          </section>
        </aside>

        <div className="workspace">
          <header className="dashboard-header">
            <div className="dashboard-header-inner">
              <div className="dashboard-heading">
                <p className="breadcrumb">Sample workspace <span aria-hidden="true">/</span> Dashboard preview</p>
                <h1>Weekly sales overview</h1>
                <p>Example business <span aria-hidden="true">·</span> IDR <span aria-hidden="true">·</span> Sample data only.</p>
              </div>
              <div className="dashboard-status" aria-label="Dashboard data status">
                <div className="saved-status">
                  <strong>Sample preview</strong>
                  <span>Not connected to a live ledger</span>
                </div>
                <div className="refreshed-status">
                  <strong>Local sample values</strong>
                  <span>Fixture revision 142 <i aria-hidden="true">·</i> example data</span>
                </div>
              </div>
            </div>
          </header>

          <Dashboard widget={selectedWidget} onSelect={setSelectedWidget} onClose={closeInspector} />
        </div>
      </div>
    </div>
  );
}

export default App;
