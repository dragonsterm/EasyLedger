import { useMemo, useState } from 'react';
import { formatMoneyMinor } from './analytics';
import type { LedgerCurrency } from './analytics';

export type CatalogSection = 'all-products' | 'needs-price' | null;

interface CatalogProduct {
  id: string;
  name: string;
  active: boolean;
  default_unit_price: string | null;
}

type ViewMode = 'grid' | 'list';
type SortMode = 'name' | 'price';

const sampleProducts: CatalogProduct[] = [
  { id: 'sample-orange-juice', name: 'Orange Juice', active: true, default_unit_price: '15000' },
  { id: 'sample-mango-juice', name: 'Mango Juice', active: true, default_unit_price: '18000' },
];

function CatalogSearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="catalog-search">
      <img src="/assets/catalog-search.svg" width="16" height="16" alt="" aria-hidden="true" />
      <span className="sr-only">Search products</span>
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search products"
        aria-label="Search products"
      />
    </label>
  );
}

function CatalogSort({
  value,
  onChange,
  scope,
}: {
  value: SortMode;
  onChange: (value: SortMode) => void;
  scope: 'collections' | 'products';
}) {
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
      <button
        type="button"
        className={value === 'grid' ? 'catalog-view-active' : ''}
        onClick={() => onChange('grid')}
        aria-label="Grid view"
        aria-pressed={value === 'grid'}
      >
        <img src="/assets/catalog-nav-dashboard.svg" width="16" height="16" alt="" aria-hidden="true" />
      </button>
      <button
        type="button"
        className={value === 'list' ? 'catalog-view-active' : ''}
        onClick={() => onChange('list')}
        aria-label="List view"
        aria-pressed={value === 'list'}
      >
        <img src="/assets/catalog-list.svg" width="16" height="16" alt="" aria-hidden="true" />
      </button>
    </div>
  );
}

function CatalogToolbar({
  section,
  search,
  onSearch,
  sort,
  onSort,
  viewMode,
  onViewMode,
  onBack,
}: {
  section: CatalogSection;
  search: string;
  onSearch: (value: string) => void;
  sort: SortMode;
  onSort: (value: SortMode) => void;
  viewMode: ViewMode;
  onViewMode: (value: ViewMode) => void;
  onBack: () => void;
}) {
  return (
    <div className="catalog-toolbar">
      {section === null ? (
        <h2 className="catalog-toolbar-title">All folders</h2>
      ) : (
        <button className="catalog-back" type="button" onClick={onBack}>
          <img src="/assets/catalog-back.svg" width="16" height="16" alt="" aria-hidden="true" />
          All folders
        </button>
      )}
      <span className="catalog-toolbar-space" aria-hidden="true" />
      <CatalogSearch value={search} onChange={onSearch} />
      <CatalogSort value={sort} onChange={onSort} scope={section === null ? 'collections' : 'products'} />
      <CatalogViewToggle value={viewMode} onChange={onViewMode} />
    </div>
  );
}

function FolderCard({
  title,
  count,
  products,
  emptyNote,
  onOpen,
}: {
  title: string;
  count: number;
  products: CatalogProduct[];
  emptyNote: string;
  onOpen: () => void;
}) {
  const previewProducts = products.slice(0, 2);

  return (
    <button className="catalog-folder-card" type="button" onClick={onOpen} aria-label={`Open ${title}, ${count} sample products`}>
      <span className="catalog-folder-previews" aria-hidden="true">
        {previewProducts.length > 0
          ? previewProducts.map((product, index) => (
            <span className={`catalog-folder-preview catalog-tone-${index === 0 ? 'sage' : 'warm'}`} key={product.id}>
              <img src="/assets/catalog-bottle.svg" width="64" height="64" alt="" />
            </span>
          ))
          : <span className="catalog-folder-empty-note">{emptyNote}</span>}
      </span>
      <span className="catalog-folder-meta">
        <img className="catalog-folder-icon" src="/assets/catalog-folder.svg" width="24" height="24" alt="" aria-hidden="true" />
        <span className="catalog-folder-copy">
          <strong>{title}</strong>
          <span>{count} {count === 1 ? 'product' : 'products'} · Sample collection</span>
        </span>
        <img className="catalog-chevron-right" src="/assets/catalog-chevron-right.svg" width="18" height="18" alt="" aria-hidden="true" />
      </span>
    </button>
  );
}

function ProductCard({ product, index, currency }: { product: CatalogProduct; index: number; currency: LedgerCurrency }) {
  const price = product.default_unit_price === null
    ? 'No default price'
    : formatMoneyMinor(product.default_unit_price, currency);

  return (
    <article className="catalog-product-card">
      <div className={`catalog-product-preview catalog-tone-${index % 2 === 0 ? 'sage' : 'warm'}`}>
        <img src="/assets/catalog-bottle.svg" width="64" height="64" alt="" aria-hidden="true" />
      </div>
      <div className="catalog-product-info">
        <div className="catalog-product-title-row">
          <h3>{product.name}</h3>
          <span className="catalog-more-icon" aria-hidden="true">
            <img src="/assets/catalog-more.svg" width="18" height="18" alt="" />
          </span>
        </div>
        <p className="catalog-product-state">{product.active ? 'Active' : 'Inactive'}</p>
        <div className="catalog-product-price">
          <strong>{price}</strong>
          <span>Default price</span>
        </div>
      </div>
    </article>
  );
}

