import { randomUUID } from 'node:crypto';

import {
  MAX_UNIT_PRICE_MINOR,
  type Currency,
} from './money.ts';
import {
  canonicalPayload,
  hashPayload,
  OperationError,
  type DatabaseClient,
  type DatabasePool,
} from './mutations.ts';

export interface ProductMutationContext {
  business_id: string;
  actor_user_id: string;
  idempotency_key: string;
}

export interface CreateProductInput extends ProductMutationContext {
  name: string;
  default_unit_price?: bigint | number | string | null;
}

export interface UpdateProductInput extends ProductMutationContext {
  product_id: string;
  expected_version: bigint | number | string;
  changes: {
    name?: string;
    default_unit_price?: bigint | number | string | null;
    active?: boolean;
  };
}

interface ProductRow {
  id: string;
  business_id: string;
  name: string;
  active: boolean;
  default_unit_price: string | null;
  version: string;
  created_at: string | Date;
  updated_at: string | Date;
}

interface BusinessRow {
  id: string;
  currency: Currency;
  ledger_revision: string;
}

interface OperationRow {
  id: string;
  payload_hash: string;
  status: 'pending' | 'committed' | 'failed';
  result_receipt: ProductReceipt | null;
}

export interface ProductView {
  id: string;
  name: string;
  active: boolean;
  default_unit_price: string | null;
  version: string;
  created_at: string;
  updated_at: string;
}

export interface ProductReceipt {
  operation_id: string;
  operation_type: 'product_create' | 'product_update';
  status: 'committed';
  product: ProductView;
  currency: Currency;
  ledger_revision: string;
  warnings: string[];
  undo_available: false;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INTEGER_PATTERN = /^(0|[1-9]\d*)$/;

function validation(message: string, fieldErrors?: Record<string, string>): never {
  throw new OperationError('VALIDATION_ERROR', message, { httpStatus: 422, fieldErrors });
}

export class CatalogNotFoundError extends OperationError {
  constructor(message = 'Product is unavailable') {
    super('NOT_FOUND', message, { httpStatus: 404 });
  }
}

function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') validation(`${field} is required`, { [field]: 'required' });
  return value.trim();
}

function uuid(value: unknown, field: string): string {
  const valueText = text(value, field);
  if (!UUID_PATTERN.test(valueText)) validation(`${field} must be a UUID`, { [field]: 'invalid UUID' });
  return valueText;
}

function integer(value: unknown, field: string, minimum: bigint, maximum: bigint): bigint {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'bigint') {
    validation(`${field} must be a decimal integer`, { [field]: 'invalid integer' });
  }
  let parsed: bigint;
  if (typeof value === 'bigint') parsed = value;
  else if (typeof value === 'number' && Number.isSafeInteger(value)) parsed = BigInt(value);
  else if (typeof value === 'string' && INTEGER_PATTERN.test(value)) parsed = BigInt(value);
  else validation(`${field} must be a decimal integer`, { [field]: 'invalid integer' });
  if (parsed < minimum || parsed > maximum) {
    validation(`${field} must be between ${minimum} and ${maximum}`, { [field]: 'out of range' });
  }
  return parsed;
}

