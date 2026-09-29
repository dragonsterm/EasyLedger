import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { apiFetch } from './api';
import { formatMoneyMinor } from './analytics';
import { formatMoneyInput, parseMoneyInput } from './money';
import type { LedgerCurrency } from './analytics';
import Icon from './Icon';
import { VoiceControl } from './VoiceControl';
import type { VoiceAgentController } from './VoiceControl';

export type CatalogSection = 'all-products' | 'needs-price' | null;

interface CatalogProduct {
  id: string;
  name: string;
  active: boolean;
  default_unit_price: string | null;
  version: string;
}

interface CatalogProps {
  businessId: string;
  currency: LedgerCurrency;
  section: CatalogSection;
  onSectionChange: (section: CatalogSection) => void;
  voiceControl: VoiceAgentController;
  onChanged: () => void;
}

type ViewMode = 'grid' | 'list';
type SortMode = 'name' | 'price';

interface ApiEnvelope<T> {
  data?: T;
  message?: string;
}

async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null) as ApiEnvelope<T> | null;
  if (!response.ok) throw new Error(body?.message ?? `The catalog request failed (${response.status}).`);
  if (!body || body.data === undefined) throw new Error('The catalog response is incomplete.');
  return body.data;
}

function idempotencyKey(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Array.from(crypto.getRandomValues(new Uint8Array(24)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function CatalogSearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="catalog-search">
      <img src="/assets/catalog-search.svg" width="16" height="16" alt="" aria-hidden="true" />
      <span className="sr-only">Search products</span>
      <input type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder="Search products" aria-label="Search products" />
    </label>
  );
}

function CatalogSort({ value, onChange, scope }: { value: SortMode; onChange: (value: SortMode) => void; scope: 'collections' | 'products' }) {
  return (
    <label className="catalog-sort">
      <img src="/assets/catalog-chevron-down.svg" width="16" height="16" alt="" aria-hidden="true" />
      <span className="sr-only">Sort {scope}</span>
      <select value={value} onChange={(event) => onChange(event.target.value as SortMode)} aria-label={`Sort ${scope}`}>
        <option value="name">Name A–Z</option>
        <option value="price">{scope === 'collections' ? 'Most products' : 'Price low to high'}</option>
      </select>
    </label>
  );
}

function CatalogViewToggle({ value, onChange }: { value: ViewMode; onChange: (value: ViewMode) => void }) {
  return (
    <div className="catalog-view-toggle" role="group" aria-label="Catalog view">
      <button type="button" className={value === 'grid' ? 'catalog-view-active' : ''} onClick={() => onChange('grid')} aria-label="Grid view" aria-pressed={value === 'grid'}><Icon name="grid" size={16} /></button>
      <button type="button" className={value === 'list' ? 'catalog-view-active' : ''} onClick={() => onChange('list')} aria-label="List view" aria-pressed={value === 'list'}><Icon name="list" size={16} /></button>
    </div>
  );
}

function CatalogToolbar({
  section, search, onSearch, sort, onSort, viewMode, onViewMode, onBack, onAdd,
}: {
  section: CatalogSection;
  search: string;
  onSearch: (value: string) => void;
  sort: SortMode;
  onSort: (value: SortMode) => void;
  viewMode: ViewMode;
  onViewMode: (value: ViewMode) => void;
  onBack: () => void;
  onAdd: () => void;
}) {
  return (
    <div className="catalog-toolbar">
      {section === null ? <h2 className="catalog-toolbar-title">My catalog</h2> : <button className="catalog-back" type="button" onClick={onBack}><img src="/assets/catalog-back.svg" width="16" height="16" alt="" aria-hidden="true" />All products</button>}
      <span className="catalog-toolbar-space" aria-hidden="true" />
      <CatalogSearch value={search} onChange={onSearch} />
      <CatalogSort value={sort} onChange={onSort} scope={section === null ? 'collections' : 'products'} />
      <CatalogViewToggle value={viewMode} onChange={onViewMode} />
      <button className="button button-add" type="button" onClick={onAdd}>+ Add product</button>
    </div>
  );
}

function FolderCard({ title, count, products, emptyNote, onOpen }: { title: string; count: number; products: CatalogProduct[]; emptyNote: string; onOpen: () => void }) {
  const previews = products.slice(0, 2);
  return (
    <button className="catalog-folder-card" type="button" onClick={onOpen} aria-label={`Open ${title}, ${count} ${count === 1 ? 'product' : 'products'}`}>
      <span className="catalog-folder-previews" aria-hidden="true">
        {previews.length ? previews.map((product, index) => <span className={`catalog-folder-preview catalog-tone-${index === 0 ? 'sage' : 'warm'}`} key={product.id}><img src="/assets/catalog-bottle.svg" width="64" height="64" alt="" /></span>) : <span className="catalog-folder-empty-note">{emptyNote}</span>}
      </span>
      <span className="catalog-folder-meta"><img className="catalog-folder-icon" src="/assets/catalog-folder.svg" width="24" height="24" alt="" aria-hidden="true" /><span className="catalog-folder-copy"><strong>{title}</strong><span>{count} {count === 1 ? 'product' : 'products'}</span></span><img className="catalog-chevron-right" src="/assets/catalog-chevron-right.svg" width="18" height="18" alt="" aria-hidden="true" /></span>
    </button>
  );
}

function ProductCard({ product, index, currency, onEdit, onToggleActive }: { product: CatalogProduct; index: number; currency: LedgerCurrency; onEdit: () => void; onToggleActive: () => void }) {
  const price = product.default_unit_price === null ? 'No default price' : formatMoneyMinor(product.default_unit_price, currency);
  return (
    <article className="catalog-product-card">
      <div className={`catalog-product-preview catalog-tone-${index % 2 === 0 ? 'sage' : 'warm'}`}><img src="/assets/catalog-bottle.svg" width="64" height="64" alt="" aria-hidden="true" /></div>
      <div className="catalog-product-info">
        <div className="catalog-product-title-row"><h3>{product.name}</h3><span className="catalog-more-icon" aria-hidden="true"><img src="/assets/catalog-more.svg" width="18" height="18" alt="" /></span></div>
        <p className="catalog-product-state">{product.active ? 'Active' : 'Inactive'}</p>
        <div className="catalog-product-price"><strong>{price}</strong><span>Default price · {currency}</span></div>
        <div className="catalog-product-actions"><button type="button" className="ledger-action-btn" onClick={onEdit}>Edit</button><button type="button" className="ledger-action-btn ledger-action-btn-ghost" onClick={onToggleActive}>{product.active ? 'Deactivate' : 'Reactivate'}</button></div>
      </div>
    </article>
  );
}

function CatalogNote({ children }: { children: string }) {
  return <aside className="catalog-note"><img src="/assets/catalog-note-cube.svg" width="18" height="18" alt="" aria-hidden="true" /><p>{children}</p></aside>;
}

export default function Catalog({ businessId, currency, section, onSectionChange, voiceControl, onChanged }: CatalogProps) {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortMode>('name');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState('');
  const [mutationError, setMutationError] = useState('');
  const [busy, setBusy] = useState(false);
  const [isProductDialogOpen, setIsProductDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<CatalogProduct | null>(null);
  const [productName, setProductName] = useState('');
  const [productPrice, setProductPrice] = useState('');

  const loadProducts = async () => {
    setLoadState('loading');
    setLoadError('');
    try {
      const response = await apiFetch('/api/v1/products');
      const data = await readResponse<{ products?: CatalogProduct[] }>(response);
      setProducts(data.products ?? []);
      setLoadState('ready');
    } catch (error) {
      setProducts([]);
      setLoadError(error instanceof Error ? error.message : 'Could not load this catalog.');
      setLoadState('error');
    }
  };

  useEffect(() => { void loadProducts(); }, [businessId]);

  const needsPriceProducts = products.filter((product) => product.default_unit_price === null);
  const folders = [
    { id: 'all-products' as const, title: 'All products', products, emptyNote: 'No products yet' },
    { id: 'needs-price' as const, title: 'Needs a price', products: needsPriceProducts, emptyNote: 'No products need a price' },
  ];
  const matchingFolders = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const result = folders.filter((folder) => !query || folder.title.toLocaleLowerCase().includes(query) || folder.products.some((product) => product.name.toLocaleLowerCase().includes(query)));
    return result.sort((a, b) => sort === 'name' ? a.title.localeCompare(b.title) : b.products.length - a.products.length || a.title.localeCompare(b.title));
  }, [search, sort, products]);
  const currentProducts = section === 'all-products' ? products : needsPriceProducts;
  const matchingProducts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const result = currentProducts.filter((product) => product.name.toLocaleLowerCase().includes(query));
    if (sort !== 'price') return result;
    return result.sort((a, b) => (a.default_unit_price === null ? Number.MAX_SAFE_INTEGER : Number(a.default_unit_price)) - (b.default_unit_price === null ? Number.MAX_SAFE_INTEGER : Number(b.default_unit_price)) || a.name.localeCompare(b.name));
  }, [currentProducts, search, sort]);

  const beginAdd = () => { setEditingProduct(null); setProductName(''); setProductPrice(''); setMutationError(''); setIsProductDialogOpen(true); };
  const beginEdit = (product: CatalogProduct) => { setEditingProduct(product); setProductName(product.name); setProductPrice(product.default_unit_price === null ? '' : formatMoneyInput(product.default_unit_price, currency)); setMutationError(''); setIsProductDialogOpen(true); };
  const saveProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMutationError('');
    const name = productName.trim();
    if (!name) { setMutationError('Enter a product name.'); return; }
    let price: string | null;
    try { price = productPrice.trim() ? parseMoneyInput(productPrice, currency) : null; }
    catch (error) { setMutationError(error instanceof Error ? error.message : 'Enter a valid default price.'); return; }
    setBusy(true);
    try {
      const response = editingProduct
        ? await apiFetch(`/api/v1/products/${editingProduct.id}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey() },
            body: JSON.stringify({ expected_version: editingProduct.version, changes: { name, default_unit_price: price } }),
          })
        : await apiFetch('/api/v1/products', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey() },
            body: JSON.stringify({ name, default_unit_price: price }),
          });
      await readResponse(response);
      setIsProductDialogOpen(false);
      await loadProducts();
      onChanged();
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : 'The product could not be saved.');
    } finally { setBusy(false); }
  };
  const toggleActive = async (product: CatalogProduct) => {
    setMutationError('');
    setBusy(true);
    try {
      const response = await apiFetch(`/api/v1/products/${product.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey() },
        body: JSON.stringify({ expected_version: product.version, changes: { active: !product.active } }),
      });
      await readResponse(response);
      await loadProducts();
      onChanged();
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : 'The product status could not be changed.');
    } finally { setBusy(false); }
  };

  return (
    <div className="catalog-content">
      <VoiceControl controller={voiceControl} headingId="catalog-voice-title" description="Try “show my products” or “find orange juice”" catalog />
      <CatalogToolbar section={section} search={search} onSearch={setSearch} sort={sort} onSort={setSort} viewMode={viewMode} onViewMode={setViewMode} onBack={() => onSectionChange(null)} onAdd={beginAdd} />
      {loadError && <div className="home-dialog-error" role="alert">{loadError} <button className="button button-outline" type="button" onClick={() => void loadProducts()}>Retry</button></div>}
      {mutationError && !isProductDialogOpen && <div className="home-dialog-error" role="alert">{mutationError}</div>}

      {section === null ? (
        <>
          <div className={`catalog-folder-grid${viewMode === 'list' ? ' catalog-list-mode' : ''}`}>
            {matchingFolders.map((folder) => <FolderCard key={folder.id} title={folder.title} count={folder.products.length} products={folder.products} emptyNote={folder.emptyNote} onOpen={() => onSectionChange(folder.id)} />)}
            {matchingFolders.length === 0 && <p className="catalog-empty-state">No collections match “{search.trim()}”.</p>}
          </div>
          {loadState === 'ready' && products.length === 0 && <div className="catalog-empty-state" role="status"><h3>Your catalog is empty</h3><p>Add a product to start recording sales in this business.</p></div>}
          <CatalogNote>Each business keeps its own catalog. Default prices apply to future sales.</CatalogNote>
          <p className="catalog-footer">{products.length} {products.length === 1 ? 'product' : 'products'} in this business</p>
        </>
      ) : (
        <>
          <div className={`catalog-product-grid${viewMode === 'list' ? ' catalog-list-mode' : ''}`}>
            {loadState === 'loading' && <p className="catalog-empty-state">Loading this business catalog…</p>}
            {matchingProducts.map((product, index) => <ProductCard key={product.id} product={product} index={index} currency={currency} onEdit={() => beginEdit(product)} onToggleActive={() => void toggleActive(product)} />)}
            {loadState === 'ready' && matchingProducts.length === 0 && <section className="catalog-empty-state" aria-live="polite"><img src="/assets/catalog-folder.svg" width="24" height="24" alt="" aria-hidden="true" /><h3>{section === 'needs-price' && !search.trim() ? 'No products need a price' : 'No products found'}</h3><p>{section === 'needs-price' && !search.trim() ? 'Every active product has a default price, or the catalog is empty.' : 'Try a different product name.'}</p></section>}
          </div>
          <CatalogNote>Default prices apply to future sales. Recorded sale prices stay unchanged.</CatalogNote>
          <p className="catalog-footer">{matchingProducts.length} {matchingProducts.length === 1 ? 'product' : 'products'} in {section === 'all-products' ? 'All products' : 'Needs a price'}</p>
        </>
      )}

      {isProductDialogOpen && (
        <div className="source-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setIsProductDialogOpen(false); }}>
          <div className="source-dialog" role="dialog" aria-modal="true" aria-labelledby="catalog-product-title">
            <header className="source-dialog-heading"><div><h2 id="catalog-product-title">{editingProduct ? 'Edit Product' : 'Add Product'}</h2><p>Changes apply to this business only.</p></div><button className="inspector-close" type="button" onClick={() => setIsProductDialogOpen(false)} aria-label="Close dialog"><svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M5 5L15 15M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg></button></header>
            {mutationError && <div className="home-dialog-error" role="alert">{mutationError}</div>}
            <form onSubmit={saveProduct} className="ledger-dialog-form">
              <div className="form-group"><label htmlFor="catalog-name">Product name</label><input id="catalog-name" type="text" value={productName} onChange={(event) => setProductName(event.target.value)} maxLength={200} required autoFocus /></div>
              <div className="form-group"><label htmlFor="catalog-price">Default price ({currency})</label><input id="catalog-price" type="text" inputMode="decimal" value={productPrice} onChange={(event) => setProductPrice(event.target.value)} placeholder={`Leave blank for unknown (${currency})`} /></div>
              <p className="form-help">Leave the price blank when there is no known default price.</p>
              <div className="form-actions"><button className="button" type="button" onClick={() => setIsProductDialogOpen(false)} disabled={busy}>Cancel</button><button className="button button-action-record" type="submit" disabled={busy}>{busy ? 'Saving…' : editingProduct ? 'Save product' : 'Add product'}</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
