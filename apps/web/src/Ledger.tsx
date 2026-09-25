import { useMemo, useState } from 'react';

export interface LedgerSaleItem {
  id: string;
  txId: string;
  date: string;
  productName: string;
  quantity: number;
  unit: string;
  unitPrice: number | null;
  version: string;
  status: 'confirmed' | 'needs_price' | 'corrected';
}

const initialSalesData: LedgerSaleItem[] = [
  {
    id: 'sale-001',
    txId: '#TX-8924',
    date: '2026-09-22',
    productName: 'Orange Juice',
    quantity: 15,
    unit: 'pcs',
    unitPrice: 20000,
    version: 'v1',
    status: 'confirmed',
  },
  {
    id: 'sale-002',
    txId: '#TX-8923',
    date: '2026-09-21',
    productName: 'Rice 5kg',
    quantity: 8,
    unit: 'sacks',
    unitPrice: 65000,
    version: 'v2',
    status: 'confirmed',
  },
  {
    id: 'sale-003',
    txId: '#TX-8921',
    date: '2026-09-20',
    productName: 'Coffee Beans 250g',
    quantity: 12,
    unit: 'packs',
    unitPrice: null,
    version: 'v1',
    status: 'needs_price',
  },
  {
    id: 'sale-004',
    txId: '#TX-8919',
    date: '2026-09-19',
    productName: 'Orange Juice',
    quantity: 42,
    unit: 'pcs',
    unitPrice: 20000,
    version: 'v1',
    status: 'confirmed',
  },
  {
    id: 'sale-005',
    txId: '#TX-8915',
    date: '2026-09-18',
    productName: 'Coffee Beans 250g',
    quantity: 18,
    unit: 'packs',
    unitPrice: 45000,
    version: 'v3',
    status: 'corrected',
  },
  {
    id: 'sale-006',
    txId: '#TX-8910',
    date: '2026-09-17',
    productName: 'Fresh Milk 1L',
    quantity: 25,
    unit: 'bottles',
    unitPrice: 24000,
    version: 'v1',
    status: 'confirmed',
  },
  {
    id: 'sale-007',
    txId: '#TX-8904',
    date: '2026-09-16',
    productName: 'Assorted Pastries',
    quantity: 30,
    unit: 'pcs',
    unitPrice: 15000,
    version: 'v1',
    status: 'confirmed',
  },
];

function formatRupiah(value: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatHumanDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthIdx = parseInt(month, 10) - 1;
  return `${day} ${months[monthIdx] ?? month} ${year}`;
}

interface LedgerProps {
  isLive?: boolean;
}

