type ChartDatum = {
  date: string;
  value: string;
  state: 'revenue' | 'gap' | 'zero';
  detail: string;
};

const chartData: ChartDatum[] = [
  { date: '16 Sep', value: 'Rp 520.000', state: 'revenue', detail: 'Known-price revenue' },
  { date: '17 Sep', value: 'Rp 820.000', state: 'revenue', detail: 'Known-price revenue' },
  { date: '18 Sep', value: 'Rp 620.000', state: 'revenue', detail: 'Known-price revenue' },
  { date: '19 Sep', value: 'Rp 1.060.000', state: 'revenue', detail: 'Known-price revenue · selected datum' },
  { date: '20 Sep', value: 'No data', state: 'gap', detail: 'Open day — no data (gap)' },
  { date: '21 Sep', value: 'Rp 0', state: 'zero', detail: 'Confirmed zero' },
  { date: '22 Sep', value: 'Rp 480.000', state: 'revenue', detail: 'Known-price revenue' },
];

const productBars = [
  { name: 'Orange Juice', units: 164, width: 100, tone: 'lime' },
  { name: 'Rice 5kg', units: 118, width: 72, tone: 'mint' },
  { name: 'Coffee', units: 88, width: 54, tone: 'coral' },
  { name: 'Other', units: 54, width: 33, tone: 'lavender' },
];

function StatCard({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone: 'revenue' | 'units' | 'days';
}) {
  return (
    <article className={'stat-card stat-card-' + tone}>
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      <p className="stat-note">{note}</p>
    </article>
  );
}

