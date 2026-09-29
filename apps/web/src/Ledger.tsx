import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { apiFetch } from './api';
import { formatMoneyMinor } from './analytics';
import { formatLedgerAmount, parseMoneyInput, formatMoneyInput } from './money';
import { VoiceControl } from './VoiceControl';
import type { VoiceAgentController } from './VoiceControl';

export interface LedgerSaleItem {
  id: string;
  txId: string;
  productId: string;
  date: string;
  productName: string;
  quantity: number;
  unitPrice: string | null;
  version: string;
  voided: boolean;
}

interface LedgerProduct {
  id: string;
  name: string;
  default_unit_price: string | null;
  active: boolean;
}

interface LedgerProps {
  businessId: string;
  voiceControl: VoiceAgentController;
  currency: 'IDR' | 'USD';
  onChanged: () => void;
}

interface ApiEnvelope<T> {
  data?: T;
  message?: string;
}

interface SalesListResponse {
  items?: Array<{
    sale_id?: string;
    id?: string;
    product_id: string;
    product_name: string;
    quantity: string;
    unit_price: string | null;
    sale_date: string;
    version: string;
    voided: boolean;
  }>;
  next_cursor?: string | null;
  has_more?: boolean;
}

function amount(value: string | null, currency: 'IDR' | 'USD'): string {
  return value === null ? 'Unknown' : formatMoneyMinor(value, currency);
}

export { formatLedgerAmount };

function formatHumanDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthIdx = Number.parseInt(month, 10) - 1;
  return `${day} ${months[monthIdx] ?? month} ${year}`;
}

function todayJakarta(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
}

