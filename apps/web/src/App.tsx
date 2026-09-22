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
  { date: '19 Sep', value: 'Rp 1.180.000', state: 'revenue', detail: 'Known-price revenue · selected datum' },
  { date: '20 Sep', value: 'No data', state: 'gap', detail: 'Open day — no data (gap)' },
  { date: '21 Sep', value: 'Rp 0', state: 'zero', detail: 'Confirmed zero' },
  { date: '22 Sep', value: 'Rp 480.000', state: 'revenue', detail: 'Known-price revenue' },
];

const productBars = [
  { name: 'Orange Juice', units: 164, width: 100 },
  { name: 'Rice 5kg', units: 118, width: 72 },
  { name: 'Coffee', units: 88, width: 54 },
  { name: 'Other', units: 54, width: 33 },
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
  tone: 'purple' | 'blue' | 'green';
}) {
  return (
    <article className={`stat-card stat-card-${tone}`}>
      <div className="stat-card-topline">
        <span className="stat-label">{label}</span>
        <span className="stat-icon" aria-hidden="true">
          {tone === 'purple' ? '↗' : tone === 'blue' ? '◌' : '✓'}
        </span>
      </div>
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
          <p className="section-kicker">Trend</p>
          <h3 id="daily-revenue-title">Daily revenue</h3>
          <p className="chart-subtitle">Known-price revenue · IDR · 16–22 Sep 2026</p>
        </div>
        <button className="icon-button" type="button" aria-label="More actions for Daily revenue">
          •••
        </button>
      </div>

      <div className="line-chart-wrap">
        <svg className="line-chart" viewBox="0 0 720 238" role="img" aria-labelledby="daily-revenue-title daily-revenue-description">
          <title id="daily-revenue-description">Daily revenue chart with one open day gap and one confirmed zero day.</title>
          <g className="chart-grid-lines" aria-hidden="true">
            <line x1="52" y1="28" x2="696" y2="28" />
            <line x1="52" y1="78" x2="696" y2="78" />
            <line x1="52" y1="128" x2="696" y2="128" />
            <line x1="52" y1="178" x2="696" y2="178" />
            <line x1="52" y1="210" x2="696" y2="210" />
          </g>
          <g className="chart-axis-labels" aria-hidden="true">
            <text x="8" y="33">1.2m</text>
            <text x="8" y="83">800k</text>
            <text x="8" y="133">400k</text>
            <text x="20" y="215">0</text>
          </g>
          <path className="chart-line" d="M52 145 C103 132 136 105 158 112 C191 122 214 121 254 93 C289 68 318 80 350 67 C380 55 407 44 448 49" />
          <path className="chart-line chart-line-after-gap" d="M620 210 C644 190 670 171 696 166" />
          <g className="chart-data-markers" aria-hidden="true">
            <circle className="revenue-marker" cx="52" cy="145" r="5" />
            <circle className="revenue-marker" cx="158" cy="112" r="5" />
            <circle className="revenue-marker" cx="254" cy="93" r="5" />
            <circle className="selected-marker" cx="448" cy="49" r="7" />
            <line className="gap-stem" x1="535" y1="204" x2="535" y2="166" />
            <circle className="gap-marker" cx="535" cy="204" r="7" />
            <rect className="zero-marker" x="613" y="203" width="14" height="14" rx="2" />
            <circle className="revenue-marker" cx="696" cy="166" r="5" />
          </g>
          <g className="chart-annotations" aria-hidden="true">
            <text className="gap-annotation" x="499" y="153">Open day</text>
            <text className="gap-annotation" x="493" y="168">no data · gap</text>
            <text className="zero-annotation" x="575" y="191">Confirmed zero</text>
          </g>
          <g className="chart-x-labels" aria-hidden="true">
            <text x="42" y="232">16</text>
            <text x="148" y="232">17</text>
            <text x="244" y="232">18</text>
            <text x="438" y="232">19</text>
            <text x="525" y="232">20</text>
            <text x="607" y="232">21</text>
            <text x="686" y="232">22</text>
          </g>
        </svg>
        <button className="datum-hit datum-hit-selected" type="button" aria-label="Orange Juice revenue on 19 Sep, revision 142">
          <span className="sr-only">Selected datum: Orange Juice · 19 Sep · revision 142</span>
        </button>
        <button className="datum-hit datum-hit-gap" type="button" aria-label="Open day on 20 Sep with no data">
          <span className="sr-only">Open day — no data (gap) · 20 Sep</span>
        </button>
        <button className="datum-hit datum-hit-zero" type="button" aria-label="Confirmed zero on 21 Sep">
          <span className="sr-only">Confirmed zero · 21 Sep</span>
        </button>
      </div>

      <div className="chart-legend" aria-label="Chart legend">
        <span><i className="legend-symbol legend-revenue" aria-hidden="true" />Revenue</span>
        <span><i className="legend-symbol legend-zero" aria-hidden="true" />Confirmed zero</span>
        <span><i className="legend-symbol legend-gap" aria-hidden="true" />Open day — no data (gap)</span>
      </div>

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
      <div className="chart-card-heading">
        <div>
          <p className="section-kicker">Breakdown</p>
          <h3 id="product-chart-title">Sales by product</h3>
          <p className="chart-subtitle">Units sold · tap a bar to see ledger rows</p>
        </div>
        <button className="icon-button" type="button" aria-label="More actions for Sales by product">•••</button>
      </div>
      <div className="bar-list">
        {productBars.map((product, index) => (
          <button className={`bar-row ${index === 0 ? 'bar-row-selected' : ''}`} type="button" key={product.name} aria-label={`${product.name}, ${product.units} units sold`}>
            <span className="bar-label">{product.name}</span>
            <span className="bar-track"><span className="bar-fill" style={{ width: `${product.width}%` }} /></span>
            <strong className="bar-value">{product.units}</strong>
          </button>
        ))}
      </div>
      <div className="product-card-footer"><span className="mini-dot" aria-hidden="true" />214 total units · all sales remain visible</div>
    </figure>
  );
}

