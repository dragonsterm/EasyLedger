import { useMemo, useState, type FormEvent, type ReactNode } from 'react';

type WorkspaceSection = 'all-folders' | 'recent' | 'starred' | 'trash' | 'settings';
type WorkspaceSort = 'modified' | 'name' | 'count';
type WorkspaceView = 'grid' | 'list';
type PreviewKind = 'line' | 'bar' | 'comparison';

interface WorkspaceFolder {
  id: string;
  name: string;
  modifiedAt: number;
  modifiedLabel: string;
  deletedAt: number | null;
}

interface WorkspaceDashboard {
  id: string;
  name: string;
  folderId: string;
  modifiedAt: number;
  modifiedLabel: string;
  lastOpenedAt: number;
  preview: PreviewKind;
  starred: boolean;
  deletedAt: number | null;
}

interface WorkspaceState {
  version: 1;
  folders: WorkspaceFolder[];
  dashboards: WorkspaceDashboard[];
}

type WorkspaceDialog =
  | { type: 'create-folder' }
  | { type: 'create-dashboard' }
  | { type: 'rename-folder'; id: string }
  | { type: 'rename-dashboard'; id: string };

const STORAGE_KEY = 'easyledger.home-workspace.v1';
const previewAssets = [
  '/assets/home-chart-overview-a.svg',
  '/assets/home-chart-overview-b.svg',
  '/assets/home-chart-overview-c.svg',
  '/assets/home-chart-overview-d.svg',
];

function localDayOffset(daysAgo: number, hour = 12, minute = 0): number {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  date.setDate(date.getDate() - daysAgo);
  return date.getTime();
}

function countLabel(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

function createSampleWorkspace(): WorkspaceState {
  const folders: WorkspaceFolder[] = [
    { id: 'folder-sales-reports', name: 'Sales reports', modifiedAt: localDayOffset(0, 9, 42), modifiedLabel: 'Updated today', deletedAt: null },
    { id: 'folder-product-performance', name: 'Product performance', modifiedAt: localDayOffset(1, 16, 20), modifiedLabel: 'Updated yesterday', deletedAt: null },
    { id: 'folder-monthly-reviews', name: 'Monthly reviews', modifiedAt: localDayOffset(2), modifiedLabel: 'Updated 2 days ago', deletedAt: null },
    { id: 'folder-store-operations', name: 'Store operations', modifiedAt: localDayOffset(3), modifiedLabel: 'Updated 3 days ago', deletedAt: null },
    { id: 'folder-quarterly-planning', name: 'Quarterly planning', modifiedAt: localDayOffset(5), modifiedLabel: 'Updated 5 days ago', deletedAt: null },
    { id: 'folder-2025-archive', name: '2025 archive', modifiedAt: localDayOffset(15), modifiedLabel: 'Updated 12 Sep', deletedAt: null },
  ];

  const dashboard = (
    id: string,
    name: string,
    folderId: string,
    daysAgo: number,
    modifiedLabel: string,
    preview: PreviewKind,
    lastOpenedDaysAgo: number | null = null,
    hour = 10,
    minute = 0,
  ): WorkspaceDashboard => ({
    id,
    name,
    folderId,
    modifiedAt: localDayOffset(daysAgo, hour, minute),
    modifiedLabel,
    lastOpenedAt: lastOpenedDaysAgo === null ? 0 : localDayOffset(lastOpenedDaysAgo, hour, minute),
    preview,
    starred: false,
    deletedAt: null,
  });

  const dashboards: WorkspaceDashboard[] = [
    dashboard('dashboard-weekly-sales', 'Weekly sales overview', 'folder-sales-reports', 0, 'Edited today at 09:42', 'line', 0, 9, 42),
    dashboard('dashboard-daily-sales', 'Daily sales tracker', 'folder-sales-reports', 1, 'Edited yesterday at 16:20', 'bar', null, 16, 20),
    dashboard('dashboard-revenue-product', 'Revenue by product', 'folder-sales-reports', 3, 'Edited 24 Sep at 11:05', 'line', null, 11, 5),
    dashboard('dashboard-weekly-comparison', 'Week-to-week comparison', 'folder-sales-reports', 5, 'Edited 22 Sep at 14:30', 'comparison', null, 14, 30),
    dashboard('dashboard-best-selling', 'Best-selling products', 'folder-product-performance', 1, 'Edited yesterday', 'bar', 1),
    dashboard('dashboard-product-growth', 'Product growth', 'folder-product-performance', 2, 'Edited 2 days ago', 'line'),
    dashboard('dashboard-price-review', 'Price review', 'folder-product-performance', 2, 'Edited 2 days ago', 'comparison'),
    dashboard('dashboard-september-review', 'September review', 'folder-monthly-reviews', 1, 'Edited yesterday', 'line', 1),
    dashboard('dashboard-august-comparison', 'August comparison', 'folder-monthly-reviews', 2, 'Edited 2 days ago', 'comparison'),
    dashboard('dashboard-monthly-revenue', 'Monthly revenue', 'folder-monthly-reviews', 4, 'Edited 4 days ago', 'bar'),
    dashboard('dashboard-daily-operations', 'Daily operations', 'folder-store-operations', 3, 'Edited 3 days ago', 'line'),
    dashboard('dashboard-store-summary', 'Store summary', 'folder-store-operations', 4, 'Edited 4 days ago', 'bar'),
    dashboard('dashboard-q4-targets', 'Q4 targets', 'folder-quarterly-planning', 5, 'Edited 5 days ago', 'comparison'),
    dashboard('dashboard-quarterly-sales', 'Quarterly sales', 'folder-quarterly-planning', 5, 'Edited 5 days ago', 'line'),
    dashboard('dashboard-annual-summary', 'Annual summary', 'folder-2025-archive', 15, 'Edited 12 Sep', 'line'),
    dashboard('dashboard-archive-products', 'Top products', 'folder-2025-archive', 15, 'Edited 12 Sep', 'bar'),
    dashboard('dashboard-sales-month', 'Sales by month', 'folder-2025-archive', 15, 'Edited 12 Sep', 'comparison'),
    dashboard('dashboard-archive-revenue', 'Revenue comparison', 'folder-2025-archive', 15, 'Edited 12 Sep', 'line'),
    dashboard('dashboard-archive-store', 'Store performance', 'folder-2025-archive', 15, 'Edited 12 Sep', 'bar'),
    dashboard('dashboard-product-history', 'Product history', 'folder-2025-archive', 15, 'Edited 12 Sep', 'comparison'),
  ];

  return { version: 1, folders, dashboards };
}

function isWorkspaceState(value: unknown): value is WorkspaceState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<WorkspaceState>;
  return candidate.version === 1
    && Array.isArray(candidate.folders)
    && candidate.folders.every((folder) => folder
      && typeof folder.id === 'string'
      && typeof folder.name === 'string'
      && typeof folder.modifiedAt === 'number'
      && typeof folder.modifiedLabel === 'string'
      && (typeof folder.deletedAt === 'number' || folder.deletedAt === null))
    && Array.isArray(candidate.dashboards)
    && candidate.dashboards.every((dashboard) => dashboard
      && typeof dashboard.id === 'string'
      && typeof dashboard.name === 'string'
      && typeof dashboard.folderId === 'string'
      && typeof dashboard.modifiedAt === 'number'
      && typeof dashboard.modifiedLabel === 'string'
      && typeof dashboard.lastOpenedAt === 'number'
      && (dashboard.preview === 'line' || dashboard.preview === 'bar' || dashboard.preview === 'comparison')
      && typeof dashboard.starred === 'boolean'
      && (typeof dashboard.deletedAt === 'number' || dashboard.deletedAt === null));
}

