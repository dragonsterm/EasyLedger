import { randomUUID } from 'node:crypto';

import { OperationError, type DatabaseClient, type DatabasePool } from './mutations.ts';

export interface WidgetSpec {
  id: string;
  type: 'line' | 'bar' | 'kpi' | 'table';
  title: string;
  metric: 'units' | 'revenue';
  dimension?: 'date' | 'product' | 'none';
  filters?: {
    date_from?: string | null;
    date_to?: string | null;
    product_ids?: string[];
  };
  comparison?: string | null;
  format?: string | null;
  style?: 'sage' | 'warm';
  schema_version?: number;
}

export interface LayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DashboardView {
  id: string;
  business_id: string;
  name: string;
  schema_version: number;
  version: string;
  widgets: WidgetSpec[];
  layout: LayoutItem[];
  created_at: string;
  updated_at: string;
}

export interface DashboardDraftView extends DashboardView {
  is_draft: true;
  selected_widget_id?: string | null;
}

export interface DashboardOperation {
  type: 'add' | 'edit' | 'move' | 'resize' | 'remove' | 'select';
  widget_id?: string;
  target?: string;
  widget?: Partial<WidgetSpec> & {
    title?: string;
    type?: 'line' | 'bar' | 'kpi' | 'table';
    metric?: 'units' | 'revenue';
    dimension?: 'date' | 'product' | 'none';
    filters?: {
      date_from?: string | null;
      date_to?: string | null;
      product_ids?: string[];
    };
  };
  layout?: Partial<LayoutItem>;
  changes?: {
    title?: string;
    type?: 'line' | 'bar' | 'kpi' | 'table';
    metric?: 'units' | 'revenue';
    dimension?: 'date' | 'product' | 'none';
    filters?: {
      date_from?: string | null;
      date_to?: string | null;
      product_ids?: string[];
    };
  };
  position?: 'top' | 'bottom' | 'left' | 'right';
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}

export interface UpdateDashboardDraftInput {
  business_id: string;
  dashboard_id?: string;
  expected_version?: bigint | number | string;
  selected_widget_id?: string | null;
  operations: DashboardOperation[];
}

export interface SaveDashboardInput {
  business_id: string;
  id?: string;
  name: string;
  expected_version?: bigint | number | string;
  widgets?: WidgetSpec[];
  layout?: LayoutItem[];
  schema_version?: number;
}

interface DashboardRow {
  id: string;
  business_id: string;
  name: string;
  schema_version: number;
  version: string;
  widgets: unknown;
  layout: unknown;
  created_at: string | Date;
  updated_at: string | Date;
}

function parseJsonArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed as T[];
    } catch {}
  }
  return [];
}