function LineChart() {
  return (
    <figure className="chart-card chart-card-line" aria-labelledby="daily-revenue-title">
      <div className="chart-card-heading">
        <div>
          <h3 id="daily-revenue-title">Daily revenue</h3>
          <p className="chart-subtitle">Known-price revenue · IDR</p>
        </div>
        <span className="selected-pill">Selected</span>
      </div>
      <img
        className="revenue-plot"
        src="/assets/daily-revenue-plot.svg"
        alt="Daily revenue from 16 to 22 September. The 20 September open day is a gap and 21 September is a confirmed zero."
        width="518"
        height="172"
      />
      <p className="chart-legend" id="daily-revenue-legend">
        <span className="legend-key legend-key-revenue" aria-hidden="true" />
        <span>Revenue</span>
        <span className="legend-key legend-key-zero" aria-hidden="true" />
        <span>Confirmed zero</span>
        <span className="legend-key legend-key-gap" aria-hidden="true" />
        <span>Open day — no data</span>
      </p>
      <table className="sr-only">
        <caption>Daily revenue details</caption>
        <thead><tr><th>Date</th><th>Value</th><th>State</th></tr></thead>
        <tbody>
          {chartData.map((datum) => (
            <tr key={datum.date}><td>{datum.date}</td><td>{datum.value}</td><td>{datum.detail}</td></tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function ProductChart() {
  return (
    <figure className="chart-card product-card" aria-labelledby="product-chart-title">
      <div className="chart-card-heading product-card-heading">
        <div>
          <h3 id="product-chart-title">Sales by product</h3>
          <p className="chart-subtitle">Units sold · select a bar to view rows</p>
        </div>
      </div>
      <div className="bar-list">
        {productBars.map((product) => (
          <button
            className="bar-row"
            type="button"
            key={product.name}
            aria-label={product.name + ', ' + product.units + ' units sold'}
          >
            <span className="bar-label">{product.name}</span>
            <span className="bar-track">
              <span className={'bar-fill bar-fill-' + product.tone} style={{ width: product.width + '%' }} />
            </span>
            <strong className="bar-value">{product.units}</strong>
          </button>
        ))}
      </div>
      <p className="product-card-footer">All sales remain visible</p>
    </figure>
  );
}

function SelectionHandles() {
  return (
    <div className="selection-handles" aria-hidden="true">
      <span className="selection-handle selection-handle-top-left" />
      <span className="selection-handle selection-handle-top-center" />
      <span className="selection-handle selection-handle-top-right" />
      <span className="selection-handle selection-handle-middle-left" />
      <span className="selection-handle selection-handle-middle-right" />
      <span className="selection-handle selection-handle-bottom-left" />
      <span className="selection-handle selection-handle-bottom-center" />
      <span className="selection-handle selection-handle-bottom-right" />
    </div>
  );
}

function DashboardFilters() {
  return (
    <section className="canvas-toolbar" aria-label="Dashboard filters and actions">
      <div className="filter-controls">
        <label className="filter-control">
          <span className="sr-only">Date range</span>
          <select defaultValue="week" aria-label="Date range">
            <option value="week">16–22 Sep 2026</option>
          </select>
        </label>
        <label className="filter-control">
          <span className="sr-only">Product filter</span>
          <select defaultValue="all" aria-label="Product filter">
            <option value="all">All products</option>
          </select>
        </label>
        <label className="filter-control">
          <span className="sr-only">Comparison period</span>
          <select defaultValue="previous" aria-label="Comparison period">
            <option value="previous">Previous week</option>
          </select>
        </label>
      </div>
      <span className="filter-spacer" aria-hidden="true" />
      <div className="canvas-toolbar-actions">
        <button className="button button-add" id="add-widget" type="button">+ Add widget</button>
        <label className="zoom-control">
          <span className="sr-only">Canvas zoom</span>
          <select defaultValue="100" aria-label="Canvas zoom">
            <option value="100">100%</option>
          </select>
        </label>
      </div>
    </section>
  );
}

function Inspector() {
  return (
    <aside className="inspector" aria-label="Selected widget properties">
      <header className="inspector-heading">
        <h2>Widget properties</h2>
        <p>Daily revenue</p>
      </header>

      <div className="inspector-tabs" role="tablist" aria-label="Widget property sections">
        <button className="inspector-tab inspector-tab-active" type="button" role="tab" aria-selected="true">Setup</button>
        <button className="inspector-tab" type="button" role="tab" aria-selected="false">Style</button>
      </div>

      <label className="inspector-field">
        <span>Widget title</span>
        <input type="text" defaultValue="Daily revenue" aria-label="Widget title" />
      </label>

      <fieldset className="chart-type-field">
        <legend>Chart type</legend>
        <div className="chart-type-options">
          <button type="button" className="chart-type-active" aria-pressed="true">Line</button>
          <button type="button" aria-pressed="false">Bar</button>
          <button type="button" aria-pressed="false">KPI</button>
        </div>
      </fieldset>

      <label className="inspector-field inspector-select-field">
        <span>Metric</span>
        <select defaultValue="known-revenue" aria-label="Metric">
          <option value="known-revenue">Known-price revenue</option>
        </select>
      </label>

      <label className="inspector-field inspector-select-field">
        <span>Group by</span>
        <select defaultValue="day" aria-label="Group by">
          <option value="day">Day</option>
        </select>
      </label>

      <section className="inspector-rules" aria-labelledby="data-rules-title">
        <h3 id="data-rules-title">Keep the full picture</h3>
        <dl>
          <div><dt>Open days</dt><dd>Show as gaps</dd></div>
          <div><dt>Confirmed zero</dt><dd>Keep at 0</dd></div>
          <div><dt>Unknown prices</dt><dd>Exclude from revenue</dd></div>
        </dl>
      </section>

      <section className="position-controls" aria-labelledby="position-title">
        <h3 id="position-title">Position</h3>
        <div>
          <button type="button">Move left</button>
          <button type="button">Move right</button>
        </div>
      </section>

      <section className="inspector-source">
        <h3>Connected to your ledger</h3>
        <p>Revision 142 · same filters</p>
        <p>Last refreshed at 09:42</p>
        <p>Changes here affect this widget.</p>
      </section>

      <button className="remove-widget" type="button">Remove widget</button>
    </aside>
  );
}

function App() {
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
          <span className="mode-pill">Editing</span>
          <button className="button button-preview" type="button">Preview</button>
          <button className="button button-save" type="button">Save changes</button>
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
            <a className="rail-action" href="#source-sales" aria-label="Source sales">
              <img src="/assets/rail-source-sales.svg" width="18" height="18" alt="" aria-hidden="true" />
            </a>
          </nav>

          <div className="rail-spacer" aria-hidden="true" />

          <aside className="rail-help">
            <strong>Make it yours</strong>
            <p>Drag cards to arrange your dashboard.</p>
            <p>Or use the inspector to move a widget.</p>
          </aside>

          <section className="rail-footer" aria-label="Account and workspace">
            <div className="rail-avatar" aria-hidden="true">KS</div>
            <div className="rail-workspace">
              <strong>Kedai Segar</strong>
              <span>IDR</span>
              <span>Workspace ready</span>
            </div>
          </section>
        </aside>

        <div className="workspace">
          <header className="dashboard-header">
            <div className="dashboard-header-inner">
              <div className="dashboard-heading">
                <p className="breadcrumb">Workspace <span aria-hidden="true">/</span> Dashboard builder</p>
                <h1>Weekly sales overview</h1>
                <p>Kedai Segar <span aria-hidden="true">·</span> IDR <span aria-hidden="true">·</span> Your week, at a glance.</p>
              </div>
              <div className="dashboard-status" aria-label="Dashboard status">
                <div className="saved-status">
                  <strong>Saved just now</strong>
                  <span>Dashboard up to date</span>
                </div>
                <div className="refreshed-status">
                  <strong>Refreshed 09:42</strong>
                  <span>Revision 142 <i aria-hidden="true">·</i> 5 of 7 days complete</span>
                </div>
              </div>
            </div>
          </header>

          <div className="editor-body">
            <main className="canvas" id="dashboard">
              <div className="canvas-inner">
                <section className="voice-card" aria-labelledby="voice-title">
                  <img className="voice-icon" src="/assets/voice-waveform.svg" width="32" height="32" alt="" aria-hidden="true" />
                  <div className="voice-copy">
                    <h2 id="voice-title">Ask EasyLedger</h2>
                    <p>Try “show revenue this week”</p>
                  </div>
                  <button className="voice-shortcut" type="button" aria-label="Voice status idle, press Space to listen">
                    Idle · Press Space
                  </button>
                </section>

                <DashboardFilters />

                <section className="stat-grid" aria-label="Weekly sales summary">
                  <StatCard label="Total revenue" value="Rp 3.480.000" note="Known-price sales · 2 rows excluded" tone="revenue" />
                  <StatCard label="Units sold" value="214" note="Includes sales with unknown prices" tone="units" />
                  <StatCard label="Complete days" value="5 of 7" note="2 days still open · gaps stay visible" tone="days" />
                </section>

                <section className="chart-grid" aria-label="Dashboard charts">
                  <div className="selected-widget" role="group" aria-label="Selected widget: Daily revenue">
                    <LineChart />
                    <SelectionHandles />
                  </div>
                  <ProductChart />
                </section>

                <aside className="quality-notice" aria-label="Data quality notice">
                  <div>
                    <strong>A little context for your numbers</strong>
                    <p>2 rows have no price. Open days stay as gaps; confirmed zero stays zero.</p>
                  </div>
                  <button className="view-ledger" type="button">View ledger</button>
                </aside>

                <section className="source-card" id="source-sales" tabIndex={-1} aria-labelledby="source-title">
                  <div className="source-card-heading">
                    <h2 id="source-title">Source sales</h2>
                    <span>Revision 142 · matched</span>
                  </div>
                  <div className="source-summary">
                    <div>
                      <strong>Orange Juice · 19 Sep</strong>
                      <span>Same filters as this dashboard</span>
                    </div>
                    <div>
                      <strong>2 authorized rows</strong>
                      <span>From your ledger</span>
                    </div>
                    <div>
                      <strong>IDR 240.000 total</strong>
                    </div>
                  </div>
                  <p className="source-helper">Select a chart point or bar to inspect the matching sales.</p>
                </section>

                <p className="canvas-footer">Select a widget to edit <span aria-hidden="true">·</span> Drag to arrange or use Position controls</p>
              </div>
            </main>

            <Inspector />
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