function productView(row: ProductRow): ProductView {
  return {
    id: row.id,
    name: row.name,
    active: row.active,
    default_unit_price: row.default_unit_price === null ? null : String(row.default_unit_price),
    version: String(row.version),
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

async function transaction<T>(pool: DatabasePool, work: (client: DatabaseClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* preserve the original error */ }
    throw normalizeDatabaseError(error);
  } finally {
    client.release();
  }
}

function normalizeDatabaseError(error: unknown): unknown {
  if (error instanceof OperationError) return error;
  const pg = error as { code?: string; constraint?: string };
  if (pg?.code === '23505') {
    if (pg.constraint === 'products_business_id_name_normalized_key') {
      return new OperationError('CONFLICT', 'A product with that name already exists');
    }
    return new OperationError('CONFLICT', 'The product conflicts with an existing record');
  }
  if (pg?.code === '23503' || pg?.code === '23514' || pg?.code === '22003') {
    return new OperationError('VALIDATION_ERROR', 'The product violates a catalog constraint', { httpStatus: 422 });
  }
  return error;
}

async function claimOperation(
  client: DatabaseClient,
  values: { businessId: string; actorUserId: string; idempotencyKey: string; payloadHash: string },
): Promise<{ operationId: string; receipt?: ProductReceipt }> {
  const operationId = randomUUID();
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO operations (
       id, business_id, idempotency_key, payload_hash, status, actor_user_id
     ) VALUES ($1, $2, $3, $4, 'pending', $5)
     ON CONFLICT (business_id, idempotency_key) DO NOTHING
     RETURNING id`,
    [operationId, values.businessId, values.idempotencyKey, values.payloadHash, values.actorUserId],
  );
  if (inserted.rowCount) return { operationId: inserted.rows[0].id };

  const existing = await client.query<OperationRow>(
    `SELECT id, payload_hash, status, result_receipt
       FROM operations
      WHERE business_id = $1 AND idempotency_key = $2
      FOR UPDATE`,
    [values.businessId, values.idempotencyKey],
  );
  const operation = existing.rows[0];
  if (!operation) throw new OperationError('OPERATION_IN_PROGRESS', 'Operation state is not yet available', { retryable: true });
  if (operation.payload_hash !== values.payloadHash) {
    throw new OperationError('IDEMPOTENCY_CONFLICT', 'Idempotency key was already used with a different payload');
  }
  if (operation.status === 'committed' && operation.result_receipt) {
    return { operationId: operation.id, receipt: operation.result_receipt };
  }
  throw new OperationError('OPERATION_IN_PROGRESS', 'The operation has not committed', { retryable: true });
}

async function lockBusiness(client: DatabaseClient, businessId: string): Promise<BusinessRow> {
  const result = await client.query<BusinessRow>(
    'SELECT id, currency, ledger_revision FROM businesses WHERE id = $1 FOR UPDATE',
    [businessId],
  );
  if (!result.rowCount) throw new CatalogNotFoundError('Business is unavailable');
  return result.rows[0];
}

async function incrementLedgerRevision(client: DatabaseClient, businessId: string): Promise<string> {
  const result = await client.query<{ ledger_revision: string }>(
    `UPDATE businesses
        SET ledger_revision = ledger_revision + 1
      WHERE id = $1
      RETURNING ledger_revision`,
    [businessId],
  );
  return String(result.rows[0].ledger_revision);
}

async function finishOperation(client: DatabaseClient, operationId: string, receipt: ProductReceipt): Promise<void> {
  const result = await client.query(
    `UPDATE operations
        SET status = 'committed', result_receipt = $2::jsonb, completed_at = now()
      WHERE id = $1 AND status = 'pending'`,
    [operationId, JSON.stringify(receipt)],
  );
  if (result.rowCount !== 1) throw new Error('operation completion invariant failed');
}

export class CatalogService {
  private readonly pool: DatabasePool;

  constructor(pool: DatabasePool) {
    this.pool = pool;
  }

  async getProduct(businessId: string, productId: string): Promise<ProductView> {
    const result = await (this.pool as DatabasePool & { query: DatabaseClient['query'] }).query<ProductRow>(
      `SELECT id, business_id, name, active, default_unit_price::text AS default_unit_price,
              version::text AS version, created_at, updated_at
         FROM products
        WHERE business_id = $1 AND id = $2`,
      [uuid(businessId, 'business_id'), uuid(productId, 'product_id')],
    );
    if (!result.rowCount) throw new CatalogNotFoundError();
    return productView(result.rows[0]);
  }

  async listProducts(businessId: string, options: { active?: boolean } = {}): Promise<ProductView[]> {
    const result = await (this.pool as DatabasePool & { query: DatabaseClient['query'] }).query<ProductRow>(
      `SELECT id, business_id, name, active, default_unit_price::text AS default_unit_price,
              version::text AS version, created_at, updated_at
         FROM products
        WHERE business_id = $1
          AND ($2::boolean IS NULL OR active = $2)
        ORDER BY name_normalized ASC, id ASC`,
      [uuid(businessId, 'business_id'), options.active ?? null],
    );
    return result.rows.map(productView);
  }

  async assertProductOwned(businessId: string, productId: string): Promise<ProductView> {
    return this.getProduct(businessId, productId);
  }

  async createProduct(input: CreateProductInput): Promise<ProductReceipt> {
    const businessId = uuid(input.business_id, 'business_id');
    const actorUserId = text(input.actor_user_id, 'actor_user_id');
    const idempotencyKey = text(input.idempotency_key, 'idempotency_key');
    const name = text(input.name, 'name');
    const defaultUnitPrice = input.default_unit_price === undefined || input.default_unit_price === null
      ? null
      : integer(input.default_unit_price, 'default_unit_price', 0n, MAX_UNIT_PRICE_MINOR);
    const payloadHash = hashPayload({
      operation_type: 'product_create', business_id: businessId, actor_user_id: actorUserId,
      name, default_unit_price: defaultUnitPrice,
    });

    return transaction(this.pool, async (client) => {
      const claim = await claimOperation(client, { businessId, actorUserId, idempotencyKey, payloadHash });
      if (claim.receipt) return claim.receipt;
      const business = await lockBusiness(client, businessId);
      const inserted = await client.query<ProductRow>(
        `INSERT INTO products (id, business_id, name, default_unit_price, version)
         VALUES ($1, $2, $3, $4, 1)
         RETURNING id, business_id, name, active, default_unit_price::text AS default_unit_price,
                   version::text AS version, created_at, updated_at`,
        [randomUUID(), businessId, name, defaultUnitPrice?.toString() ?? null],
      );
      const ledgerRevision = await incrementLedgerRevision(client, businessId);
      const receipt: ProductReceipt = {
        operation_id: claim.operationId,
        operation_type: 'product_create',
        status: 'committed',
        product: productView(inserted.rows[0]),
        currency: business.currency,
        ledger_revision: ledgerRevision,
        warnings: [],
        undo_available: false,
      };
      await finishOperation(client, claim.operationId, receipt);
      return receipt;
    });
  }

  async updateProduct(input: UpdateProductInput): Promise<ProductReceipt> {
    const businessId = uuid(input.business_id, 'business_id');
    const actorUserId = text(input.actor_user_id, 'actor_user_id');
    const idempotencyKey = text(input.idempotency_key, 'idempotency_key');
    const productId = uuid(input.product_id, 'product_id');
    const expectedVersion = integer(input.expected_version, 'expected_version', 1n, 9_223_372_036_854_775_807n);
    if (!input.changes || typeof input.changes !== 'object') validation('changes must be an object');
    const keys = Object.keys(input.changes);
    const allowed = new Set(['name', 'default_unit_price', 'active']);
    if (!keys.length) validation('a product patch must change at least one field');
    if (keys.some((key) => !allowed.has(key))) validation('product patch contains an unsupported field');
    const changes: { name?: string; default_unit_price?: string | null; active?: boolean } = {};
    if (Object.hasOwn(input.changes, 'name')) changes.name = text(input.changes.name, 'name');
    if (Object.hasOwn(input.changes, 'default_unit_price')) {
      changes.default_unit_price = input.changes.default_unit_price === null
        ? null
        : integer(input.changes.default_unit_price!, 'default_unit_price', 0n, MAX_UNIT_PRICE_MINOR).toString();
    }
    if (Object.hasOwn(input.changes, 'active')) {
      if (typeof input.changes.active !== 'boolean') validation('active must be a boolean', { active: 'invalid boolean' });
      changes.active = input.changes.active;
    }
    const payloadHash = hashPayload({
      operation_type: 'product_update', business_id: businessId, actor_user_id: actorUserId,
      product_id: productId, expected_version: expectedVersion, changes,
    });

    return transaction(this.pool, async (client) => {
      const claim = await claimOperation(client, { businessId, actorUserId, idempotencyKey, payloadHash });
      if (claim.receipt) return claim.receipt;
      const business = await lockBusiness(client, businessId);
      const selected = await client.query<ProductRow>(
        `SELECT id, business_id, name, active, default_unit_price::text AS default_unit_price,
                version::text AS version, created_at, updated_at
           FROM products
          WHERE business_id = $1 AND id = $2
          FOR UPDATE`,
        [businessId, productId],
      );
      if (!selected.rowCount) throw new CatalogNotFoundError();
      const current = selected.rows[0];
      if (BigInt(current.version) !== expectedVersion) {
        throw new OperationError('CONFLICT', 'Product version is stale', { currentVersion: String(current.version) });
      }
      const nextName = changes.name ?? current.name;
      const nextPrice = Object.hasOwn(changes, 'default_unit_price')
        ? changes.default_unit_price
        : current.default_unit_price;
      const nextActive = changes.active ?? current.active;
      if (nextName === current.name && nextPrice === current.default_unit_price && nextActive === current.active) {
        throw new OperationError('CONFLICT', 'Product patch does not change the product');
      }
      const updated = await client.query<ProductRow>(
        `UPDATE products
            SET name = $3, default_unit_price = $4, active = $5,
                version = version + 1, updated_at = now()
          WHERE business_id = $1 AND id = $2
          RETURNING id, business_id, name, active, default_unit_price::text AS default_unit_price,
                    version::text AS version, created_at, updated_at`,
        [businessId, productId, nextName, nextPrice, nextActive],
      );
      const ledgerRevision = await incrementLedgerRevision(client, businessId);
      const receipt: ProductReceipt = {
        operation_id: claim.operationId,
        operation_type: 'product_update',
        status: 'committed',
        product: productView(updated.rows[0]),
        currency: business.currency,
        ledger_revision: ledgerRevision,
        warnings: [],
        undo_available: false,
      };
      await finishOperation(client, claim.operationId, receipt);
      return receipt;
    });
  }
}

export interface CoverageMutationInput {
  business_id: string;
  actor_user_id: string;
  idempotency_key: string;
  local_date: string;
  state: 'open' | 'complete';
  expected_version: bigint | number | string;
}

export interface CoverageReceipt {
  operation_id: string;
  operation_type: 'day_coverage';
  status: 'committed';
  coverage: {
    local_date: string;
    state: 'open' | 'complete';
    version: string;
    has_sales: boolean;
    confirmed_zero: boolean;
  };
  currency: Currency;
  ledger_revision: string;
  warnings: string[];
  undo_available: false;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function date(value: unknown, field: string): string {
  const valueText = text(value, field);
  const parsed = new Date(`${valueText}T00:00:00Z`);
  if (!DATE_PATTERN.test(valueText) || Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== valueText) {
    validation(`${field} must be an ISO local date`, { [field]: 'invalid date' });
  }
  return valueText;
}

export class CoverageService {
  private readonly pool: DatabasePool;

  constructor(pool: DatabasePool) {
    this.pool = pool;
  }

  async setCoverage(input: CoverageMutationInput): Promise<CoverageReceipt> {
    const businessId = uuid(input.business_id, 'business_id');
    const actorUserId = text(input.actor_user_id, 'actor_user_id');
    const idempotencyKey = text(input.idempotency_key, 'idempotency_key');
    const localDate = date(input.local_date, 'local_date');
    if (input.state !== 'open' && input.state !== 'complete') validation('state must be open or complete', { state: 'invalid state' });
    const expectedVersion = integer(input.expected_version, 'expected_version', 0n, 9_223_372_036_854_775_807n);
    const payloadHash = hashPayload({
      operation_type: 'day_coverage', business_id: businessId, actor_user_id: actorUserId,
      local_date: localDate, state: input.state, expected_version: expectedVersion,
    });

    return transaction(this.pool, async (client) => {
      const claim = await claimOperation(client, { businessId, actorUserId, idempotencyKey, payloadHash });
      if (claim.receipt) return claim.receipt as unknown as CoverageReceipt;
      const business = await lockBusiness(client, businessId);
      const selected = await client.query<{ state: 'open' | 'complete'; version: string }>(
        `SELECT state, version::text AS version
           FROM day_coverages
          WHERE business_id = $1 AND local_date = $2
          FOR UPDATE`,
        [businessId, localDate],
      );
      const beforeState: 'open' | 'complete' = selected.rowCount ? selected.rows[0].state : 'open';
      const currentVersion = selected.rowCount ? BigInt(selected.rows[0].version) : 0n;
      if (currentVersion !== expectedVersion) {
        throw new OperationError('CONFLICT', 'Coverage version is stale', { currentVersion: currentVersion.toString() });
      }
      if (beforeState === input.state) throw new OperationError('CONFLICT', 'Coverage is already in that state');

      let version: string;
      if (!selected.rowCount) {
        const inserted = await client.query<{ version: string }>(
          `INSERT INTO day_coverages (business_id, local_date, state, version)
           VALUES ($1, $2, $3, 1)
           RETURNING version::text AS version`,
          [businessId, localDate, input.state],
        );
        version = inserted.rows[0].version;
      } else {
        const updated = await client.query<{ version: string }>(
          `UPDATE day_coverages
              SET state = $3, version = version + 1, updated_at = now()
            WHERE business_id = $1 AND local_date = $2
            RETURNING version::text AS version`,
          [businessId, localDate, input.state],
        );
        version = updated.rows[0].version;
      }
      const revisionId = randomUUID();
      await client.query(
        `INSERT INTO coverage_revisions (
           id, business_id, local_date, operation_id, before_state, after_state, actor_user_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [revisionId, businessId, localDate, claim.operationId, beforeState, input.state, actorUserId],
      );
      const sales = await client.query<{ has_sales: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM sales WHERE business_id = $1 AND sale_date = $2 AND NOT voided
         ) AS has_sales`,
        [businessId, localDate],
      );
      const hasSales = Boolean(sales.rows[0].has_sales);
      const ledgerRevision = await incrementLedgerRevision(client, businessId);
      const receipt: CoverageReceipt = {
        operation_id: claim.operationId,
        operation_type: 'day_coverage',
        status: 'committed',
        coverage: {
          local_date: localDate,
          state: input.state,
          version: String(version),
          has_sales: hasSales,
          confirmed_zero: input.state === 'complete' && !hasSales,
        },
        currency: business.currency,
        ledger_revision: ledgerRevision,
        warnings: [],
        undo_available: false,
      };
      await finishOperation(client, claim.operationId, receipt as unknown as ProductReceipt);
      return receipt;
    });
  }
}