function loadWorkspace(): WorkspaceState {
  if (typeof window === 'undefined') return createSampleWorkspace();
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return createSampleWorkspace();
    const parsed: unknown = JSON.parse(saved);
    return isWorkspaceState(parsed) ? parsed : createSampleWorkspace();
  } catch {
    return createSampleWorkspace();
  }
}

function createId(prefix: string): string {
  const randomId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return `${prefix}-${randomId}`;
}

function folderDashboards(workspace: WorkspaceState, folderId: string, includeDeleted = false): WorkspaceDashboard[] {
  return workspace.dashboards.filter((dashboard) => dashboard.folderId === folderId
    && (includeDeleted || dashboard.deletedAt === null));
}

function icon(src: string, className = '') {
  return <img className={className} src={src} alt="" aria-hidden="true" />;
}

function DashboardPreview({ dashboard, compact = false }: { dashboard: WorkspaceDashboard; compact?: boolean }) {
  const isWarm = dashboard.preview === 'bar' || dashboard.preview === 'comparison';
  const src = compact
    ? previewAssets[dashboard.preview === 'bar' ? 1 : dashboard.preview === 'comparison' ? 3 : 0]
    : dashboard.preview === 'bar' ? '/assets/home-chart-folder-b.svg' : '/assets/home-chart-folder-a.svg';
  return (
    <span className={`home-preview-sheet${compact ? ' home-preview-sheet-compact' : ''}${isWarm ? ' home-preview-sheet-warm' : ' home-preview-sheet-sage'}`} aria-hidden="true">
      <span className="home-preview-title"><span /></span>
      <span className="home-preview-metrics">
        <span><i /><b /></span><span><i /><b /></span><span><i /><b /></span>
      </span>
      <span className="home-preview-chart"><img src={src} alt="" /></span>
    </span>
  );
}

function CardMenu({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="home-card-menu">
      <summary aria-label={label}>{icon('/assets/home-more.svg', 'home-card-more-icon')}</summary>
      <div className="home-card-menu-content">{children}</div>
    </details>
  );
}

