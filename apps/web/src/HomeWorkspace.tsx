import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { apiFetch } from './api';
import CustomSelect from './CustomSelect';

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

function countLabel(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

function createEmptyWorkspace(): WorkspaceState {
  return { version: 1, folders: [], dashboards: [] };
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

function loadWorkspace(storageKey: string): WorkspaceState {
  if (typeof window === 'undefined') return createEmptyWorkspace();
  try {
    const saved = window.localStorage.getItem(storageKey);
    if (!saved) return createEmptyWorkspace();
    const parsed: unknown = JSON.parse(saved);
    return isWorkspaceState(parsed) ? parsed : createEmptyWorkspace();
  } catch {
    return createEmptyWorkspace();
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
            <div className="home-move-control">
              <span>Move to folder</span>
              <CustomSelect
                value={dashboard.folderId}
                ariaLabel={`Move ${dashboard.name} to folder`}
                variant="compact"
                options={folders.map((folder) => ({ value: folder.id, label: folder.name }))}
                onChange={onMove}
              />
            </div>
            <button className="home-menu-danger" type="button" onClick={onDelete}>Move to trash</button>
          </>
        )}
      </CardMenu>
    </article>
  );
}

export default function HomeWorkspace({
  workspaceLabel,
  workspaceId,
  currency,
  onOpenDashboard,
}: {
  workspaceLabel: string;
  workspaceId: string;
  currency: string;
  onOpenDashboard: (dashboard: Pick<WorkspaceDashboard, 'id' | 'name'>, created: boolean) => void;
}) {
  const storageKey = `${STORAGE_KEY}:${workspaceId}`;
  const [workspace, setWorkspace] = useState(() => loadWorkspace(storageKey));
  const [serverDashboardIds, setServerDashboardIds] = useState<Set<string> | null>(null);
  const [dashboardLoadError, setDashboardLoadError] = useState<string | null>(null);
  const [dashboardMutationError, setDashboardMutationError] = useState<string | null>(null);
  const [dashboardListRevision, setDashboardListRevision] = useState(0);
  const [creatingDashboard, setCreatingDashboard] = useState(false);
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

  useEffect(() => {
    let cancelled = false;
    void apiFetch('/api/v1/dashboards').then(async (response) => {
      const payload = await response.json().catch(() => null) as { data?: { dashboards?: Array<{ id: string; name: string; updated_at?: string; widgets?: Array<{ format?: string; type?: string }> }> }; message?: string } | null;
      if (!response.ok || !Array.isArray(payload?.data?.dashboards)) {
        throw new Error(payload?.message ?? `Saved dashboards could not be loaded (${response.status}).`);
      }
      if (cancelled) return;
      const records = payload.data.dashboards;
      const ids = new Set(records.map((item) => item.id));
      setWorkspace((current) => {
        let folders = current.folders;
        const defaultFolder = folders.find((folder) => folder.deletedAt === null);
        if (records.length > 0 && !defaultFolder) {
          const now = Date.now();
          folders = [{ id: createId('folder'), name: 'My dashboards', modifiedAt: now, modifiedLabel: 'Updated just now', deletedAt: null }, ...folders];
        }
        const folderId = folders.find((folder) => folder.deletedAt === null)?.id ?? '';
        const dashboards = records.map((record) => {
          const previous = current.dashboards.find((item) => item.id === record.id);
          const folderExists = folders.some((folder) => folder.id === previous?.folderId && folder.deletedAt === null);
          const updatedAt = record.updated_at ? Date.parse(record.updated_at) : Date.now();
          const preview: PreviewKind = record.widgets?.some((item) => item.type === 'bar')
            ? 'bar'
            : record.widgets?.some((item) => item.format === 'comparison') ? 'comparison' : 'line';
          return {
            id: record.id,
            name: record.name,
            folderId: folderExists ? previous!.folderId : folderId,
            modifiedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now(),
            modifiedLabel: previous?.modifiedLabel ?? 'Saved to this business',
            lastOpenedAt: previous?.lastOpenedAt ?? 0,
            preview: previous?.preview ?? preview,
            starred: previous?.starred ?? false,
            deletedAt: previous?.deletedAt ?? null,
          };
        });
        const next = { ...current, folders, dashboards };
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(next));
          setStorageError(false);
        } catch {
          setStorageError(true);
        }
        return next;
      });
      setServerDashboardIds(ids);
      setDashboardLoadError(null);
    }).catch((error: unknown) => {
      if (cancelled) return;
      setServerDashboardIds(new Set());
      setDashboardLoadError(error instanceof Error ? error.message : 'Saved dashboards could not be loaded.');
    });
    return () => { cancelled = true; };
  }, [dashboardListRevision, storageKey]);

  const activeFolders = useMemo(() => workspace.folders.filter((folder) => folder.deletedAt === null), [workspace.folders]);
  const activeFolder = selectedFolderId
    ? activeFolders.find((folder) => folder.id === selectedFolderId) ?? null
    : null;
  const serverWorkspace: WorkspaceState = { ...workspace, dashboards: serverDashboardIds === null
    ? []
    : workspace.dashboards.filter((dashboard) => serverDashboardIds.has(dashboard.id)) };
  const allDashboards = useMemo(() => serverWorkspace.dashboards.filter((dashboard) => dashboard.deletedAt === null), [serverWorkspace.dashboards]);
  const deletedDashboards = useMemo(() => serverWorkspace.dashboards.filter((dashboard) => dashboard.deletedAt !== null
    && workspace.folders.some((folder) => folder.id === dashboard.folderId && folder.deletedAt === null)), [serverWorkspace.dashboards, workspace.folders]);
  const deletedFolders = useMemo(() => workspace.folders.filter((folder) => folder.deletedAt !== null), [workspace.folders]);
  const activeSection = activeFolder ? 'folder' : section;
  const query = search.trim().toLocaleLowerCase();

  const commitWorkspace = (next: WorkspaceState) => {
    setWorkspace(next);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
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

  const submitDialog = async (event: FormEvent<HTMLFormElement>) => {
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
      const selectedFolder = activeFolders.find((folder) => folder.id === dialogFolderId);
      const createDefaultFolder = !selectedFolder && activeFolders.length === 0 && dialogFolderId === '';
      if (!selectedFolder && !createDefaultFolder) {
        setDialogError('Choose a folder for this dashboard.');
        return;
      }
      const targetFolder = selectedFolder ?? {
        id: createId('folder'),
        name: 'My dashboards',
        modifiedAt: Date.now(),
        modifiedLabel: 'Updated just now',
        deletedAt: null,
      };
      const conflict = workspace.dashboards.some((dashboard) => dashboard.deletedAt === null
        && dashboard.folderId === targetFolder.id
        && dashboard.name.toLocaleLowerCase() === name.toLocaleLowerCase());
      if (conflict) {
        setDialogError('A dashboard with this name already exists in that folder.');
        return;
      }
      setCreatingDashboard(true);
      try {
        const response = await apiFetch('/api/v1/dashboards', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name, widgets: [], layout: [], schema_version: 1 }),
        });
        const payload = await response.json().catch(() => null) as { data?: { id?: string; name?: string }; message?: string } | null;
        if (!response.ok || !payload?.data?.id) {
          throw new Error(payload?.message ?? `Dashboard could not be saved (${response.status}).`);
        }
        const now = Date.now();
        const dashboard: WorkspaceDashboard = {
          id: payload.data.id,
          name: payload.data.name ?? name,
          folderId: targetFolder.id,
          modifiedAt: now,
          modifiedLabel: 'Saved just now',
          lastOpenedAt: now,
          preview: 'line',
          starred: false,
          deletedAt: null,
        };
        const next: WorkspaceState = {
          ...workspace,
          folders: createDefaultFolder
            ? [targetFolder, ...workspace.folders]
            : workspace.folders.map((folder) => folder.id === targetFolder.id
              ? { ...folder, modifiedAt: now, modifiedLabel: 'Updated just now' }
              : folder),
          dashboards: [
            dashboard,
            ...workspace.dashboards.filter((item) => item.id !== dashboard.id && !(item.folderId === targetFolder.id && item.name.toLocaleLowerCase() === name.toLocaleLowerCase())),
          ],
        };
        setServerDashboardIds((current) => new Set([...(current ?? []), dashboard.id]));
        setDashboardLoadError(null);
        commitWorkspace(next);
        closeDialog();
        onOpenDashboard({ id: dashboard.id, name: dashboard.name }, true);
      } catch (error) {
        setDialogError(error instanceof Error ? error.message : 'Dashboard could not be saved.');
      } finally {
        setCreatingDashboard(false);
      }
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
    if (dialog.type === 'rename-dashboard') {
      if (!existing) {
        setDialogError('This dashboard is no longer available.');
        return;
      }
      try {
        const currentResponse = await apiFetch(`/api/v1/dashboards/${existing.id}`);
        const currentPayload = await currentResponse.json().catch(() => null) as { data?: { version?: string; widgets?: unknown[]; layout?: unknown[] }; message?: string } | null;
        if (!currentResponse.ok || !currentPayload?.data?.version) {
          throw new Error(currentPayload?.message ?? `Dashboard could not be loaded (${currentResponse.status}).`);
        }
        const updateResponse = await apiFetch(`/api/v1/dashboards/${existing.id}`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name,
            expected_version: currentPayload.data.version,
            widgets: currentPayload.data.widgets ?? [],
            layout: currentPayload.data.layout ?? [],
            schema_version: 1,
          }),
        });
        const updatePayload = await updateResponse.json().catch(() => null) as { message?: string } | null;
        if (!updateResponse.ok) throw new Error(updatePayload?.message ?? `Dashboard name could not be saved (${updateResponse.status}).`);
      } catch (error) {
        setDialogError(error instanceof Error ? error.message : 'Dashboard name could not be saved.');
        return;
      }
    }
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

  const trashDashboard = (dashboardId: string) => {
    updateDashboard(dashboardId, { deletedAt: Date.now() });
    void apiFetch(`/api/v1/dashboards/${dashboardId}`, { method: 'DELETE' }).catch(() => null);
    setServerDashboardIds((current) => new Set([...(current ?? [])].filter((id) => id !== dashboardId)));
  };

  const restoreDashboard = (dashboardId: string) => {
    updateDashboard(dashboardId, { deletedAt: null });
    const dashboard = workspace.dashboards.find((item) => item.id === dashboardId);
    if (dashboard) {
      void apiFetch('/api/v1/dashboards', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: dashboard.id, name: dashboard.name, widgets: [], layout: [], schema_version: 1 }),
      }).then((res) => {
        if (res.ok) setServerDashboardIds((current) => new Set([...(current ?? []), dashboard.id]));
      }).catch(() => null);
    }
  };

  const permanentlyDeleteDashboard = async (dashboardId: string) => {
    const dashboard = workspace.dashboards.find((item) => item.id === dashboardId);
    if (!dashboard || !window.confirm(`Permanently delete “${dashboard.name}”?`)) return;
    try {
      const response = await apiFetch(`/api/v1/dashboards/${dashboardId}`, { method: 'DELETE' });
      const payload = await response.json().catch(() => null) as { message?: string } | null;
      if (!response.ok) throw new Error(payload?.message ?? `Dashboard could not be deleted (${response.status}).`);
      setServerDashboardIds((current) => new Set([...(current ?? [])].filter((id) => id !== dashboardId)));
      setDashboardMutationError(null);
    } catch (error) {
      setDashboardMutationError(error instanceof Error ? error.message : 'Dashboard could not be deleted.');
      return;
    }
    commitWorkspace({ ...workspace, dashboards: workspace.dashboards.filter((item) => item.id !== dashboardId) });
  };

  const trashFolder = (folderId: string) => {
    const now = Date.now();
    const folderDashboards = workspace.dashboards.filter((d) => d.folderId === folderId);
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
    for (const d of folderDashboards) {
      void apiFetch(`/api/v1/dashboards/${d.id}`, { method: 'DELETE' }).catch(() => null);
    }
    setServerDashboardIds((current) => new Set([...(current ?? [])].filter((id) => !folderDashboards.some((d) => d.id === id))));
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

  const permanentlyDeleteFolder = async (folderId: string) => {
    const folder = workspace.folders.find((item) => item.id === folderId);
    if (!folder || !window.confirm(`Permanently delete “${folder.name}” and its dashboards?`)) return;
    const dashboards = workspace.dashboards.filter((dashboard) => dashboard.folderId === folderId);
    try {
      const results = await Promise.all(dashboards.map(async (dashboard) => {
        const response = await apiFetch(`/api/v1/dashboards/${dashboard.id}`, { method: 'DELETE' });
        if (!response.ok) {
          const payload = await response.json().catch(() => null) as { message?: string } | null;
          throw new Error(payload?.message ?? `Dashboard could not be deleted (${response.status}).`);
        }
        return dashboard.id;
      }));
      setServerDashboardIds((current) => new Set([...(current ?? [])].filter((id) => !results.includes(id))));
      setDashboardMutationError(null);
    } catch (error) {
      setDashboardMutationError(error instanceof Error ? error.message : 'Dashboards in this folder could not be deleted.');
      setDashboardListRevision((revision) => revision + 1);
      return;
    }
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
      const dashboards = folderDashboards(serverWorkspace, folder.id, activeSection === 'trash');
      return !queryText || folder.name.toLocaleLowerCase().includes(queryText)
        || dashboards.some((dashboard) => dashboard.name.toLocaleLowerCase().includes(queryText));
    });
    return [...result].sort((left, right) => {
      if (sort === 'name') return left.name.localeCompare(right.name);
      if (sort === 'count') return folderDashboards(serverWorkspace, right.id, activeSection === 'trash').length
        - folderDashboards(serverWorkspace, left.id, activeSection === 'trash').length;
      return right.modifiedAt - left.modifiedAt;
    });
  }, [activeFolders, activeSection, deletedFolders, search, sort, serverWorkspace]);

  const visibleDashboards = useMemo(() => {
    let result = activeSection === 'trash'
      ? deletedDashboards
      : activeSection === 'starred'
        ? allDashboards.filter((dashboard) => dashboard.starred)
        : activeSection === 'recent'
          ? [...allDashboards].sort((left, right) => right.lastOpenedAt - left.lastOpenedAt).slice(0, 20)
          : activeSection === 'folder' && activeFolder
            ? folderDashboards(serverWorkspace, activeFolder.id)
            : [];
    if (query) result = result.filter((dashboard) => dashboard.name.toLocaleLowerCase().includes(query));
    return [...result].sort((left, right) => {
      if (activeSection === 'recent') return right.lastOpenedAt - left.lastOpenedAt;
      if (sort === 'name') return left.name.localeCompare(right.name);
      return right.modifiedAt - left.modifiedAt;
    });
  }, [activeFolder, activeSection, allDashboards, deletedDashboards, query, sort, serverWorkspace]);

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

        {serverDashboardIds === null && <p className="home-storage-error" role="status">Loading saved dashboards from this business…</p>}
        {dashboardLoadError && <p className="home-storage-error" role="alert">{dashboardLoadError} <button className="button button-outline" type="button" onClick={() => setDashboardListRevision((revision) => revision + 1)}>Retry</button></p>}
        {dashboardMutationError && <p className="home-storage-error" role="alert">{dashboardMutationError}</p>}

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
                <div className="home-sort">
                  <CustomSelect
                    value={sort}
                    ariaLabel="Sort workspace"
                    variant="pill"
                    options={[
                      { value: 'modified', label: 'Last modified' },
                      { value: 'name', label: 'Name A–Z' },
                      ...(isFolderListing ? [{ value: 'count', label: 'Most dashboards' }] : []),
                    ]}
                    onChange={(val) => setSort(val as WorkspaceSort)}
                  />
                </div>
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
              <p>Dashboard layouts are saved to this business. Folder organization, starred status, and Home display preferences are stored in this browser.</p>
              <span className="home-local-status">Browser folders · {currency}</span>
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
                      dashboards={folderDashboards(serverWorkspace, folder.id)}
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
                      <FolderCard key={folder.id} folder={folder} dashboards={folderDashboards(serverWorkspace, folder.id, true)} view={view} onOpen={() => undefined} onRename={() => undefined} onDelete={() => undefined} onRestore={() => restoreFolder(folder.id)} onPermanentlyDelete={() => permanentlyDeleteFolder(folder.id)} inTrash />
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
                <input
                  autoFocus
                  maxLength={64}
                  value={dialogName}
                  onChange={(event) => {
                    setDialogName(event.target.value);
                    if (dialogError) setDialogError('');
                  }}
                  aria-invalid={dialogError ? 'true' : undefined}
                  placeholder={dialog.type.endsWith('folder') ? 'For example, Sales reports' : 'For example, Weekly sales overview'}
                />
              </label>
              {dialogError && <p className="home-dialog-error" role="alert">{dialogError}</p>}
              {dialog.type === 'create-dashboard' && (
                <label className="home-dialog-field">
                  <span>Folder</span>
                  <CustomSelect
                    value={dialogFolderId}
                    ariaLabel="Folder"
                    variant="form"
                    disabled={activeFolders.length === 0}
                    options={
                      activeFolders.length === 0
                        ? [{ value: '', label: 'My dashboards (created on save)' }]
                        : activeFolders.map((folder) => ({ value: folder.id, label: folder.name }))
                    }
                    onChange={setDialogFolderId}
                  />
                </label>
              )}
              <div className="home-dialog-actions">
                <button className="home-button home-button-secondary" type="button" onClick={closeDialog} disabled={creatingDashboard}>Cancel</button>
                <button className="home-button home-button-primary" type="submit" disabled={creatingDashboard}>{creatingDashboard ? 'Saving…' : submitLabel}</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