function CatalogNote({ children }: { children: string }) {
  return (
    <aside className="catalog-note">
      <img src="/assets/catalog-note-cube.svg" width="18" height="18" alt="" aria-hidden="true" />
      <p>{children}</p>
    </aside>
  );
}

export default function Catalog({
  currency,
  section,
  onSectionChange,
}: {
  currency: LedgerCurrency;
  section: CatalogSection;
  onSectionChange: (section: CatalogSection) => void;
}) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortMode>('name');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  const needsPriceProducts = sampleProducts.filter((product) => product.default_unit_price === null);
  const folders = [
    {
      id: 'all-products' as const,
      title: 'All products',
      products: sampleProducts,
      emptyNote: '',
    },
    {
      id: 'needs-price' as const,
      title: 'Needs a price',
      products: needsPriceProducts,
      emptyNote: 'Every sample product has a default price',
    },
  ];
  const matchingFolders = useMemo(() => {
    const query = search.trim().toLowerCase();
    const result = folders.filter((folder) => !query
      || folder.title.toLowerCase().includes(query)
      || folder.products.some((product) => product.name.toLowerCase().includes(query)));
    return result.sort((a, b) => sort === 'name'
      ? a.title.localeCompare(b.title)
      : b.products.length - a.products.length || a.title.localeCompare(b.title));
  }, [search, sort]);

  const currentProducts = section === 'all-products' ? sampleProducts : needsPriceProducts;
  const matchingProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    const result = currentProducts.filter((product) => product.name.toLowerCase().includes(query));
    if (sort !== 'price') return result;
    return result.sort((a, b) => {
      const firstPrice = a.default_unit_price === null ? Number.MAX_SAFE_INTEGER : Number(a.default_unit_price);
      const secondPrice = b.default_unit_price === null ? Number.MAX_SAFE_INTEGER : Number(b.default_unit_price);
      return firstPrice - secondPrice || a.name.localeCompare(b.name);
    });
  }, [currentProducts, search, sort]);

  return (
    <div className="catalog-content">
      <section className="voice-card catalog-voice-card" aria-labelledby="catalog-voice-title">
        <img className="voice-icon" src="/assets/catalog-voice-mic.svg" width="24" height="24" alt="" aria-hidden="true" />
        <div className="voice-copy">
          <h2 id="catalog-voice-title">Ask EasyLedger</h2>
          <p>Try “show my products” or “find orange juice”</p>
        </div>
        <button className="voice-shortcut" type="button" disabled title="Voice controls are not connected in this preview">
          Voice preview only
        </button>
      </section>

      <CatalogToolbar
        section={section}
        search={search}
        onSearch={setSearch}
        sort={sort}
        onSort={setSort}
        viewMode={viewMode}
        onViewMode={setViewMode}
        onBack={() => onSectionChange(null)}
      />

      {section === null ? (
        <>
          <div className={`catalog-folder-grid${viewMode === 'list' ? ' catalog-list-mode' : ''}`}>
            {matchingFolders.map((folder) => (
              <FolderCard
                key={folder.id}
                title={folder.title}
                count={folder.products.length}
                products={folder.products}
                emptyNote={folder.emptyNote}
                onOpen={() => onSectionChange(folder.id)}
              />
            ))}
            {matchingFolders.length === 0 && (
              <p className="catalog-empty-state">No collections match “{search.trim()}”.</p>
            )}
          </div>
          <CatalogNote>Collections help you find products. Sample data is shown until your catalog is connected.</CatalogNote>
          <p className="catalog-footer">2 collections · 2 sample products</p>
        </>
      ) : (
        <>
          <div className={`catalog-product-grid${viewMode === 'list' ? ' catalog-list-mode' : ''}`}>
            {matchingProducts.map((product, index) => (
              <ProductCard key={product.id} product={product} index={index} currency={currency} />
            ))}
            {matchingProducts.length === 0 && (
              <section className="catalog-empty-state" aria-live="polite">
                <img src="/assets/catalog-folder.svg" width="24" height="24" alt="" aria-hidden="true" />
                <h3>{section === 'needs-price' && !search.trim() ? 'No products need a price' : 'No products found'}</h3>
                <p>{section === 'needs-price' && !search.trim()
                  ? 'Every sample product has a default price.'
                  : 'Try a different product name.'}</p>
              </section>
            )}
          </div>
          <CatalogNote>Default prices apply to future sales. Recorded prices stay unchanged.</CatalogNote>
          <p className="catalog-footer">{matchingProducts.length} sample {matchingProducts.length === 1 ? 'product' : 'products'} in {section === 'all-products' ? 'All products' : 'Needs a price'}</p>
        </>
      )}
    </div>
  );
}
