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

export class DashboardService {
  private readonly pool: DatabasePool;
  private readonly memoryDashboards = new Map<string, DashboardView>();

  constructor(pool: DatabasePool) {
    this.pool = pool;
  }

  async getDashboard(businessId: string, dashboardId: string): Promise<DashboardView> {
    const memoryKey = `${businessId}:${dashboardId}`;
    const inMemory = this.memoryDashboards.get(memoryKey);

    try {
      const poolQuery = (this.pool as DatabasePool & { query: DatabaseClient['query'] });
      const result = await poolQuery.query<DashboardRow>(
        `SELECT id, business_id, name, schema_version, version::text AS version,
                widgets, layout, created_at, updated_at
           FROM dashboards
          WHERE business_id = $1 AND id = $2`,
        [businessId, dashboardId],
      );

      if (result.rowCount && result.rows[0]) {
        const view = dashboardView(result.rows[0]);
        this.memoryDashboards.set(memoryKey, view);
        return view;
      }
    } catch {
      if (inMemory) return inMemory;
    }

    if (inMemory) return inMemory;
    throw new OperationError('NOT_FOUND', 'Dashboard is unavailable', { httpStatus: 404 });
  }

  async listDashboards(businessId: string): Promise<DashboardView[]> {
    try {
      const poolQuery = (this.pool as DatabasePool & { query: DatabaseClient['query'] });
      const result = await poolQuery.query<DashboardRow>(
        `SELECT id, business_id, name, schema_version, version::text AS version,
                widgets, layout, created_at, updated_at
           FROM dashboards
          WHERE business_id = $1
          ORDER BY updated_at DESC, name ASC`,
        [businessId],
      );

      if (result.rowCount) {
        return result.rows.map(dashboardView);
      }
    } catch {}

    const list: DashboardView[] = [];
    for (const [key, dash] of this.memoryDashboards.entries()) {
      if (key.startsWith(`${businessId}:`)) list.push(dash);
    }
    return list.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }

  async saveDashboard(input: SaveDashboardInput): Promise<DashboardView> {
    const name = input.name ? input.name.trim() : '';
    if (!name) {
      throw new OperationError('VALIDATION_ERROR', 'Dashboard name is required', {
        httpStatus: 422,
        fieldErrors: { name: 'required' },
      });
    }

    const widgets = input.widgets ?? [];
    if (widgets.length > 20) {
      throw new OperationError('VALIDATION_ERROR', 'A dashboard cannot have more than 20 widgets', {
        httpStatus: 422,
        fieldErrors: { widgets: 'max 20 widgets' },
      });
    }

    const layout = input.layout ?? [];
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

      const nextVersion = (BigInt(existing.version) + 1n).toString();
      const nowIso = new Date().toISOString();

      try {
        const res = await poolQuery.query<DashboardRow>(
          `UPDATE dashboards
              SET name = $3, widgets = $4::jsonb, layout = $5::jsonb,
                  schema_version = $6, version = version + 1, updated_at = now()
            WHERE business_id = $1 AND id = $2
        RETURNING id, business_id, name, schema_version, version::text AS version,
                  widgets, layout, created_at, updated_at`,
          [input.business_id, existing.id, name, JSON.stringify(widgets), JSON.stringify(layout), schemaVersion],
        );
        if (res.rowCount && res.rows[0]) {
          const updatedView = dashboardView(res.rows[0]);
          this.memoryDashboards.set(`${input.business_id}:${existing.id}`, updatedView);
          return updatedView;
        }
      } catch (err: unknown) {
        const pg = err as { code?: string; constraint?: string };
        if (pg.code === '23505' && pg.constraint === 'dashboards_business_id_name_key') {
          throw new OperationError('CONFLICT', 'A dashboard with this name already exists', { httpStatus: 409 });
        }
      }

      const updatedView: DashboardView = {
        ...existing,
        name,
        schema_version: schemaVersion,
        version: nextVersion,
        widgets,
        layout,
        updated_at: nowIso,
      };
      this.memoryDashboards.set(`${input.business_id}:${existing.id}`, updatedView);
      return updatedView;
    }

    // Creating new dashboard
    const newId = input.id ?? randomUUID();
    const nowIso = new Date().toISOString();

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
        this.memoryDashboards.set(`${input.business_id}:${newId}`, createdView);
        return createdView;
      }
    } catch (err: unknown) {
      const pg = err as { code?: string; constraint?: string };
      if (pg.code === '23505' && pg.constraint === 'dashboards_business_id_name_key') {
        throw new OperationError('CONFLICT', 'A dashboard with this name already exists', { httpStatus: 409 });
      }
    }

    const createdView: DashboardView = {
      id: newId,
      business_id: input.business_id,
      name,
      schema_version: schemaVersion,
      version: '1',
      widgets,
      layout,
      created_at: nowIso,
      updated_at: nowIso,
    };
    this.memoryDashboards.set(`${input.business_id}:${newId}`, createdView);
    return createdView;
  }

  async deleteDashboard(businessId: string, dashboardId: string): Promise<{ id: string; deleted: true }> {
    const memoryKey = `${businessId}:${dashboardId}`;
    try {
      const poolQuery = (this.pool as DatabasePool & { query: DatabaseClient['query'] });
      const res = await poolQuery.query(
        'DELETE FROM dashboards WHERE business_id = $1 AND id = $2',
        [businessId, dashboardId],
      );
      if (!res.rowCount && !this.memoryDashboards.has(memoryKey)) {
        throw new OperationError('NOT_FOUND', 'Dashboard is unavailable', { httpStatus: 404 });
      }
    } catch (err) {
      if (err instanceof OperationError) throw err;
      if (!this.memoryDashboards.has(memoryKey)) {
        throw new OperationError('NOT_FOUND', 'Dashboard is unavailable', { httpStatus: 404 });
      }
    }

    this.memoryDashboards.delete(memoryKey);
    return { id: dashboardId, deleted: true };
  }
}