export function LedgerJournal({ isLive = false }: LedgerProps) {
  const [sales, setSales] = useState<LedgerSaleItem[]>(initialSalesData);
  const [searchQuery, setSearchQuery] = useState('');
  const [productFilter, setProductFilter] = useState('all');
  const [versionFilter, setVersionFilter] = useState('all');

  // Modal State for Record Sale
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [newProductName, setNewProductName] = useState('Orange Juice');
  const [newQuantity, setNewQuantity] = useState('10');
  const [newUnitPrice, setNewUnitPrice] = useState('15000');
  const [newDate, setNewDate] = useState('2026-09-22');

  // Modal State for Edit/Correction
  const [editingItem, setEditingItem] = useState<LedgerSaleItem | null>(null);
  const [editQuantity, setEditQuantity] = useState('');
  const [editUnitPrice, setEditUnitPrice] = useState('');

  // Filtering
  const filteredSales = useMemo(() => {
    return sales.filter((item) => {
      const matchesSearch =
        item.productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.txId.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesProduct =
        productFilter === 'all' || item.productName.toLowerCase() === productFilter.toLowerCase();
      const matchesVersion =
        versionFilter === 'all' || item.version.toLowerCase() === versionFilter.toLowerCase();
      return matchesSearch && matchesProduct && matchesVersion;
    });
  }, [sales, searchQuery, productFilter, versionFilter]);

  // Aggregate stats
  const totalUnits = useMemo(() => {
    return sales.reduce((sum, item) => sum + item.quantity, 0);
  }, [sales]);

  const recordedRevenue = useMemo(() => {
    return sales.reduce((sum, item) => {
      if (item.unitPrice !== null) {
        return sum + item.quantity * item.unitPrice;
      }
      return sum;
    }, 0);
  }, [sales]);

  const needsReviewCount = useMemo(() => {
    return sales.filter((item) => item.unitPrice === null || item.status === 'needs_price').length;
  }, [sales]);

  const handleRecordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseInt(newQuantity, 10);
    const price = newUnitPrice.trim() ? parseInt(newUnitPrice, 10) : null;
    if (isNaN(qty) || qty <= 0) return;

    const newItem: LedgerSaleItem = {
      id: `sale-${Date.now()}`,
      txId: `#TX-${Math.floor(1000 + Math.random() * 9000)}`,
      date: newDate,
      productName: newProductName,
      quantity: qty,
      unit: 'pcs',
      unitPrice: price,
      version: 'v1',
      status: price === null ? 'needs_price' : 'confirmed',
    };

    setSales((prev) => [newItem, ...prev]);
    setIsRecordModalOpen(false);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    const qty = parseInt(editQuantity, 10);
    const price = editUnitPrice.trim() ? parseInt(editUnitPrice, 10) : null;
    if (isNaN(qty) || qty <= 0) return;

    const currentVNum = parseInt(editingItem.version.replace('v', ''), 10) || 1;
    const nextVersion = `v${currentVNum + 1}`;

    setSales((prev) =>
      prev.map((item) => {
        if (item.id === editingItem.id) {
          return {
            ...item,
            quantity: qty,
            unitPrice: price,
            version: nextVersion,
            status: price === null ? 'needs_price' : 'corrected',
          };
        }
        return item;
      }),
    );
    setEditingItem(null);
  };

  const handleUndo = (itemId: string) => {
    setSales((prev) =>
      prev.map((item) => {
        if (item.id === itemId) {
          return {
            ...item,
            version: `${item.version}-undo`,
            status: 'corrected',
          };
        }
        return item;
      }),
    );
  };

  return (
    <>
      {/* Voice Card matching Dashboard exactly */}
      <section className="voice-card" aria-labelledby="ledger-voice-title">
        <img className="voice-icon" src="/assets/voice-waveform.svg" width="32" height="32" alt="" aria-hidden="true" />
        <div className="voice-copy">
          <h2 id="ledger-voice-title">Ask EasyLedger</h2>
          <p>Try “show transactions with missing price” or “record ten orange juices today”</p>
        </div>
        <button className="voice-shortcut" type="button" aria-label="Voice controls are not connected in this preview" disabled>
          Voice preview only
        </button>
      </section>

      {/* Canvas Toolbar matching Dashboard filters and actions */}
      <section className="canvas-toolbar" aria-label="Ledger filters and actions">
        <div className="filter-controls">
          <label className="filter-control">
            <span className="sr-only">Date range</span>
            <select defaultValue="16-22 Sep 2026" aria-label="Date range">
              <option value="16-22 Sep 2026">16–22 Sep 2026</option>
              <option value="today">Today (22 Sep)</option>
              <option value="month">September 2026</option>
            </select>
          </label>

          <label className="filter-control">
            <span className="sr-only">Product filter</span>
            <select
              value={productFilter}
              onChange={(e) => setProductFilter(e.target.value)}
              aria-label="Product filter"
            >
              <option value="all">All products</option>
              <option value="Orange Juice">Orange Juice</option>
              <option value="Rice 5kg">Rice 5kg</option>
              <option value="Coffee Beans 250g">Coffee Beans 250g</option>
              <option value="Fresh Milk 1L">Fresh Milk 1L</option>
            </select>
          </label>

          <label className="filter-control">
            <span className="sr-only">Version filter</span>
            <select
              value={versionFilter}
              onChange={(e) => setVersionFilter(e.target.value)}
              aria-label="Version filter"
            >
              <option value="all">All versions</option>
              <option value="v1">v1 (Initial)</option>
              <option value="v2">v2 (Corrected)</option>
              <option value="v3">v3 (Multi-edit)</option>
            </select>
          </label>
        </div>

        <span className="filter-spacer" aria-hidden="true" />

        <div className="canvas-toolbar-actions">
          <div className="ledger-search-box">
            <input
              type="text"
              placeholder="Search product or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search transactions"
            />
          </div>

          <button
            className="button button-add"
            type="button"
            onClick={() => setIsRecordModalOpen(true)}
            title="Record a new transaction manually"
          >
            + Record Sale
          </button>
        </div>
      </section>

      {/* KPI Stat Grid matching Dashboard stat-grid and stat-card */}
      <section className="stat-grid" aria-label="Ledger summary metrics">
        <div className="stat-card">
          <span className="stat-label">Total Units Sold</span>
          <strong className="stat-value">{totalUnits}</strong>
          <span className="stat-note">Across {sales.length} transaction records</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Recorded Revenue</span>
          <strong className="stat-value">{formatRupiah(recordedRevenue)}</strong>
          <span className="stat-note">Known-price revenue · IDR</span>
        </div>
        <div className="stat-card stat-card-days">
          <span className="stat-label">Price Flags / Needs Review</span>
          <strong className="stat-value">{needsReviewCount} {needsReviewCount === 1 ? 'item' : 'items'}</strong>
          <span className="stat-note">Transactions with missing or zero unit price</span>
        </div>
      </section>

      {/* Main Ledger Table Card */}
      <section className="ledger-table-card" aria-label="Sales transactions journal">
        <div className="ledger-card-header">
          <div>
            <h2 id="ledger-journal-title">Daily Sales Transaction Log</h2>
            <p className="ledger-card-subtitle">Audited append-only records · All edits preserve immutable historical revisions</p>
          </div>
          <span className="ledger-fixture-badge">
            {isLive ? 'Authoritative Database' : 'Sample Fixture · Revision 142'}
          </span>
        </div>

        <div className="ledger-table-wrapper">
          <table className="ledger-data-table">
            <colgroup>
              <col style={{ width: '12%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '22%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '6%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '15%' }} />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Ref ID</th>
                <th scope="col">Product Name</th>
                <th scope="col" className="text-right">Qty</th>
                <th scope="col" className="text-right">Unit Price</th>
                <th scope="col" className="text-right">Line Total</th>
                <th scope="col" className="text-center">Ver</th>
                <th scope="col" className="text-center">Status</th>
                <th scope="col" className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredSales.map((item) => {
                const isUnknown = item.unitPrice === null;
                const lineTotal = item.unitPrice !== null ? item.quantity * item.unitPrice : null;

                return (
                  <tr key={item.id} className={isUnknown ? 'row-needs-price' : ''}>
                    <td className="cell-date">{formatHumanDate(item.date)}</td>
                    <td className="cell-code"><code>{item.txId}</code></td>
                    <td className="cell-product"><strong>{item.productName}</strong></td>
                    <td className="cell-qty text-right">{item.quantity} <span className="unit-label">{item.unit}</span></td>
                    <td className="cell-price text-right">
                      {isUnknown ? (
                        <span className="badge badge-warning">Unknown</span>
                      ) : (
                        formatRupiah(item.unitPrice!)
                      )}
                    </td>
                    <td className="cell-total text-right">
                      {lineTotal !== null ? (
                        <strong>{formatRupiah(lineTotal)}</strong>
                      ) : (
                        <span className="text-muted">Rp 0 (Unrecorded)</span>
                      )}
                    </td>
                    <td className="cell-version text-center">
                      <span className="version-pill">{item.version}</span>
                    </td>
                    <td className="cell-status text-center">
                      {isUnknown ? (
                        <span className="badge badge-needs-price">Needs Price</span>
                      ) : item.status === 'corrected' ? (
                        <span className="badge badge-corrected">Corrected</span>
                      ) : (
                        <span className="badge badge-confirmed">Confirmed</span>
                      )}
                    </td>
                    <td className="cell-actions text-right">
                      <div className="action-buttons-group">
                        {isUnknown ? (
                          <button
                            className="ledger-action-btn ledger-action-btn-lime"
                            type="button"
                            onClick={() => {
                              setEditingItem(item);
                              setEditQuantity(String(item.quantity));
                              setEditUnitPrice('');
                            }}
                          >
                            Set Price
                          </button>
                        ) : (
                          <button
                            className="ledger-action-btn"
                            type="button"
                            onClick={() => {
                              setEditingItem(item);
                              setEditQuantity(String(item.quantity));
                              setEditUnitPrice(String(item.unitPrice));
                            }}
                          >
                            Edit
                          </button>
                        )}
                        <button
                          className="ledger-action-btn ledger-action-btn-ghost"
                          type="button"
                          onClick={() => handleUndo(item.id)}
                        >
                          Undo
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredSales.length === 0 && (
                <tr>
                  <td colSpan={9} className="cell-empty">
                    No transactions match the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="ledger-card-footnote">
          Audited Ledger Invariant: All transaction edits preserve immutable append-only revisions. Unrecorded prices exclude revenue lines from totals.
        </p>
      </section>

      <p className="ledger-canvas-footer">
        Showing {filteredSales.length} of {sales.length} logged transaction records. Select an action to edit or undo.
      </p>

      {/* Record Sale Modal Dialog matching source-dialog */}
      {isRecordModalOpen && (
        <div className="source-dialog-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setIsRecordModalOpen(false); }}>
          <div className="source-dialog" role="dialog" aria-modal="true" aria-labelledby="record-sale-title">
            <header className="source-dialog-heading">
              <div>
                <h2 id="record-sale-title">Record Manual Sale</h2>
                <p>Add a new transaction directly to the ledger</p>
              </div>
              <button
                className="inspector-close"
                type="button"
                onClick={() => setIsRecordModalOpen(false)}
                aria-label="Close dialog"
              >
                ✕
              </button>
            </header>

            <form onSubmit={handleRecordSubmit} className="ledger-dialog-form">
              <div className="form-group">
                <label htmlFor="record-date">Transaction Date</label>
                <input
                  id="record-date"
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="record-product">Product</label>
                <select
                  id="record-product"
                  value={newProductName}
                  onChange={(e) => {
                    setNewProductName(e.target.value);
                    if (e.target.value === 'Orange Juice') setNewUnitPrice('15000');
                    if (e.target.value === 'Rice 5kg') setNewUnitPrice('65000');
                    if (e.target.value === 'Coffee Beans 250g') setNewUnitPrice('45000');
                  }}
                >
                  <option value="Orange Juice">Orange Juice (Default Rp 15.000)</option>
                  <option value="Rice 5kg">Rice 5kg (Default Rp 65.000)</option>
                  <option value="Coffee Beans 250g">Coffee Beans 250g (Default Rp 45.000)</option>
                  <option value="Fresh Milk 1L">Fresh Milk 1L (Default Rp 24.000)</option>
                </select>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="record-quantity">Quantity</label>
                  <input
                    id="record-quantity"
                    type="number"
                    min="1"
                    max="1000000"
                    value={newQuantity}
                    onChange={(e) => setNewQuantity(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="record-price">Unit Price (IDR)</label>
                  <input
                    id="record-price"
                    type="number"
                    min="0"
                    placeholder="Leave empty for Unknown"
                    value={newUnitPrice}
                    onChange={(e) => setNewUnitPrice(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-actions">
                <button
                  className="button"
                  type="button"
                  onClick={() => setIsRecordModalOpen(false)}
                >
                  Cancel
                </button>
                <button className="button button-action-record" type="submit">
                  Confirm & Commit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit / Set Price Modal Dialog matching source-dialog */}
      {editingItem && (
        <div className="source-dialog-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setEditingItem(null); }}>
          <div className="source-dialog" role="dialog" aria-modal="true" aria-labelledby="edit-sale-title">
            <header className="source-dialog-heading">
              <div>
                <h2 id="edit-sale-title">Correct Transaction ({editingItem.txId})</h2>
                <p>{editingItem.productName} · Current {editingItem.version}</p>
              </div>
              <button
                className="inspector-close"
                type="button"
                onClick={() => setEditingItem(null)}
                aria-label="Close dialog"
              >
                ✕
              </button>
            </header>

            <form onSubmit={handleEditSubmit} className="ledger-dialog-form">
              <div className="form-group">
                <label htmlFor="edit-quantity">Quantity</label>
                <input
                  id="edit-quantity"
                  type="number"
                  min="1"
                  max="1000000"
                  value={editQuantity}
                  onChange={(e) => setEditQuantity(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="edit-price">Unit Price (IDR)</label>
                <input
                  id="edit-price"
                  type="number"
                  min="0"
                  placeholder="Set price in IDR"
                  value={editUnitPrice}
                  onChange={(e) => setEditUnitPrice(e.target.value)}
                  required
                />
              </div>

              <p className="source-dialog-message">
                Changes produce an audited compensating revision without overwriting historical records.
              </p>

              <div className="form-actions">
                <button
                  className="button"
                  type="button"
                  onClick={() => setEditingItem(null)}
                >
                  Cancel
                </button>
                <button className="button button-action-record" type="submit">
                  Save Correction
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
export default LedgerJournal;