function FolderCard({
  folder,
  dashboards,
  view,
  onOpen,
  onRename,
  onDelete,
  onRestore,
  onPermanentlyDelete,
  inTrash = false,
}: {
  folder: WorkspaceFolder;
  dashboards: WorkspaceDashboard[];
  view: WorkspaceView;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
  onRestore: () => void;
  onPermanentlyDelete: () => void;
  inTrash?: boolean;
}) {
  const previews = dashboards.slice(0, 3);
  return (
    <article className={`home-folder-card${view === 'list' ? ' home-folder-card-list' : ''}`}>
      <button className="home-folder-open" type="button" onClick={onOpen} disabled={inTrash} aria-label={`Open ${folder.name}, ${countLabel(dashboards.length, 'dashboard')}`}>
        <span className="home-folder-previews" aria-hidden="true">
          {previews.length > 0
            ? previews.map((dashboard) => (
              <span className={`home-folder-preview home-preview-tone-${dashboard.preview === 'bar' || dashboard.preview === 'comparison' ? 'warm' : 'sage'}`} key={dashboard.id}>
                <DashboardPreview dashboard={dashboard} compact />
              </span>
            ))
            : <span className="home-folder-preview-empty">No dashboards yet</span>}
        </span>
        <span className="home-folder-meta">
          {icon('/assets/home-folder-card-icon.svg', 'home-folder-icon')}
          <span className="home-folder-copy">
            <strong>{folder.name}</strong>
            <span>{dashboards.length} {dashboards.length === 1 ? 'dashboard' : 'dashboards'} · {folder.modifiedLabel}</span>
          </span>
        </span>
      </button>
      <CardMenu label={`More options for ${folder.name}`}>
        {inTrash ? (
          <>
            <button type="button" onClick={onRestore}>Restore folder</button>
            <button className="home-menu-danger" type="button" onClick={onPermanentlyDelete}>Delete permanently</button>
          </>
        ) : (
          <>
            <button type="button" onClick={onRename}>Rename folder</button>
            <button className="home-menu-danger" type="button" onClick={onDelete}>Move to trash</button>
          </>
        )}
      </CardMenu>
    </article>
  );
}

function DashboardCard({
  dashboard,
  folders,
  view,
  onOpen,
  onRename,
  onStar,
  onMove,
  onDelete,
  onRestore,
  onPermanentlyDelete,
  inTrash = false,
}: {
  dashboard: WorkspaceDashboard;
  folders: WorkspaceFolder[];
  view: WorkspaceView;
  onOpen: () => void;
  onRename: () => void;
  onStar: () => void;
  onMove: (folderId: string) => void;
  onDelete: () => void;
  onRestore: () => void;
  onPermanentlyDelete: () => void;
  inTrash?: boolean;
}) {
  return (
    <article className={`home-dashboard-card${view === 'list' ? ' home-dashboard-card-list' : ''}`}>
      <button className="home-dashboard-open" type="button" onClick={onOpen} disabled={inTrash} aria-label={`Open dashboard ${dashboard.name}`}>
        <span className="home-dashboard-thumbnail" aria-hidden="true">
          <DashboardPreview dashboard={dashboard} />
        </span>
        <span className="home-dashboard-details">
          {icon('/assets/home-grid-item.svg', 'home-dashboard-kind-icon')}
          <span className="home-dashboard-copy">
            <strong>{dashboard.name}</strong>
            <span>{inTrash ? 'In trash' : dashboard.modifiedLabel}</span>
          </span>
        </span>
      </button>
      <CardMenu label={`More options for ${dashboard.name}`}>
        {inTrash ? (
          <>
            <button type="button" onClick={onRestore}>Restore dashboard</button>
            <button className="home-menu-danger" type="button" onClick={onPermanentlyDelete}>Delete permanently</button>
          </>
        ) : (
          <>
            <button type="button" onClick={onRename}>Rename dashboard</button>
            <button type="button" onClick={onStar}>{dashboard.starred ? 'Remove from starred' : 'Add to starred'}</button>
            <label className="home-move-control">
              Move to folder
              <select value={dashboard.folderId} onChange={(event) => onMove(event.target.value)} aria-label={`Move ${dashboard.name} to folder`}>
                {folders.map((folder) => <option value={folder.id} key={folder.id}>{folder.name}</option>)}
              </select>
            </label>
            <button className="home-menu-danger" type="button" onClick={onDelete}>Move to trash</button>
          </>
        )}
      </CardMenu>
    </article>
  );
}

