import { useState } from 'react';

type Tab = 'ledger' | 'dashboard' | 'catalog';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('ledger');

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="brand-section">
          <h1>EasyLedger</h1>
          <p>Voice-first sales ledger &amp; interactive dashboard builder</p>
        </div>
        <div className="header-meta">
          <span className="meta-badge">Currency: IDR (Rupiah)</span>
          <span className="meta-badge">Timezone: Asia/Jakarta</span>
          <span className="meta-badge">Version: Day 22 API Verified</span>
        </div>
      </header>

      <section className="voice-status-bar" aria-label="Voice Agent Status">
        <div className="voice-indicator">
          <span className="voice-dot" />
          <span>Voice Agent: <strong>Idle</strong> (AssemblyAI integration pending — Phase P3)</span>
        </div>
        <span className="meta-badge">Direct controls active</span>
      </section>

      <nav className="tab-nav" aria-label="Main Navigation">
        <button
          type="button"
          className={`tab-btn ${activeTab === 'ledger' ? 'active' : ''}`}
          onClick={() => setActiveTab('ledger')}
        >
          Ledger &amp; Sales History
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          Dashboard Builder
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'catalog' ? 'active' : ''}`}
          onClick={() => setActiveTab('catalog')}
        >
          Product Catalog
        </button>
      </nav>

      <main className="main-content">
        {activeTab === 'ledger' && (
          <div className="placeholder-card">
            <h2>Ledger &amp; Sales History View</h2>
            <p>
              Provides manual entry, paginated sales transactions, date/product filters, and audited day coverage
              via the verified Fastify <code>/api/v1/sales</code> and <code>/api/v1/days/:date/coverage</code> endpoints.
            </p>
          </div>
        )}

        {activeTab === 'dashboard' && (
          <div className="placeholder-card">
            <h2>Dashboard Builder View</h2>
            <p>
              Interactive ECharts widgets (line charts, product bars, KPI cards) and responsive drag/resize grid layout.
              Supports voice/manual layout editing and saved configurations (Phase P4).
            </p>
          </div>
        )}

        {activeTab === 'catalog' && (
          <div className="placeholder-card">
            <h2>Product Catalog View</h2>
            <p>
              Manage products, aliases, and optional default unit prices via <code>/api/v1/products</code>.
              Supports optimistic versioning and soft deactivation.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