function idempotencyKey(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Array.from(crypto.getRandomValues(new Uint8Array(24)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null) as ApiEnvelope<T> | null;
  if (!response.ok) throw new Error(body?.message ?? `The ledger request failed (${response.status}).`);
  if (!body || body.data === undefined) throw new Error('The ledger response is incomplete.');
  return body.data;
}

export function LedgerJournal({ businessId, voiceControl, currency, onChanged }: LedgerProps) {
  const [sales, setSales] = useState<LedgerSaleItem[]>([]);
  const [products, setProducts] = useState<LedgerProduct[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [productFilter, setProductFilter] = useState('all');
  const [versionFilter, setVersionFilter] = useState('all');
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [mutationError, setMutationError] = useState('');
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [newProductId, setNewProductId] = useState('');
  const [newQuantity, setNewQuantity] = useState('1');
  const [newUnitPrice, setNewUnitPrice] = useState('');
  const [newDate, setNewDate] = useState(todayJakarta);
  const [editingItem, setEditingItem] = useState<LedgerSaleItem | null>(null);
  const [editQuantity, setEditQuantity] = useState('');
  const [editUnitPrice, setEditUnitPrice] = useState('');

  const loadLedger = async () => {
    setLoadState('loading');
    setLoadError('');
    try {
      const productsRequest = apiFetch('/api/v1/products?active=true');
      const items: NonNullable<SalesListResponse['items']> = [];
      let cursor: string | null = null;
      const seenCursors = new Set<string>();
      let hasMore = true;
      while (hasMore) {
        const params = new URLSearchParams({ page_size: '100', include_voided: 'false' });
        if (cursor) params.set('cursor', cursor);
        const salesResponse = await apiFetch(`/api/v1/sales?${params.toString()}`);
        const salesData = await readResponse<SalesListResponse>(salesResponse);
        items.push(...(salesData.items ?? []));
        hasMore = salesData.has_more === true;
        if (hasMore) {
          if (!salesData.next_cursor || seenCursors.has(salesData.next_cursor)) {
            throw new Error('The ledger returned an invalid pagination cursor.');
          }
          cursor = salesData.next_cursor;
          seenCursors.add(cursor);
        }
      }
      const productsResponse = await productsRequest;
      const productsData = await readResponse<{ products?: LedgerProduct[] }>(productsResponse);
      setSales(items.map((item) => {
        const id = item.sale_id ?? item.id ?? '';
        return {
          id,
          txId: `#${id.slice(0, 8).toUpperCase()}`,
          productId: item.product_id,
          date: item.sale_date,
          productName: item.product_name,
          quantity: Number(item.quantity),
          unitPrice: item.unit_price,
          version: item.version,
          voided: item.voided,
        };
      }));
      setProducts(productsData.products ?? []);
      setLoadState('ready');
    } catch (error) {
      setSales([]);
      setProducts([]);
      setLoadError(error instanceof Error ? error.message : 'Could not load ledger data.');
      setLoadState('error');
    }
  };

  useEffect(() => { void loadLedger(); }, [businessId]);
  useEffect(() => {
    if (products.length === 0) {
      setNewProductId('');
      setNewUnitPrice('');
      return;
    }
    if (!products.some((product) => product.id === newProductId && product.active)) {
      const product = products.find((item) => item.active) ?? products[0];
      setNewProductId(product.id);
      setNewUnitPrice(product.default_unit_price === null ? '' : formatMoneyInput(product.default_unit_price, currency));
    }
  }, [businessId, products, newProductId, currency]);

  const filteredSales = useMemo(() => sales.filter((item) => {
    const query = searchQuery.toLocaleLowerCase();
    const matchesSearch = item.productName.toLocaleLowerCase().includes(query) || item.txId.toLocaleLowerCase().includes(query);
    const matchesProduct = productFilter === 'all' || item.productId === productFilter;
    const matchesVersion = versionFilter === 'all' || item.version === versionFilter;
    return matchesSearch && matchesProduct && matchesVersion;
  }), [sales, searchQuery, productFilter, versionFilter]);

  const totalUnits = sales.reduce((sum, item) => sum + BigInt(item.quantity), 0n);
  const recordedRevenue = sales.reduce((sum, item) => sum + (item.unitPrice === null ? 0n : BigInt(item.unitPrice) * BigInt(item.quantity)), 0n);
  const needsReviewCount = sales.filter((item) => item.unitPrice === null).length;
  const versions = [...new Set(sales.map((item) => item.version))].sort((a, b) => Number(b) - Number(a));

  const handleRecordSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMutationError('');
    const quantity = Number(newQuantity);
    const product = products.find((item) => item.id === newProductId && item.active);
    if (!product) {
      setMutationError('Add an active catalog product before recording a sale.');
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1_000_000) {
      setMutationError('Quantity must be a whole number between 1 and 1,000,000.');
      return;
    }
    let unitPrice: string | null;
    try { unitPrice = newUnitPrice.trim() ? parseMoneyInput(newUnitPrice, currency) : null; }
    catch (error) {
      setMutationError(error instanceof Error ? error.message : 'Enter a valid unit price.');
      return;
    }
    setBusy(true);
    try {
      const response = await apiFetch('/api/v1/sales', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey() },
        body: JSON.stringify({ lines: [{ product_id: product.id, quantity: String(quantity), unit_price: unitPrice, sale_date: newDate }] }),
      });
      await readResponse(response);
      setIsRecordModalOpen(false);
      setNewQuantity('1');
      await loadLedger();
      onChanged();
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : 'The sale could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const handleEditSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingItem) return;
    setMutationError('');
    const quantity = Number(editQuantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1_000_000) {
      setMutationError('Quantity must be a whole number between 1 and 1,000,000.');
      return;
    }
    let unitPrice: string | null;
    try { unitPrice = editUnitPrice.trim() ? parseMoneyInput(editUnitPrice, currency) : null; }
    catch (error) {
      setMutationError(error instanceof Error ? error.message : 'Enter a valid unit price.');
      return;
    }
    setBusy(true);
    try {
      const response = await apiFetch(`/api/v1/sales/${editingItem.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey() },
        body: JSON.stringify({
          expected_version: editingItem.version,
          changes: { quantity: String(quantity), unit_price: unitPrice },
          reason: 'Manual ledger correction',
        }),
      });
      await readResponse(response);
      setEditingItem(null);
      await loadLedger();
      onChanged();
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : 'The correction could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const selectedProduct = products.find((product) => product.id === newProductId);

  return (
    <>
      <VoiceControl controller={voiceControl} headingId="ledger-voice-title" description="Try “show transactions with missing price” or “record ten orange juices today”" />

      <section className="canvas-toolbar" aria-label="Ledger filters and actions">
        <div className="filter-controls">
          <label className="filter-control"><span className="sr-only">Date range</span><select defaultValue="all" aria-label="Date range" disabled><option value="all">All dates</option></select></label>
          <label className="filter-control">
            <span className="sr-only">Product filter</span>
            <select value={productFilter} onChange={(event) => setProductFilter(event.target.value)} aria-label="Product filter">
              <option value="all">All products</option>
              {products.map((product) => <option value={product.id} key={product.id}>{product.name}</option>)}
            </select>
          </label>
          <label className="filter-control">
            <span className="sr-only">Version filter</span>
            <select value={versionFilter} onChange={(event) => setVersionFilter(event.target.value)} aria-label="Version filter">
              <option value="all">All versions</option>
              {versions.map((version) => <option value={version} key={version}>v{version}</option>)}
            </select>
          </label>
        </div>
        <span className="filter-spacer" aria-hidden="true" />
        <div className="canvas-toolbar-actions">
          <div className="ledger-search-box"><input type="text" placeholder="Search product or ID…" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} aria-label="Search transactions" /></div>
          <button className="button button-add" type="button" onClick={() => { setMutationError(''); setIsRecordModalOpen(true); }} disabled={loadState !== 'ready'}>+ Record Sale</button>
        </div>
      </section>

      {loadError && <div className="home-dialog-error" role="alert">{loadError} <button className="button button-outline" type="button" onClick={() => void loadLedger()}>Retry</button></div>}

      <section className="stat-grid" aria-label="Ledger summary metrics">
        {loadState === 'ready' ? <>
          <div className="stat-card"><span className="stat-label">Total Units Sold</span><strong className="stat-value">{totalUnits.toString()}</strong><span className="stat-note">Across {sales.length} transaction records</span></div>
          <div className="stat-card"><span className="stat-label">Recorded Revenue</span><strong className="stat-value">{formatLedgerAmount(recordedRevenue, currency)}</strong><span className="stat-note">Known-price revenue · {currency}</span></div>
          <div className="stat-card stat-card-days"><span className="stat-label">Price Flags / Needs Review</span><strong className="stat-value">{needsReviewCount} {needsReviewCount === 1 ? 'item' : 'items'}</strong><span className="stat-note">Transactions with an unknown price</span></div>
        </> : <p role="status">{loadState === 'loading' ? 'Loading full ledger totals…' : 'Ledger totals are unavailable until data loads.'}</p>}
      </section>

      <section className="ledger-table-card" aria-label="Sales transactions journal">
        <div className="ledger-card-header">
          <div><h2 id="ledger-journal-title">Daily Sales Transaction Log</h2><p className="ledger-card-subtitle">Sales are saved to this business ledger. Corrections preserve the prior revision.</p></div>
          <span className="ledger-fixture-badge">{loadState === 'loading' ? 'Loading ledger' : loadState === 'error' ? 'Ledger unavailable' : 'PostgreSQL ledger'}</span>
        </div>
        <div className="ledger-table-wrapper">
          <table className="ledger-data-table">
            <thead><tr><th scope="col">Date</th><th scope="col">Ref ID</th><th scope="col">Product Name</th><th scope="col" className="text-right">Qty</th><th scope="col" className="text-right">Unit Price</th><th scope="col" className="text-right">Line Total</th><th scope="col" className="text-center">Ver</th><th scope="col" className="text-center">Status</th><th scope="col" className="text-right">Actions</th></tr></thead>
            <tbody>
              {loadState === 'loading' && <tr><td colSpan={9} className="cell-empty">Loading this business ledger…</td></tr>}
              {loadState === 'ready' && filteredSales.map((item) => {
                const lineTotal = item.unitPrice === null ? null : BigInt(item.unitPrice) * BigInt(item.quantity);
                return (
                  <tr key={item.id} className={item.unitPrice === null ? 'row-needs-price' : ''}>
                    <td className="cell-date">{formatHumanDate(item.date)}</td><td className="cell-code"><code>{item.txId}</code></td><td className="cell-product"><strong>{item.productName}</strong></td>
                    <td className="cell-qty text-right">{item.quantity} <span className="unit-label">pcs</span></td>
                    <td className="cell-price text-right">{amount(item.unitPrice, currency)}</td>
                    <td className="cell-total text-right">{lineTotal === null ? <span className="text-muted">Unknown</span> : <strong>{formatLedgerAmount(lineTotal, currency)}</strong>}</td>
                    <td className="cell-version text-center"><span className="version-pill">v{item.version}</span></td>
                    <td className="cell-status text-center">{item.unitPrice === null ? <span className="badge badge-needs-price">Needs Price</span> : Number(item.version) > 1 ? <span className="badge badge-corrected">Corrected</span> : <span className="badge badge-confirmed">Confirmed</span>}</td>
                    <td className="cell-actions text-right"><button className="ledger-action-btn" type="button" onClick={() => { setMutationError(''); setEditingItem(item); setEditQuantity(String(item.quantity)); setEditUnitPrice(item.unitPrice === null ? '' : formatMoneyInput(item.unitPrice, currency)); }}>{item.unitPrice === null ? 'Set Price' : 'Edit'}</button></td>
                  </tr>
                );
              })}
              {loadState === 'ready' && filteredSales.length === 0 && <tr><td colSpan={9} className="cell-empty">{sales.length === 0 ? 'No sales yet. Record a sale or use Ask EasyLedger to add the first one.' : 'No transactions match the selected filters.'}</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="ledger-card-footnote">Unknown prices remain unknown and are excluded from recorded revenue.</p>
      </section>

      <p className="ledger-canvas-footer">Showing {filteredSales.length} of {sales.length} transactions from this business.</p>

      {isRecordModalOpen && (
        <div className="source-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setIsRecordModalOpen(false); }}>
          <div className="source-dialog" role="dialog" aria-modal="true" aria-labelledby="record-sale-title">
            <header className="source-dialog-heading"><div><h2 id="record-sale-title">Record Manual Sale</h2><p>This entry will be saved to {currency} ledger.</p></div><button className="inspector-close" type="button" onClick={() => setIsRecordModalOpen(false)} aria-label="Close dialog"><svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M5 5L15 15M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg></button></header>
            {mutationError && <div className="home-dialog-error" role="alert">{mutationError}</div>}
            {products.length === 0 ? <div className="chart-state">Create a product in Catalog before recording its first sale.</div> : (
              <form onSubmit={handleRecordSubmit} className="ledger-dialog-form">
                <div className="form-group"><label htmlFor="record-date">Transaction Date</label><input id="record-date" type="date" value={newDate} onChange={(event) => setNewDate(event.target.value)} required /></div>
                <div className="form-group"><label htmlFor="record-product">Product</label><select id="record-product" value={newProductId} onChange={(event) => { const product = products.find((item) => item.id === event.target.value); setNewProductId(event.target.value); setNewUnitPrice(product?.default_unit_price === null || !product ? '' : formatMoneyInput(product.default_unit_price, currency)); }} required>{products.filter((product) => product.active).map((product) => <option value={product.id} key={product.id}>{product.name}</option>)}</select></div>
                <div className="form-row"><div className="form-group"><label htmlFor="record-quantity">Quantity</label><input id="record-quantity" type="number" min="1" max="1000000" step="1" value={newQuantity} onChange={(event) => setNewQuantity(event.target.value)} required /></div><div className="form-group"><label htmlFor="record-price">Unit Price ({currency})</label><input id="record-price" type="text" inputMode="decimal" placeholder={`Leave blank for unknown (${currency})`} value={newUnitPrice} onChange={(event) => setNewUnitPrice(event.target.value)} /></div></div>
                {selectedProduct?.default_unit_price !== null && selectedProduct && <p className="form-help">Default price: {formatMoneyMinor(selectedProduct.default_unit_price, currency)}. The recorded price is saved with this sale.</p>}
                <div className="form-actions"><button className="button" type="button" onClick={() => setIsRecordModalOpen(false)} disabled={busy}>Cancel</button><button className="button button-action-record" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Confirm & Commit'}</button></div>
              </form>
            )}
          </div>
        </div>
      )}

      {editingItem && (
        <div className="source-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setEditingItem(null); }}>
          <div className="source-dialog" role="dialog" aria-modal="true" aria-labelledby="edit-sale-title">
            <header className="source-dialog-heading"><div><h2 id="edit-sale-title">Correct Sale</h2><p>{editingItem.productName} · {formatHumanDate(editingItem.date)} · current revision v{editingItem.version}</p></div><button className="inspector-close" type="button" onClick={() => setEditingItem(null)} aria-label="Close dialog"><svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M5 5L15 15M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg></button></header>
            {mutationError && <div className="home-dialog-error" role="alert">{mutationError}</div>}
            <form onSubmit={handleEditSubmit} className="ledger-dialog-form">
              <div className="form-row"><div className="form-group"><label htmlFor="edit-quantity">Quantity</label><input id="edit-quantity" type="number" min="1" max="1000000" step="1" value={editQuantity} onChange={(event) => setEditQuantity(event.target.value)} required /></div><div className="form-group"><label htmlFor="edit-price">Unit Price ({currency})</label><input id="edit-price" type="text" inputMode="decimal" placeholder={`Leave blank for unknown (${currency})`} value={editUnitPrice} onChange={(event) => setEditUnitPrice(event.target.value)} /></div></div>
              <p className="form-help">This correction is saved with the current revision check. Leave price blank only when the sale price is unknown.</p>
              <div className="form-actions"><button className="button" type="button" onClick={() => setEditingItem(null)} disabled={busy}>Cancel</button><button className="button button-action-record" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save correction'}</button></div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

export default LedgerJournal;