export default function HomeWorkspace({
  workspaceLabel,
  currency,
  onOpenDashboard,
}: {
  workspaceLabel: string;
  currency: string;
  onOpenDashboard: (dashboard: Pick<WorkspaceDashboard, 'id' | 'name'>, created: boolean) => void;
}) {
  const [workspace, setWorkspace] = useState(loadWorkspace);
  const [section, setSection] = useState<WorkspaceSection>('all-folders');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<WorkspaceSort>('modified');
  const [view, setView] = useState<WorkspaceView>('grid');
  const [dialog, setDialog] = useState<WorkspaceDialog | null>(null);
  const [dialogName, setDialogName] = useState('');
  const [dialogFolderId, setDialogFolderId] = useState('');
  const [dialogError, setDialogError] = useState('');
  const [storageError, setStorageError] = useState(false);

  const activeFolders = useMemo(() => workspace.folders.filter((folder) => folder.deletedAt === null), [workspace.folders]);
  const activeFolder = selectedFolderId
    ? activeFolders.find((folder) => folder.id === selectedFolderId) ?? null
    : null;
  const allDashboards = useMemo(() => workspace.dashboards.filter((dashboard) => dashboard.deletedAt === null), [workspace.dashboards]);
  const deletedDashboards = useMemo(() => workspace.dashboards.filter((dashboard) => dashboard.deletedAt !== null
    && workspace.folders.some((folder) => folder.id === dashboard.folderId && folder.deletedAt === null)), [workspace.dashboards, workspace.folders]);
  const deletedFolders = useMemo(() => workspace.folders.filter((folder) => folder.deletedAt !== null), [workspace.folders]);
  const activeSection = activeFolder ? 'folder' : section;
  const query = search.trim().toLocaleLowerCase();

  const commitWorkspace = (next: WorkspaceState) => {
    setWorkspace(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  };

  const setHomeSection = (next: WorkspaceSection) => {
    setSelectedFolderId(null);
    setSection(next);
    setSearch('');
    setSort('modified');
  };

  const openFolder = (folderId: string) => {
    setSelectedFolderId(folderId);
    setSection('all-folders');
    setSearch('');
    setSort('modified');
  };

  const showDialog = (next: WorkspaceDialog, name = '', folderId = '') => {
    setDialog(next);
    setDialogName(name);
    setDialogFolderId(folderId);
    setDialogError('');
  };

  const closeDialog = () => {
    setDialog(null);
    setDialogName('');
    setDialogFolderId('');
    setDialogError('');
  };

  const editDialogForName = (id: string, type: 'folder' | 'dashboard') => {
    const item = type === 'folder'
      ? workspace.folders.find((folder) => folder.id === id)
      : workspace.dashboards.find((dashboard) => dashboard.id === id);
    if (!item) return;
    showDialog(type === 'folder' ? { type: 'rename-folder', id } : { type: 'rename-dashboard', id }, item.name);
  };

  const openDashboard = (dashboard: WorkspaceDashboard, created = false) => {
    if (dashboard.deletedAt !== null) return;
    const now = Date.now();
    const next: WorkspaceState = {
      ...workspace,
      dashboards: workspace.dashboards.map((item) => item.id === dashboard.id ? { ...item, lastOpenedAt: now } : item),
    };
    commitWorkspace(next);
    onOpenDashboard({ id: dashboard.id, name: dashboard.name }, created);
  };

  const submitDialog = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = dialogName.trim().slice(0, 64);
    if (!dialog || !name) {
      setDialogError('Enter a name to continue.');
      return;
    }

    if (dialog.type === 'create-folder' || dialog.type === 'rename-folder') {
      const conflict = workspace.folders.some((folder) => folder.deletedAt === null
        && folder.name.toLocaleLowerCase() === name.toLocaleLowerCase()
        && (dialog.type !== 'rename-folder' || folder.id !== dialog.id));
      if (conflict) {
        setDialogError('A folder with this name already exists.');
        return;
      }
      const now = Date.now();
      const nextFolders = dialog.type === 'create-folder'
        ? [{ id: createId('folder'), name, modifiedAt: now, modifiedLabel: 'Updated just now', deletedAt: null }, ...workspace.folders]
        : workspace.folders.map((folder) => folder.id === dialog.id
          ? { ...folder, name, modifiedAt: now, modifiedLabel: 'Updated just now' }
          : folder);
      commitWorkspace({ ...workspace, folders: nextFolders });
      closeDialog();
      return;
    }

    if (dialog.type === 'create-dashboard') {
      if (!activeFolders.some((folder) => folder.id === dialogFolderId)) {
        setDialogError('Choose a folder for this dashboard.');
        return;
      }
      const conflict = workspace.dashboards.some((dashboard) => dashboard.deletedAt === null
        && dashboard.folderId === dialogFolderId
        && dashboard.name.toLocaleLowerCase() === name.toLocaleLowerCase());
      if (conflict) {
        setDialogError('A dashboard with this name already exists in that folder.');
        return;
      }
      const now = Date.now();
      const dashboard: WorkspaceDashboard = {
        id: createId('dashboard'),
        name,
        folderId: dialogFolderId,
        modifiedAt: now,
        modifiedLabel: 'Edited just now',
        lastOpenedAt: now,
        preview: 'line',
        starred: false,
        deletedAt: null,
      };
      const next: WorkspaceState = {
        ...workspace,
        folders: workspace.folders.map((folder) => folder.id === dialogFolderId
          ? { ...folder, modifiedAt: now, modifiedLabel: 'Updated just now' }
          : folder),
        dashboards: [dashboard, ...workspace.dashboards],
      };
      commitWorkspace(next);
      closeDialog();
      onOpenDashboard({ id: dashboard.id, name: dashboard.name }, true);
      return;
    }

    const existing = workspace.dashboards.find((dashboard) => dashboard.id === dialog.id);
    const conflict = existing && workspace.dashboards.some((dashboard) => dashboard.deletedAt === null
      && dashboard.folderId === existing.folderId
      && dashboard.name.toLocaleLowerCase() === name.toLocaleLowerCase()
      && dashboard.id !== existing.id);
    if (conflict) {
      setDialogError('A dashboard with this name already exists in that folder.');
      return;
    }
    const now = Date.now();
    commitWorkspace({
      ...workspace,
      dashboards: workspace.dashboards.map((dashboard) => dashboard.id === dialog.id
        ? { ...dashboard, name, modifiedAt: now, modifiedLabel: 'Edited just now' }
        : dashboard),
    });
    closeDialog();
  };

  const createDashboard = () => {
    const folderId = activeFolder?.id ?? activeFolders[0]?.id ?? '';
    showDialog({ type: 'create-dashboard' }, '', folderId);
  };

  const moveDashboard = (dashboardId: string, folderId: string) => {
    const now = Date.now();
    const dashboard = workspace.dashboards.find((item) => item.id === dashboardId);
    if (!dashboard || dashboard.folderId === folderId) return;
    commitWorkspace({
      ...workspace,
      folders: workspace.folders.map((folder) => folder.id === dashboard.folderId || folder.id === folderId
        ? { ...folder, modifiedAt: now, modifiedLabel: 'Updated just now' }
        : folder),
      dashboards: workspace.dashboards.map((item) => item.id === dashboardId
        ? { ...item, folderId, modifiedAt: now, modifiedLabel: 'Edited just now' }
        : item),
    });
  };

  const updateDashboard = (dashboardId: string, update: Partial<WorkspaceDashboard>) => {
    const now = Date.now();
    const existing = workspace.dashboards.find((item) => item.id === dashboardId);
    if (!existing) return;
    commitWorkspace({
      ...workspace,
      folders: workspace.folders.map((folder) => folder.id === existing.folderId
        ? { ...folder, modifiedAt: now, modifiedLabel: 'Updated just now' }
        : folder),
      dashboards: workspace.dashboards.map((item) => item.id === dashboardId ? { ...item, ...update } : item),
    });
  };

  const trashDashboard = (dashboardId: string) => updateDashboard(dashboardId, { deletedAt: Date.now() });

  const restoreDashboard = (dashboardId: string) => updateDashboard(dashboardId, { deletedAt: null });

  const permanentlyDeleteDashboard = (dashboardId: string) => {
    const dashboard = workspace.dashboards.find((item) => item.id === dashboardId);
    if (!dashboard || !window.confirm(`Permanently delete “${dashboard.name}”?`)) return;
    commitWorkspace({ ...workspace, dashboards: workspace.dashboards.filter((item) => item.id !== dashboardId) });
  };

  const trashFolder = (folderId: string) => {
    const now = Date.now();
    commitWorkspace({
      ...workspace,
      folders: workspace.folders.map((folder) => folder.id === folderId
        ? { ...folder, deletedAt: now, modifiedAt: now, modifiedLabel: 'Moved to trash just now' }
        : folder),
      dashboards: workspace.dashboards.map((dashboard) => dashboard.folderId === folderId && dashboard.deletedAt === null
        ? { ...dashboard, deletedAt: now }
        : dashboard),
    });
    setSelectedFolderId(null);
  };

  const restoreFolder = (folderId: string) => {
    const folder = workspace.folders.find((item) => item.id === folderId);
    const now = Date.now();
    const folderDeletedAt = folder?.deletedAt;
    commitWorkspace({
      ...workspace,
      folders: workspace.folders.map((item) => item.id === folderId
        ? { ...item, deletedAt: null, modifiedAt: now, modifiedLabel: 'Restored just now' }
        : item),
      dashboards: workspace.dashboards.map((dashboard) => dashboard.folderId === folderId && dashboard.deletedAt === folderDeletedAt
        ? { ...dashboard, deletedAt: null }
        : dashboard),
    });
    if (folder) setSelectedFolderId(null);
  };

  const permanentlyDeleteFolder = (folderId: string) => {
    const folder = workspace.folders.find((item) => item.id === folderId);
    if (!folder || !window.confirm(`Permanently delete “${folder.name}” and its dashboards?`)) return;
    commitWorkspace({
      ...workspace,
      folders: workspace.folders.filter((item) => item.id !== folderId),
      dashboards: workspace.dashboards.filter((dashboard) => dashboard.folderId !== folderId),
    });
  };

  const filteredFolders = useMemo(() => {
    const queryText = search.trim().toLocaleLowerCase();
    const source = activeSection === 'trash' ? deletedFolders : activeFolders;
    const result = source.filter((folder) => {
      const dashboards = folderDashboards(workspace, folder.id, activeSection === 'trash');
      return !queryText || folder.name.toLocaleLowerCase().includes(queryText)
        || dashboards.some((dashboard) => dashboard.name.toLocaleLowerCase().includes(queryText));
    });
    return [...result].sort((left, right) => {
      if (sort === 'name') return left.name.localeCompare(right.name);
      if (sort === 'count') return folderDashboards(workspace, right.id, activeSection === 'trash').length
        - folderDashboards(workspace, left.id, activeSection === 'trash').length;
      return right.modifiedAt - left.modifiedAt;
    });
  }, [activeFolders, activeSection, deletedFolders, search, sort, workspace]);

  const visibleDashboards = useMemo(() => {
    let result = activeSection === 'trash'
      ? deletedDashboards
      : activeSection === 'starred'
        ? allDashboards.filter((dashboard) => dashboard.starred)
        : activeSection === 'recent'
          ? [...allDashboards].sort((left, right) => right.lastOpenedAt - left.lastOpenedAt).slice(0, 20)
          : activeSection === 'folder' && activeFolder
            ? folderDashboards(workspace, activeFolder.id)
            : [];
    if (query) result = result.filter((dashboard) => dashboard.name.toLocaleLowerCase().includes(query));
    return [...result].sort((left, right) => {
      if (activeSection === 'recent') return right.lastOpenedAt - left.lastOpenedAt;
      if (sort === 'name') return left.name.localeCompare(right.name);
      return right.modifiedAt - left.modifiedAt;
    });
  }, [activeFolder, activeSection, allDashboards, deletedDashboards, query, sort, workspace]);

  const sectionTitle = activeFolder?.name
    ?? (activeSection === 'recent' ? 'Recently opened'
      : activeSection === 'starred' ? 'Starred dashboards'
        : activeSection === 'trash' ? 'Trash'
          : activeSection === 'settings' ? 'Workspace settings'
            : 'Your dashboards, organized.');
  const sectionDescription = activeFolder
    ? activeFolder.id === 'folder-sales-reports' ? 'Weekly and daily views of your sales.' : 'Dashboards in this folder.'
    : activeSection === 'all-folders'
      ? 'Create a dashboard, pick up where you left off, or browse your folders.'
      : activeSection === 'recent' ? 'Continue with dashboards you opened recently.'
        : activeSection === 'starred' ? 'Keep the dashboards you return to within reach.'
          : activeSection === 'trash' ? 'Restore dashboards and folders you moved here.'
            : 'Local workspace preferences and storage details.';
  const allFolderCount = activeFolders.length;
  const dashboardCount = allDashboards.length;
  const isFolderListing = activeSection === 'all-folders' && !activeFolder;
  const isTrash = activeSection === 'trash';

  const handleCreateFolder = () => showDialog({ type: 'create-folder' });
  const handleCreateDashboard = () => {
    if (activeFolders.length === 0) {
      handleCreateFolder();
      return;
    }
    createDashboard();
  };

  const renderDashboardCards = (dashboards: WorkspaceDashboard[]) => (
    <div className={`home-dashboard-grid${view === 'list' ? ' home-dashboard-grid-list' : ''}`}>
      {dashboards.map((dashboard) => (
        <DashboardCard
          key={dashboard.id}
          dashboard={dashboard}
          folders={activeFolders}
          view={view}
          inTrash={isTrash}
          onOpen={() => openDashboard(dashboard)}
          onRename={() => editDialogForName(dashboard.id, 'dashboard')}
          onStar={() => updateDashboard(dashboard.id, { starred: !dashboard.starred })}
          onMove={(folderId) => moveDashboard(dashboard.id, folderId)}
          onDelete={() => trashDashboard(dashboard.id)}
          onRestore={() => restoreDashboard(dashboard.id)}
          onPermanentlyDelete={() => permanentlyDeleteDashboard(dashboard.id)}
        />
      ))}
      {dashboards.length === 0 && (
        <div className="home-empty-state" role="status">
          <h3>{isTrash ? 'Trash is empty' : activeSection === 'starred' ? 'No starred dashboards yet' : 'No dashboards found'}</h3>
          <p>{isTrash ? 'Deleted dashboards and folders will appear here.' : activeSection === 'starred' ? 'Use a dashboard’s options to add it to Starred.' : 'Create a dashboard or try a different search.'}</p>
        </div>
      )}
    </div>
  );

  const submitLabel = dialog?.type.startsWith('create') ? 'Create' : 'Save';
  const dialogTitle = dialog?.type === 'create-folder' ? 'Create a folder'
    : dialog?.type === 'create-dashboard' ? 'Create a dashboard'
      : dialog?.type === 'rename-folder' ? 'Rename folder'
        : 'Rename dashboard';

  return (
    <div className="home-workspace-layout">
      <aside className="home-sidebar" aria-label="Workspace sections">
        <div className="home-sidebar-identity">
          <span className="home-business-avatar" aria-hidden="true">{workspaceLabel.slice(0, 2).toUpperCase()}</span>
          <span className="home-business-copy">
            <strong>{workspaceLabel}</strong>
            <span>Your workspace</span>
          </span>
        </div>

        <nav className="home-sidebar-primary" aria-label="Dashboard workspace sections">
          <button className={activeSection === 'all-folders' || activeSection === 'folder' ? 'home-sidebar-link home-sidebar-link-active' : 'home-sidebar-link'} type="button" onClick={() => setHomeSection('all-folders')} aria-current={activeSection === 'all-folders' || activeSection === 'folder' ? 'page' : undefined}>
            {icon('/assets/home-folder.svg')}
            <span>All folders</span>
          </button>
          <button className={activeSection === 'recent' ? 'home-sidebar-link home-sidebar-link-active' : 'home-sidebar-link'} type="button" onClick={() => setHomeSection('recent')} aria-current={activeSection === 'recent' ? 'page' : undefined}>
            {icon('/assets/home-clock.svg')}
            <span>Recent</span>
          </button>
          <button className={activeSection === 'starred' ? 'home-sidebar-link home-sidebar-link-active' : 'home-sidebar-link'} type="button" onClick={() => setHomeSection('starred')} aria-current={activeSection === 'starred' ? 'page' : undefined}>
            {icon('/assets/home-star.svg')}
            <span>Starred</span>
          </button>
        </nav>

        <div className="home-sidebar-folder-section">
          <h2>Folders</h2>
          <nav aria-label="Folders">
            {activeFolders.slice(0, 3).map((folder) => (
              <button className={activeFolder?.id === folder.id ? 'home-sidebar-link home-sidebar-folder-link home-sidebar-link-active' : 'home-sidebar-link home-sidebar-folder-link'} key={folder.id} type="button" onClick={() => openFolder(folder.id)} aria-current={activeFolder?.id === folder.id ? 'page' : undefined}>
                {icon('/assets/home-folder.svg')}
                <span>{folder.name}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className="home-sidebar-bottom">
          <button className={activeSection === 'trash' ? 'home-sidebar-link home-sidebar-link-active' : 'home-sidebar-link'} type="button" onClick={() => setHomeSection('trash')} aria-current={activeSection === 'trash' ? 'page' : undefined}>
            {icon('/assets/home-trash.svg')}
            <span>Trash</span>
          </button>
          <button className={activeSection === 'settings' ? 'home-sidebar-link home-sidebar-link-active' : 'home-sidebar-link'} type="button" onClick={() => setHomeSection('settings')} aria-current={activeSection === 'settings' ? 'page' : undefined}>
            {icon('/assets/home-settings.svg')}
            <span>Workspace settings</span>
          </button>
        </div>
      </aside>

      <main className="home-main" aria-label="Dashboard workspace">
        <header className="home-heading">
          <div className="home-heading-copy">
            <p className="home-breadcrumb">Workspace <span aria-hidden="true">/</span> Home{activeFolder ? <> <span aria-hidden="true">/</span> {activeFolder.name}</> : null}</p>
            <h1>{sectionTitle}</h1>
            <p className="home-description">{sectionDescription}</p>
          </div>
          {activeSection === 'all-folders' && !activeFolder && (
            <div className="home-heading-actions">
              <button className="home-button home-button-secondary" type="button" onClick={handleCreateFolder}>
                {icon('/assets/home-folder.svg')}
                New folder
              </button>
              <button className="home-button home-button-primary" type="button" onClick={handleCreateDashboard}>
                {icon('/assets/home-plus.svg')}
                New dashboard
              </button>
            </div>
          )}
        </header>

        <section className="home-browse-section" aria-labelledby="home-browse-title">
          <div className="home-browse-toolbar">
            <div className="home-browse-title-wrap">
              {activeFolder ? (
                <button className="home-back-button" type="button" onClick={() => setHomeSection('all-folders')}>
                  {icon('/assets/home-back-arrow.svg')}
                  All folders
                </button>
              ) : (
                <h2 id="home-browse-title">{activeSection === 'recent' ? 'Recently opened' : activeSection === 'starred' ? 'Starred dashboards' : isTrash ? 'Recently deleted' : isFolderListing ? 'All folders' : 'Dashboards'}</h2>
              )}
              <span className="home-browse-count">
                {activeFolder ? countLabel(visibleDashboards.length, 'dashboard')
                  : isFolderListing ? countLabel(filteredFolders.length, 'folder')
                    : activeSection === 'recent' ? countLabel(visibleDashboards.length, 'dashboard')
                      : activeSection === 'starred' ? countLabel(visibleDashboards.length, 'dashboard')
                          : isTrash ? countLabel(deletedFolders.length + deletedDashboards.length, 'item')
                          : ''}
              </span>
            </div>
            {activeSection !== 'settings' && (
              <div className="home-browse-controls">
                <label className="home-search">
                  {icon('/assets/home-search.svg')}
                  <span className="sr-only">Search dashboards or folders</span>
                  <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={activeFolder ? 'Search this folder' : 'Search dashboards or folders'} aria-label={activeFolder ? 'Search this folder' : 'Search dashboards or folders'} />
                </label>
                <label className="home-sort">
                  {icon('/assets/home-chevron.svg')}
                  <span className="sr-only">Sort workspace</span>
                  <select value={sort} onChange={(event) => setSort(event.target.value as WorkspaceSort)} aria-label="Sort workspace">
                    <option value="modified">Last modified</option>
                    <option value="name">Name A–Z</option>
                    {isFolderListing && <option value="count">Most dashboards</option>}
                  </select>
                </label>
                <div className="home-view-toggle" role="group" aria-label="Workspace view">
                  <button type="button" className={view === 'grid' ? 'home-view-active' : ''} onClick={() => setView('grid')} aria-label="Grid view" aria-pressed={view === 'grid'}>{icon('/assets/home-grid-item.svg')}</button>
                  <button type="button" className={view === 'list' ? 'home-view-active' : ''} onClick={() => setView('list')} aria-label="List view" aria-pressed={view === 'list'}>{icon('/assets/home-list.svg')}</button>
                </div>
              </div>
            )}
          </div>

          {activeSection === 'settings' ? (
            <section className="home-settings-card" aria-labelledby="workspace-storage-title">
              <h2 id="workspace-storage-title">Workspace storage</h2>
              <p>Home folders and dashboard names are stored in this browser for this preview. Account sync and saved dashboard layouts are not connected here.</p>
              <span className="home-local-status">Local workspace · {currency}</span>
              {storageError && <p className="home-storage-error" role="alert">This browser could not save the latest workspace changes.</p>}
            </section>
          ) : isFolderListing || isTrash ? (
            <>
              {isFolderListing && (
                <div className={`home-folder-grid${view === 'list' ? ' home-folder-grid-list' : ''}`}>
                  {filteredFolders.map((folder) => (
                    <FolderCard
                      key={folder.id}
                      folder={folder}
                      dashboards={folderDashboards(workspace, folder.id)}
                      view={view}
                      onOpen={() => openFolder(folder.id)}
                      onRename={() => editDialogForName(folder.id, 'folder')}
                      onDelete={() => trashFolder(folder.id)}
                      onRestore={() => restoreFolder(folder.id)}
                      onPermanentlyDelete={() => permanentlyDeleteFolder(folder.id)}
                    />
                  ))}
                  {filteredFolders.length === 0 && <div className="home-empty-state" role="status"><h3>No folders found</h3><p>Create a folder or try a different search.</p></div>}
                </div>
              )}
              {isTrash && (
                <>
                  {deletedFolders.length > 0 && <div className="home-trash-folders">
                    {deletedFolders.map((folder) => (
                      <FolderCard key={folder.id} folder={folder} dashboards={folderDashboards(workspace, folder.id, true)} view={view} onOpen={() => undefined} onRename={() => undefined} onDelete={() => undefined} onRestore={() => restoreFolder(folder.id)} onPermanentlyDelete={() => permanentlyDeleteFolder(folder.id)} inTrash />
                    ))}
                  </div>}
                  {renderDashboardCards(visibleDashboards)}
                </>
              )}
            </>
          ) : (
            <>
              {renderDashboardCards(visibleDashboards)}
              {isFolderListing && <p className="home-workspace-footer">{dashboardCount} dashboards across {allFolderCount} folders</p>}
            </>
          )}
        </section>

        {isFolderListing && (
          <section className="home-recent-section" aria-labelledby="home-recent-title">
            <div className="home-recent-heading">
              <h2 id="home-recent-title">Recently opened</h2>
              <button type="button" onClick={() => setHomeSection('recent')}>View all recent</button>
            </div>
            <div className="home-recent-grid">
              {[...allDashboards].sort((left, right) => right.lastOpenedAt - left.lastOpenedAt).slice(0, 3).map((dashboard) => (
                <button className="home-recent-card" key={dashboard.id} type="button" onClick={() => openDashboard(dashboard)}>
                  <span className={`home-recent-preview home-preview-tone-${dashboard.preview === 'bar' || dashboard.preview === 'comparison' ? 'warm' : 'sage'}`}><DashboardPreview dashboard={dashboard} compact /></span>
                  <span className="home-recent-copy"><strong>{dashboard.name}</strong><span>{activeFolders.find((folder) => folder.id === dashboard.folderId)?.name ?? 'Dashboard'}</span></span>
                </button>
              ))}
            </div>
            <p className="home-workspace-footer">{countLabel(dashboardCount, 'dashboard')} across {countLabel(allFolderCount, 'folder')}</p>
          </section>
        )}

        {storageError && activeSection !== 'settings' && <p className="home-storage-error" role="alert">This browser could not save the latest workspace changes.</p>}
      </main>

      {dialog && (
        <div className="home-dialog-backdrop">
          <section className="home-dialog" role="dialog" aria-modal="true" aria-labelledby="home-dialog-title">
            <h2 id="home-dialog-title">{dialogTitle}</h2>
            <form onSubmit={submitDialog}>
              <label className="home-dialog-field">
                <span>{dialog.type.endsWith('folder') ? 'Folder name' : 'Dashboard name'}</span>
                <input autoFocus maxLength={64} value={dialogName} onChange={(event) => setDialogName(event.target.value)} placeholder={dialog.type.endsWith('folder') ? 'For example, Sales reports' : 'For example, Weekly sales overview'} />
              </label>
              {dialog.type === 'create-dashboard' && (
                <label className="home-dialog-field">
                  <span>Folder</span>
                  <select value={dialogFolderId} onChange={(event) => setDialogFolderId(event.target.value)} required>
                    {activeFolders.map((folder) => <option value={folder.id} key={folder.id}>{folder.name}</option>)}
                  </select>
                </label>
              )}
              {dialogError && <p className="home-dialog-error" role="alert">{dialogError}</p>}
              <div className="home-dialog-actions">
                <button className="home-button home-button-secondary" type="button" onClick={closeDialog}>Cancel</button>
                <button className="home-button home-button-primary" type="submit">{submitLabel}</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