function dashboardView(row: DashboardRow): DashboardView {
  return {
    id: row.id,
    business_id: row.business_id,
    name: row.name,
    schema_version: row.schema_version,
    version: row.version.toString(),
    widgets: parseJsonArray<WidgetSpec>(row.widgets),
    layout: parseJsonArray<LayoutItem>(row.layout),
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

export function createDefaultWidgetSpecs(): WidgetSpec[] {
  return [
    { id: 'total-revenue', type: 'kpi', title: 'Total revenue', metric: 'revenue', dimension: 'none', schema_version: 1 },
    { id: 'total-units', type: 'kpi', title: 'Units sold', metric: 'units', dimension: 'none', schema_version: 1 },
    { id: 'complete-days', type: 'kpi', title: 'Complete days', metric: 'units', dimension: 'date', schema_version: 1 },
    { id: 'daily-revenue', type: 'line', title: 'Daily revenue', metric: 'revenue', dimension: 'date', schema_version: 1 },
    { id: 'sales-by-product', type: 'bar', title: 'Sales by product', metric: 'units', dimension: 'product', schema_version: 1 },
  ];
}

export function createDefaultLayoutItems(): LayoutItem[] {
  return [
    { i: 'total-revenue', x: 0, y: 0, w: 4, h: 5 },
    { i: 'total-units', x: 4, y: 0, w: 4, h: 5 },
    { i: 'complete-days', x: 8, y: 0, w: 4, h: 5 },
    { i: 'daily-revenue', x: 0, y: 5, w: 6, h: 10 },
    { i: 'sales-by-product', x: 6, y: 5, w: 6, h: 10 },
  ];
}

function resolveTargetWidgetId(
  op: DashboardOperation,
  widgets: WidgetSpec[],
  selectedWidgetId?: string | null,
): string {
  const target = (op.widget_id ?? op.target ?? '').trim();

  if (target === 'that chart' || target === 'ambiguous' || target === 'this chart' || target === 'the chart') {
    throw new OperationError('NEEDS_CLARIFICATION', 'Which chart would you like to update? Please specify the chart.', {
      httpStatus: 422,
      fieldErrors: { widget_id: 'ambiguous_target' },
    });
  }

  if (target) {
    const foundById = widgets.find((w) => w.id === target);
    if (foundById) return foundById.id;

    const foundByTitle = widgets.find((w) => w.title.toLowerCase() === target.toLowerCase());
    if (foundByTitle) return foundByTitle.id;

    const targetLower = target.toLowerCase();
    const isChartQuery = targetLower === 'chart' || targetLower === 'line chart' || targetLower === 'bar chart';
    const matchingWidgets = widgets.filter((w) => {
      if (w.type === targetLower) return true;
      if (isChartQuery && (w.type === 'line' || w.type === 'bar')) return true;
      return false;
    });

    if (matchingWidgets.length > 1) {
      throw new OperationError('NEEDS_CLARIFICATION', `Multiple ${target} widgets exist. Please specify which one.`, {
        httpStatus: 422,
        fieldErrors: { widget_id: 'ambiguous_target' },
      });
    }
    if (matchingWidgets.length === 1) return matchingWidgets[0].id;

    throw new OperationError('NEEDS_CLARIFICATION', `Widget ${target} is unknown or ambiguous. Please specify a valid widget.`, {
      httpStatus: 422,
      fieldErrors: { widget_id: 'ambiguous_target' },
    });
  }

  if (selectedWidgetId) {
    const found = widgets.find((w) => w.id === selectedWidgetId);
    if (found) return found.id;
  }

  if (widgets.length === 1) {
    return widgets[0].id;
  }

  if (widgets.length > 1) {
    throw new OperationError('NEEDS_CLARIFICATION', 'Which widget would you like to update? Multiple widgets are on the dashboard.', {
      httpStatus: 422,
      fieldErrors: { widget_id: 'ambiguous_target' },
    });
  }

  throw new OperationError('NOT_FOUND', 'No widgets exist on this dashboard', {
    httpStatus: 404,
    fieldErrors: { widget_id: 'no_widgets' },
  });
}

export class DashboardService {
  private readonly pool: DatabasePool;
  private readonly drafts = new Map<string, DashboardDraftView>();

  constructor(pool: DatabasePool) {
    this.pool = pool;
  }

  async getDashboard(businessId: string, dashboardId: string): Promise<DashboardView> {
    const poolQuery = (this.pool as DatabasePool & { query: DatabaseClient['query'] });
    let result;
    try {
      result = await poolQuery.query<DashboardRow>(
        `SELECT id, business_id, name, schema_version, version::text AS version,
                widgets, layout, created_at, updated_at
           FROM dashboards
          WHERE business_id = $1 AND id = $2`,
        [businessId, dashboardId],
      );
    } catch {
      throw dashboardStorageUnavailable();
    }

    if (result.rowCount && result.rows[0]) return dashboardView(result.rows[0]);
    throw new OperationError('NOT_FOUND', 'Dashboard is unavailable', { httpStatus: 404 });
  }

  async listDashboards(businessId: string): Promise<DashboardView[]> {
    const poolQuery = (this.pool as DatabasePool & { query: DatabaseClient['query'] });
    try {
      const result = await poolQuery.query<DashboardRow>(
        `SELECT id, business_id, name, schema_version, version::text AS version,
                widgets, layout, created_at, updated_at
           FROM dashboards
          WHERE business_id = $1
          ORDER BY updated_at DESC, name ASC`,
        [businessId],
      );

      return result.rows.map(dashboardView);
    } catch {
      throw dashboardStorageUnavailable();
    }
  }

  async saveDashboard(input: SaveDashboardInput): Promise<DashboardView> {
    const name = input.name ? input.name.trim() : '';
    if (!name) {
      throw new OperationError('VALIDATION_ERROR', 'Dashboard name is required', {
        httpStatus: 422,
        fieldErrors: { name: 'required' },
      });
    }

    const draftKey = `${input.business_id}:${input.id || 'default'}`;
    const draft = this.drafts.get(draftKey);
    const widgets = input.widgets ?? draft?.widgets ?? [];
    if (widgets.length > 20) {
      throw new OperationError('VALIDATION_ERROR', 'A dashboard cannot have more than 20 widgets', {
        httpStatus: 422,
        fieldErrors: { widgets: 'max 20 widgets' },
      });
    }

    const layout = input.layout ?? draft?.layout ?? [];
    const schemaVersion = input.schema_version ?? 1;
    const poolQuery = (this.pool as DatabasePool & { query: DatabaseClient['query'] });

    // Check if target dashboard exists by ID
    let existing: DashboardView | null = null;
    if (input.id) {
      try {
        existing = await this.getDashboard(input.business_id, input.id);
      } catch (err) {
        if (err instanceof OperationError && err.code === 'NOT_FOUND') {
          existing = null;
        } else {
          throw err;
        }
      }
    }

    // If updating existing dashboard
    if (existing) {
      if (input.expected_version !== undefined && input.expected_version !== null) {
        const expected = String(input.expected_version);
        if (existing.version !== expected) {
          throw new OperationError('CONFLICT', 'Expected version does not match current dashboard version', {
            httpStatus: 409,
            currentVersion: existing.version,
          });
        }
      }

      try {
        const res = await poolQuery.query<DashboardRow>(
          `UPDATE dashboards
              SET name = $3, widgets = $4::jsonb, layout = $5::jsonb,
                  schema_version = $6, version = version + 1, updated_at = now()
            WHERE business_id = $1 AND id = $2
              AND ($7::bigint IS NULL OR version = $7::bigint)
        RETURNING id, business_id, name, schema_version, version::text AS version,
                  widgets, layout, created_at, updated_at`,
          [input.business_id, existing.id, name, JSON.stringify(widgets), JSON.stringify(layout), schemaVersion,
            input.expected_version === undefined || input.expected_version === null
              ? null
              : String(input.expected_version)],
        );
        if (res.rowCount && res.rows[0]) {
          const updatedView = dashboardView(res.rows[0]);
          this.drafts.delete(draftKey);
          return updatedView;
        }
      } catch (err: unknown) {
        const pg = err as { code?: string; constraint?: string };
        if (pg.code === '23505' && pg.constraint === 'dashboards_business_id_name_key') {
          throw new OperationError('CONFLICT', 'A dashboard with this name already exists', { httpStatus: 409 });
        }
        throw dashboardStorageUnavailable();
      }

      let current: DashboardView;
      try {
        current = await this.getDashboard(input.business_id, existing.id);
      } catch (err) {
        if (err instanceof OperationError && err.code === 'NOT_FOUND') throw err;
        throw err;
      }
      if (input.expected_version === undefined || input.expected_version === null) {
        throw dashboardStorageUnavailable();
      }
      throw new OperationError('CONFLICT', 'Expected version does not match current dashboard version', {
        httpStatus: 409,
        currentVersion: current.version,
      });
    }

    // Creating new dashboard
    const newId = input.id ?? randomUUID();
    try {
      const res = await poolQuery.query<DashboardRow>(
        `INSERT INTO dashboards (
           id, business_id, name, schema_version, version, widgets, layout, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, 1, $5::jsonb, $6::jsonb, now(), now())
     RETURNING id, business_id, name, schema_version, version::text AS version,
               widgets, layout, created_at, updated_at`,
        [newId, input.business_id, name, schemaVersion, JSON.stringify(widgets), JSON.stringify(layout)],
      );
      if (res.rowCount && res.rows[0]) {
        const createdView = dashboardView(res.rows[0]);
        this.drafts.delete(draftKey);
        return createdView;
      }
    } catch (err: unknown) {
      const pg = err as { code?: string; constraint?: string };
      if (pg.code === '23505' && pg.constraint === 'dashboards_business_id_name_key') {
        throw new OperationError('CONFLICT', 'A dashboard with this name already exists', { httpStatus: 409 });
      }
      throw dashboardStorageUnavailable();
    }

    throw dashboardStorageUnavailable();
  }

  async getDashboardDraft(businessId: string, dashboardId?: string): Promise<DashboardDraftView | null> {
    const key = `${businessId}:${dashboardId || 'default'}`;
    return this.drafts.get(key) ?? null;
  }

  async clearDashboardDraft(businessId: string, dashboardId?: string): Promise<boolean> {
    const key = `${businessId}:${dashboardId || 'default'}`;
    return this.drafts.delete(key);
  }

  async updateDashboardDraft(input: UpdateDashboardDraftInput): Promise<DashboardDraftView> {
    if (!input.operations || input.operations.length === 0) {
      throw new OperationError('VALIDATION_ERROR', 'At least one operation is required', {
        httpStatus: 422,
        fieldErrors: { operations: 'required' },
      });
    }

    const dashboardId = input.dashboard_id || 'default';
    const draftKey = `${input.business_id}:${dashboardId}`;
    const existingDraft = this.drafts.get(draftKey);

    let baseDashboard: DashboardView | null = null;
    if (input.dashboard_id) {
      baseDashboard = await this.getDashboard(input.business_id, input.dashboard_id);
      if (input.expected_version !== undefined && input.expected_version !== null) {
        const expected = String(input.expected_version);
        if (baseDashboard.version !== expected) {
          throw new OperationError('CONFLICT', 'Expected version does not match current dashboard version', {
            httpStatus: 409,
            currentVersion: baseDashboard.version,
          });
        }
      }
    }

    let widgets: WidgetSpec[];
    let layout: LayoutItem[];
    let name: string;
    let version: string;
    let schemaVersion: number;
    let createdAt: string;
    let selectedWidgetId: string | null = input.selected_widget_id !== undefined
      ? input.selected_widget_id
      : (existingDraft?.selected_widget_id ?? null);

    if (existingDraft) {
      widgets = existingDraft.widgets.map((w) => ({ ...w, filters: w.filters ? { ...w.filters } : undefined }));
      layout = existingDraft.layout.map((l) => ({ ...l }));
      name = existingDraft.name;
      version = existingDraft.version;
      schemaVersion = existingDraft.schema_version;
      createdAt = existingDraft.created_at;
    } else if (baseDashboard) {
      widgets = baseDashboard.widgets.map((w) => ({ ...w, filters: w.filters ? { ...w.filters } : undefined }));
      layout = baseDashboard.layout.map((l) => ({ ...l }));
      name = baseDashboard.name;
      version = baseDashboard.version;
      schemaVersion = baseDashboard.schema_version;
      createdAt = baseDashboard.created_at;
    } else {
      widgets = createDefaultWidgetSpecs();
      layout = createDefaultLayoutItems();
      name = 'Draft Dashboard';
      version = '1';
      schemaVersion = 1;
      createdAt = new Date().toISOString();
    }

    for (const op of input.operations) {
      switch (op.type) {
        case 'add': {
          if (widgets.length >= 20) {
            throw new OperationError('VALIDATION_ERROR', 'A dashboard cannot have more than 20 widgets', {
              httpStatus: 422,
              fieldErrors: { widgets: 'max 20 widgets' },
            });
          }
          const wInput = op.widget ?? {};
          const id = (wInput.id && wInput.id.trim()) ? wInput.id.trim() : `widget-${randomUUID().slice(0, 8)}`;
          if (widgets.some((w) => w.id === id)) {
            throw new OperationError('CONFLICT', `Widget with ID ${id} already exists`, {
              httpStatus: 409,
              fieldErrors: { widget_id: 'duplicate_id' },
            });
          }
          const type = wInput.type || 'kpi';
          const metric = wInput.metric || 'revenue';
          const dimension = wInput.dimension || (type === 'line' ? 'date' : type === 'bar' ? 'product' : 'none');
          const title = (wInput.title && wInput.title.trim())
            ? wInput.title.trim()
            : (type === 'line' ? 'Daily revenue' : type === 'bar' ? 'Sales by product' : 'Total revenue');

          const newWidget: WidgetSpec = {
            id,
            type,
            title,
            metric,
            dimension,
            filters: wInput.filters,
            comparison: wInput.comparison ?? null,
            format: wInput.format ?? null,
            schema_version: wInput.schema_version ?? 1,
          };
          widgets.push(newWidget);

          const isChart = type === 'line' || type === 'bar';
          const bottomY = layout.reduce((maxY, item) => Math.max(maxY, item.y + item.h), 0);
          const layoutItem: LayoutItem = {
            i: id,
            x: op.layout?.x ?? op.x ?? 0,
            y: op.layout?.y ?? op.y ?? bottomY,
            w: op.layout?.w ?? op.w ?? (isChart ? 6 : 4),
            h: op.layout?.h ?? op.h ?? (isChart ? 10 : 5),
          };
          layout.push(layoutItem);
          selectedWidgetId = id;
          break;
        }

        case 'edit': {
          const targetId = resolveTargetWidgetId(op, widgets, selectedWidgetId);
          const idx = widgets.findIndex((w) => w.id === targetId);
          const existingWidget = widgets[idx];
          const changes = op.changes ?? op.widget ?? {};

          const updatedWidget: WidgetSpec = {
            ...existingWidget,
            ...(changes.title ? { title: changes.title.trim() } : {}),
            ...(changes.type ? { type: changes.type } : {}),
            ...(changes.metric ? { metric: changes.metric } : {}),
            ...(changes.dimension ? { dimension: changes.dimension } : {}),
            ...(changes.filters ? { filters: changes.filters } : {}),
          };
          widgets[idx] = updatedWidget;

          const wasChart = existingWidget.type === 'line' || existingWidget.type === 'bar';
          const nowChart = updatedWidget.type === 'line' || updatedWidget.type === 'bar';
          if (!wasChart && nowChart) {
            const lIdx = layout.findIndex((l) => l.i === targetId);
            if (lIdx >= 0) {
              layout[lIdx] = {
                ...layout[lIdx],
                w: Math.max(layout[lIdx].w, 5),
                h: Math.max(layout[lIdx].h, 10),
              };
            }
          }
          selectedWidgetId = targetId;
          break;
        }

        case 'move': {
          const targetId = resolveTargetWidgetId(op, widgets, selectedWidgetId);
          const lIdx = layout.findIndex((l) => l.i === targetId);
          if (lIdx === -1) {
            throw new OperationError('NOT_FOUND', `Layout item for widget ${targetId} not found`, { httpStatus: 404 });
          }

          let newX = op.x !== undefined ? op.x : layout[lIdx].x;
          let newY = op.y !== undefined ? op.y : layout[lIdx].y;

          if (op.position === 'top') {
            newY = 0;
          } else if (op.position === 'bottom') {
            const bottomY = layout.reduce((maxY, item) => Math.max(maxY, item.y + item.h), 0);
            newY = bottomY;
          } else if (op.position === 'left') {
            newX = 0;
          } else if (op.position === 'right') {
            newX = Math.max(0, 12 - layout[lIdx].w);
          }

          layout[lIdx] = {
            ...layout[lIdx],
            x: Math.max(0, newX),
            y: Math.max(0, newY),
          };
          selectedWidgetId = targetId;
          break;
        }

        case 'resize': {
          const targetId = resolveTargetWidgetId(op, widgets, selectedWidgetId);
          const lIdx = layout.findIndex((l) => l.i === targetId);
          if (lIdx === -1) {
            throw new OperationError('NOT_FOUND', `Layout item for widget ${targetId} not found`, { httpStatus: 404 });
          }
          const w = op.w ?? op.layout?.w;
          const h = op.h ?? op.layout?.h;
          if (w === undefined && h === undefined) {
            throw new OperationError('VALIDATION_ERROR', 'Resize requires w or h dimension', {
              httpStatus: 422,
              fieldErrors: { w: 'required_dimension' },
            });
          }
          layout[lIdx] = {
            ...layout[lIdx],
            ...(w !== undefined ? { w: Math.max(1, w) } : {}),
            ...(h !== undefined ? { h: Math.max(1, h) } : {}),
          };
          selectedWidgetId = targetId;
          break;
        }

        case 'remove': {
          const targetId = resolveTargetWidgetId(op, widgets, selectedWidgetId);
          widgets = widgets.filter((w) => w.id !== targetId);
          layout = layout.filter((l) => l.i !== targetId);
          if (selectedWidgetId === targetId) {
            selectedWidgetId = widgets[0]?.id ?? null;
          }
          break;
        }

        case 'select': {
          const targetId = resolveTargetWidgetId(op, widgets, selectedWidgetId);
          selectedWidgetId = targetId;
          break;
        }

        default:
          throw new OperationError('VALIDATION_ERROR', `Unsupported operation type: ${(op as { type: string }).type}`, {
            httpStatus: 422,
          });
      }
    }

    const updatedDraft: DashboardDraftView = {
      id: dashboardId,
      business_id: input.business_id,
      name,
      schema_version: schemaVersion,
      version,
      widgets,
      layout,
      is_draft: true,
      selected_widget_id: selectedWidgetId,
      created_at: createdAt,
      updated_at: new Date().toISOString(),
    };

    this.drafts.set(draftKey, updatedDraft);
    return updatedDraft;
  }

  async deleteDashboard(businessId: string, dashboardId: string): Promise<{ id: string; deleted: true }> {
    const poolQuery = (this.pool as DatabasePool & { query: DatabaseClient['query'] });
    let res;
    try {
      res = await poolQuery.query(
        'DELETE FROM dashboards WHERE business_id = $1 AND id = $2',
        [businessId, dashboardId],
      );
    } catch {
      throw dashboardStorageUnavailable();
    }

    if (!res.rowCount) throw new OperationError('NOT_FOUND', 'Dashboard is unavailable', { httpStatus: 404 });
    return { id: dashboardId, deleted: true };
  }
}

function dashboardStorageUnavailable(): OperationError {
  return new OperationError('INTERNAL_ERROR', 'Dashboard storage is unavailable', {
    httpStatus: 503,
    retryable: true,
  });
}