function App() {
  return (
    <div className="app-shell">
      <aside className="nav-rail" aria-label="Primary navigation">
        <div className="rail-brand">
          <span className="brand-mark" aria-hidden="true">e</span>
          <div><strong>EasyLedger</strong><span>Friendly sales clarity</span></div>
        </div>

        <nav className="rail-nav">
          <p className="rail-section-label">Workspace</p>
          <a className="rail-link" href="#overview"><span className="rail-icon" aria-hidden="true">◌</span>Overview</a>
          <a className="rail-link" href="#ledger"><span className="rail-icon" aria-hidden="true">▤</span>Ledger</a>
          <a className="rail-link rail-link-active" href="#dashboard" aria-current="page"><span className="rail-icon" aria-hidden="true">▦</span>Dashboard</a>
          <a className="rail-link" href="#catalog"><span className="rail-icon" aria-hidden="true">□</span>Catalog</a>
        </nav>

        <div className="rail-help">
          <p className="rail-section-label">Quick actions</p>
          <p>Use voice or drag cards to shape your view.</p>
          <span className="rail-help-key">⌘ K&nbsp; Ask EasyLedger</span>
        </div>

        <div className="rail-footer">
          <span>Revision 142 · IDR</span>
          <span className="workspace-ready"><i />Workspace ready</span>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="topbar-title">
            <span className="eyebrow">Dashboard builder</span>
            <div className="title-row"><h1>Weekly sales overview</h1><span className="saved-pill"><i />Saved · just now</span></div>
            <p>Kedai Segar <span aria-hidden="true">·</span> IDR <span className="topbar-dot" aria-hidden="true" /> Friendly view for everyday decisions</p>
          </div>
          <div className="topbar-actions">
            <div className="topbar-meta"><span>Last refresh <strong>09:42</strong></span><span>Revision <strong>142</strong></span><span><strong>5 of 7</strong> complete</span></div>
            <button className="avatar-button" type="button" aria-label="Open Maya owner profile">MN</button>
          </div>
        </header>

        <main className="dashboard-content" id="dashboard">
          <section className="voice-card" aria-labelledby="voice-title">
            <div className="voice-main">
              <span className="voice-bubble" aria-hidden="true">✦</span>
              <div><p className="voice-label">Ask EasyLedger</p><h2 id="voice-title">Try: show revenue this week</h2><p className="voice-help">A friendly shortcut for filters, charts, and ledger details.</p></div>
            </div>
            <div className="voice-actions"><span className="status-pill"><i />Idle</span><button className="listen-button" type="button"><span aria-hidden="true">◉</span> Press Space to listen</button></div>
          </section>

          <section className="filter-row" aria-label="Dashboard filters and actions">
            <div className="filter-controls">
              <label className="filter-control"><span>Date</span><select defaultValue="week" aria-label="Date range"><option value="week">16–22 Sep 2026</option></select></label>
              <label className="filter-control"><span>Product</span><select defaultValue="all" aria-label="Product filter"><option value="all">All products</option></select></label>
              <label className="filter-control"><span>Compare</span><select defaultValue="previous" aria-label="Comparison period"><option value="previous">Previous week</option></select></label>
            </div>
            <div className="filter-actions"><button className="button button-primary" type="button"><span aria-hidden="true">+</span>Add widget</button><button className="button button-secondary" type="button">Save changes</button></div>
          </section>

          <section className="dashboard-heading" aria-labelledby="glance-heading">
            <div><p className="section-kicker">Friendly clarity</p><h2 id="glance-heading">Your week at a glance</h2><p>Known-price clarity · gaps stay visible</p></div>
            <span className="canvas-hint"><span aria-hidden="true">↔</span> Drag to arrange <span aria-hidden="true">·</span> Tab to move</span>
          </section>

          <section className="stat-grid" aria-label="Weekly sales summary">
            <StatCard label="Total revenue" value="Rp 3.480.000" note="Known-price sales · 2 rows excluded" tone="purple" />
            <StatCard label="Units sold" value="214" note="Known + unknown-price sales remain visible" tone="blue" />
            <StatCard label="Complete days" value="5 of 7" note="2 days still open · gap-safe" tone="green" />
          </section>

          <section className="chart-grid" aria-label="Sales charts">
            <LineChart />
            <ProductChart />
          </section>

          <section className="lower-grid" aria-label="Dashboard details">
            <article className="detail-card quality-card">
              <div className="detail-card-heading"><div><p className="section-kicker">Trust the shape</p><h3>Data quality</h3></div><span className="quality-score">5/7</span></div>
              <p className="detail-helper">Read the chart with confidence.</p>
              <ul className="quality-list">
                <li><span className="quality-icon quality-complete">✓</span><span><strong>5 complete days</strong><small>Ready for comparison</small></span></li>
                <li><span className="quality-icon quality-gap">○</span><span><strong>1 open day — no data <em>(gap)</em></strong><small>20 Sep is still open</small></span></li>
                <li><span className="quality-icon quality-zero">■</span><span><strong>1 confirmed zero — 21 Sep</strong><small>Explicitly recorded as no sale</small></span></li>
              </ul>
              <p className="quality-note"><span aria-hidden="true">ⓘ</span> Revenue uses known prices only. Unknown-price sales remain visible.</p>
            </article>

            <article className="detail-card inspector-card">
              <div className="detail-card-heading"><div><p className="section-kicker">Make it yours</p><h3>Selected widget</h3></div><span className="drag-handle" aria-hidden="true">⠿</span></div>
              <div className="selected-widget-name"><span className="mini-chart-icon" aria-hidden="true">⌁</span><strong>Daily revenue</strong><span className="widget-selected-label">Selected</span></div>
              <div className="inspector-tabs" role="tablist" aria-label="Widget settings"><button className="inspector-tab inspector-tab-active" type="button" role="tab" aria-selected="true">Setup</button><button className="inspector-tab" type="button" role="tab" aria-selected="false">Style</button></div>
              <dl className="inspector-fields">
                <div><dt>Chart type</dt><dd>Line <span aria-hidden="true">⌄</span></dd>
                </div>
                <div><dt>Metric</dt><dd>Revenue <span aria-hidden="true">⌄</span></dd></div>
                <div><dt>Dimension</dt><dd>Day <span aria-hidden="true">⌄</span></dd></div>
                <div><dt>Effective filters</dt><dd>16–22 Sep · All products</dd></div>
                <div><dt>Accessibility</dt><dd><span className="on-toggle" aria-hidden="true">✓</span> Table alternative on</dd></div>
              </dl>
              <div className="inspector-actions"><button type="button">↑ <span>Move up</span></button><button type="button">↓ <span>Move down</span></button><button type="button">↘ <span>Resize</span></button></div>
              <p className="touch-help">Touch and keyboard friendly · focus a card, then use the controls.</p>
            </article>

            <aside className="detail-card drilldown-card" aria-labelledby="drilldown-title">
              <div className="detail-card-heading"><div><p className="section-kicker">Datum preview</p><h3 id="drilldown-title">Source transactions</h3></div><button className="close-button" type="button" aria-label="Dismiss source transactions preview">×</button></div>
              <div className="drilldown-selection"><span className="selection-dot" aria-hidden="true" /><div><strong>Orange Juice · 19 Sep</strong><span>revision 142 · same filters</span></div></div>
              <div className="drilldown-total"><strong>2 authorized rows</strong><span>IDR 240.000</span></div>
              <p className="drilldown-copy">Tap the datum to open the matching ledger rows.</p>
              <button className="button button-primary button-full" type="button">Open ledger details <span aria-hidden="true">↗</span></button>
              <p className="drilldown-footnote"><span aria-hidden="true">⌁</span> Predicates and revision stay aligned.</p>
            </aside>
          </section>
        </main>
      </div>
    </div>
  );
}

export default App;
