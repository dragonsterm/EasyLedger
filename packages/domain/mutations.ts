import { createHash, randomUUID } from 'node:crypto';

import {
  MAX_LINES,
  MAX_QUANTITY,
  MAX_UNIT_PRICE_MINOR,
  calculateRevenue,
  type Currency,
} from './money.ts';

export interface QueryResult<Row = Record<string, unknown>> {
  rows: Row[];
  rowCount: number | null;
}

export interface DatabaseClient {
  query<Row = Record<string, unknown>>(text: string, values?: unknown[]): Promise<QueryResult<Row>>;
  release(): void;
}

export interface DatabasePool {
  connect(): Promise<DatabaseClient>;
}

export interface SaleLineInput {
  product_id: string;
  quantity: bigint | number | string;
  unit_price: bigint | number | string | null;
  sale_date: string;
}

export interface CommitSalesInput {
  business_id: string;
  actor_user_id: string;
  idempotency_key: string;
  lines: SaleLineInput[];
}

export interface CorrectionChanges {
  product_id?: string;
  quantity?: bigint | number | string;
  unit_price?: bigint | number | string | null;
  sale_date?: string;
}

export interface CorrectSaleInput {
  business_id: string;
  actor_user_id: string;
  idempotency_key: string;
  sale_id: string;
  expected_version: bigint | number | string;
  changes: CorrectionChanges;
  reason: string;
}

export interface UndoOperationInput {
  business_id: string;
  actor_user_id: string;
  idempotency_key: string;
  operation_id: string;
  expected_versions: Array<{ sale_id: string; version: bigint | number | string }>;
  reason?: string;
}

interface BusinessRow {
  id: string;
  currency: Currency;
  ledger_revision: string;
}

interface ProductRow {
  id: string;
  active: boolean;
}

interface SaleRow {
  id: string;
  product_id: string;
  quantity: number;
  unit_price: string | null;
  sale_date: string | Date;
  version: string;
  voided: boolean;
}

interface OperationRow {
  id: string;
  payload_hash: string;
  status: 'pending' | 'committed' | 'failed';
  result_receipt: MutationReceipt | null;
  undo_of_operation_id: string | null;
}

interface RevisionRow {
  sale_id: string;
  before_values: SaleSnapshot | Record<string, never>;
  after_values: SaleSnapshot;
}

interface SaleSnapshot {
  sale_id: string;
  product_id: string;
  quantity: string;
  unit_price: string | null;
  sale_date: string;
  version: string;
  voided: boolean;
}

export interface ReceiptSale extends SaleSnapshot {
  line_revenue: string | null;
}

export interface MutationReceipt {
  operation_id: string;
  operation_type: 'sale_batch' | 'sale_correction' | 'sale_undo';
  status: 'committed';
  ledger_revision: string;
  currency: Currency;
  affected_sale_ids: string[];
  sales: ReceiptSale[];
  totals: {
    known_revenue: string;
    unknown_price_count: number;
    complete: boolean;
  };
  undo_available: boolean;
  undo_of_operation_id: string | null;
  warnings: string[];
}

export class OperationError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly httpStatus: number;
  readonly currentVersion?: string;
  readonly fieldErrors?: Record<string, string>;

  constructor(
    code: string,
    message: string,
    options: {
      retryable?: boolean;
      httpStatus?: number;
      currentVersion?: string;
      fieldErrors?: Record<string, string>;
    } = {},
  ) {
    super(message);
    this.name = 'OperationError';
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.httpStatus = options.httpStatus ?? (code === 'VALIDATION_ERROR' ? 422 : 409);
    this.currentVersion = options.currentVersion;
    this.fieldErrors = options.fieldErrors;
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function canonicalValue(value: unknown): unknown {
  if (value === undefined) return { $easyledger: 'undefined' };
  if (typeof value === 'bigint') return { $easyledger: 'bigint', value: value.toString() };
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, canonicalValue((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

export function canonicalPayload(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

export function hashPayload(value: unknown): string {
  return createHash('sha256').update(canonicalPayload(value)).digest('hex');
}

function validation(message: string, fieldErrors?: Record<string, string>): never {
  throw new OperationError('VALIDATION_ERROR', message, { httpStatus: 422, fieldErrors });
}

function conflict(message: string, currentVersion?: string): never {
  throw new OperationError('CONFLICT', message, { currentVersion });
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') validation(`${field} is required`, { [field]: 'required' });
  return value.trim();
}

function requireUuid(value: unknown, field: string): string {
  const text = requireText(value, field);
  if (!UUID_PATTERN.test(text)) validation(`${field} must be a UUID`, { [field]: 'invalid UUID' });
  return text;
}

function requireDate(value: unknown, field: string): string {
  const text = requireText(value, field);
  const parsed = new Date(`${text}T00:00:00Z`);
  if (!DATE_PATTERN.test(text) || Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== text) {
    validation(`${field} must be an ISO local date`, { [field]: 'invalid date' });
  }
  return text;
}

function integer(value: bigint | number | string, field: string, minimum: bigint, maximum: bigint): bigint {
  let parsed: bigint;
  if (typeof value === 'bigint') parsed = value;
  else if (typeof value === 'number' && Number.isSafeInteger(value)) parsed = BigInt(value);
  else if (typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value)) parsed = BigInt(value);
  else validation(`${field} must be a decimal integer`, { [field]: 'invalid integer' });
  if (parsed < minimum || parsed > maximum) {
    validation(`${field} must be between ${minimum} and ${maximum}`, { [field]: 'out of range' });
  }
  return parsed;
}

function normalizedLine(line: SaleLineInput, index: number) {
  if (!line || typeof line !== 'object') validation(`lines[${index}] must be an object`);
  if (!Object.hasOwn(line, 'unit_price')) {
    validation(`lines[${index}].unit_price must be explicit`, { [`lines[${index}].unit_price`]: 'missing; use null for unknown' });
  }
  const quantity = integer(line.quantity, `lines[${index}].quantity`, 1n, MAX_QUANTITY);
  const unitPrice = line.unit_price === null
    ? null
    : integer(line.unit_price, `lines[${index}].unit_price`, 0n, MAX_UNIT_PRICE_MINOR);
  return {
    product_id: requireUuid(line.product_id, `lines[${index}].product_id`),
    quantity,
    unit_price: unitPrice,
    sale_date: requireDate(line.sale_date, `lines[${index}].sale_date`),
  };
}

function snapshot(row: SaleRow): SaleSnapshot {
  return {
    sale_id: row.id,
    product_id: row.product_id,
    quantity: String(row.quantity),
    unit_price: row.unit_price === null ? null : String(row.unit_price),
    sale_date: row.sale_date instanceof Date ? row.sale_date.toISOString().slice(0, 10) : String(row.sale_date),
    version: String(row.version),
    voided: row.voided,
  };
}

function snapshotMatches(row: SaleRow, expected: SaleSnapshot): boolean {
  return canonicalPayload(snapshot(row)) === canonicalPayload(expected);
}

function receiptSale(value: SaleSnapshot, currency: Currency): ReceiptSale {
  const revenue = value.voided
    ? 0n
    : calculateRevenue(value.quantity, value.unit_price, currency);
  return { ...value, line_revenue: revenue === null ? null : revenue.toString() };
}

function createReceipt(
  operationId: string,
  operationType: MutationReceipt['operation_type'],
  ledgerRevision: string,
  currency: Currency,
  snapshots: SaleSnapshot[],
  undoOfOperationId: string | null,
): MutationReceipt {
  const sales = snapshots.map((sale) => receiptSale(sale, currency));
  let known = 0n;
  let unknown = 0;
  for (const sale of sales) {
    if (sale.voided) continue;
    if (sale.line_revenue === null) unknown += 1;
    else known += BigInt(sale.line_revenue);
  }
  return {
    operation_id: operationId,
    operation_type: operationType,
    status: 'committed',
    ledger_revision: ledgerRevision,
    currency,
    affected_sale_ids: sales.map((sale) => sale.sale_id),
    sales,
    totals: {
      known_revenue: known.toString(),
      unknown_price_count: unknown,
      complete: unknown === 0,
    },
    undo_available: true,
    undo_of_operation_id: undoOfOperationId,
    warnings: [],
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
  if (pg?.code === '23503') return new OperationError('CONFLICT', 'Referenced ledger data is unavailable');
  if (pg?.code === '23505' || pg?.code === '23514' || pg?.code === '22003') {
    return new OperationError('VALIDATION_ERROR', 'The mutation violates a ledger constraint', { httpStatus: 422 });
  }
  return error;
}

async function claimOperation(
  client: DatabaseClient,
  values: {
    businessId: string;
    actorUserId: string;
    idempotencyKey: string;
    payloadHash: string;
    undoOfOperationId?: string;
  },
): Promise<{ operationId: string; receipt?: MutationReceipt }> {
  const operationId = randomUUID();
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO operations (
       id, business_id, idempotency_key, payload_hash, status, actor_user_id, undo_of_operation_id
     ) VALUES ($1, $2, $3, $4, 'pending', $5, $6)
     ON CONFLICT (business_id, idempotency_key) DO NOTHING
     RETURNING id`,
    [operationId, values.businessId, values.idempotencyKey, values.payloadHash, values.actorUserId, values.undoOfOperationId ?? null],
  );
  if (inserted.rowCount) return { operationId: inserted.rows[0].id };

  const existing = await client.query<OperationRow>(
    `SELECT id, payload_hash, status, result_receipt, undo_of_operation_id
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
  if (!result.rowCount) conflict('Business is unavailable');
  return result.rows[0];
}

async function validateProducts(client: DatabaseClient, businessId: string, productIds: string[]): Promise<void> {
  const unique = [...new Set(productIds)].sort();
  const result = await client.query<ProductRow>(
    `SELECT id, active
       FROM products
      WHERE business_id = $1 AND id = ANY($2::uuid[])
      ORDER BY id
      FOR SHARE`,
    [businessId, unique],
  );
  const products = new Map(result.rows.map((row) => [row.id, row]));
  for (const productId of unique) {
    const product = products.get(productId);
    if (!product || !product.active) conflict('Product is unavailable for this business');
  }
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

async function reopenCompletedDates(
  client: DatabaseClient,
  businessId: string,
  operationId: string,
  actorUserId: string,
  dates: Iterable<string>,
): Promise<void> {
  for (const date of [...new Set(dates)].sort()) {
    const reopened = await client.query<{ version: string }>(
      `UPDATE day_coverages
          SET state = 'open', version = version + 1, updated_at = now()
        WHERE business_id = $1 AND local_date = $2 AND state = 'complete'
        RETURNING version`,
      [businessId, date],
    );
    if (!reopened.rowCount) continue;
    await client.query(
      `INSERT INTO coverage_revisions (
         id, business_id, local_date, operation_id, before_state, after_state, actor_user_id
       ) VALUES ($1, $2, $3, $4, 'complete', 'open', $5)`,
      [randomUUID(), businessId, date, operationId, actorUserId],
    );
  }
}

async function finishOperation(client: DatabaseClient, operationId: string, receipt: MutationReceipt): Promise<void> {
  const result = await client.query(
    `UPDATE operations
        SET status = 'committed', result_receipt = $2::jsonb, completed_at = now()
      WHERE id = $1 AND status = 'pending'`,
    [operationId, JSON.stringify(receipt)],
  );
  if (result.rowCount !== 1) throw new Error('operation completion invariant failed');
}

export class OperationService {
  private readonly pool: DatabasePool;

  constructor(pool: DatabasePool) {
    this.pool = pool;
  }

  async commitSales(input: CommitSalesInput): Promise<MutationReceipt> {
    const businessId = requireUuid(input.business_id, 'business_id');
    const actorUserId = requireText(input.actor_user_id, 'actor_user_id');
    const idempotencyKey = requireText(input.idempotency_key, 'idempotency_key');
    if (!Array.isArray(input.lines) || input.lines.length < 1 || input.lines.length > MAX_LINES) {
      validation(`lines must contain between 1 and ${MAX_LINES} entries`);
    }
    const lines = input.lines.map(normalizedLine);
    const payloadHash = hashPayload({ operation_type: 'sale_batch', business_id: businessId, actor_user_id: actorUserId, lines });

    return transaction(this.pool, async (client) => {
      const claim = await claimOperation(client, { businessId, actorUserId, idempotencyKey, payloadHash });
      if (claim.receipt) return claim.receipt;
      const business = await lockBusiness(client, businessId);
      await validateProducts(client, businessId, lines.map((line) => line.product_id));

      const created: SaleSnapshot[] = [];
      for (const line of lines) {
        const saleId = randomUUID();
        const inserted = await client.query<SaleRow>(
          `INSERT INTO sales (id, business_id, product_id, quantity, unit_price, sale_date)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, product_id, quantity, unit_price, sale_date::text AS sale_date, version, voided`,
          [saleId, businessId, line.product_id, line.quantity.toString(), line.unit_price?.toString() ?? null, line.sale_date],
        );
        const after = snapshot(inserted.rows[0]);
        created.push(after);
        await client.query(
          `INSERT INTO sale_revisions (
             id, business_id, sale_id, operation_id, before_values, after_values, actor_user_id, reason
           ) VALUES ($1, $2, $3, $4, '{}'::jsonb, $5::jsonb, $6, 'sale created')`,
          [randomUUID(), businessId, saleId, claim.operationId, JSON.stringify(after), actorUserId],
        );
      }

      await reopenCompletedDates(client, businessId, claim.operationId, actorUserId, created.map((sale) => sale.sale_date));
      const ledgerRevision = await incrementLedgerRevision(client, businessId);
      const receipt = createReceipt(claim.operationId, 'sale_batch', ledgerRevision, business.currency, created, null);
      await finishOperation(client, claim.operationId, receipt);
      return receipt;
    });
  }

  async correctSale(input: CorrectSaleInput): Promise<MutationReceipt> {
    const businessId = requireUuid(input.business_id, 'business_id');
    const actorUserId = requireText(input.actor_user_id, 'actor_user_id');
    const idempotencyKey = requireText(input.idempotency_key, 'idempotency_key');
    const saleId = requireUuid(input.sale_id, 'sale_id');
    const expectedVersion = integer(input.expected_version, 'expected_version', 1n, 9_223_372_036_854_775_807n);
    const reason = requireText(input.reason, 'reason');
    if (!input.changes || typeof input.changes !== 'object') validation('changes must be an object');
    const keys = Object.keys(input.changes);
    const allowed = new Set(['product_id', 'quantity', 'unit_price', 'sale_date']);
    if (!keys.length) validation('a correction must change at least one field');
    if (keys.some((key) => !allowed.has(key))) validation('correction contains an unsupported field');

    const changes: Record<string, unknown> = {};
    if (Object.hasOwn(input.changes, 'product_id')) changes.product_id = requireUuid(input.changes.product_id, 'changes.product_id');
    if (Object.hasOwn(input.changes, 'quantity')) changes.quantity = integer(input.changes.quantity!, 'changes.quantity', 1n, MAX_QUANTITY);
    if (Object.hasOwn(input.changes, 'unit_price')) {
      changes.unit_price = input.changes.unit_price === null
        ? null
        : integer(input.changes.unit_price!, 'changes.unit_price', 0n, MAX_UNIT_PRICE_MINOR);
    }
    if (Object.hasOwn(input.changes, 'sale_date')) changes.sale_date = requireDate(input.changes.sale_date, 'changes.sale_date');
    const payloadHash = hashPayload({
      operation_type: 'sale_correction', business_id: businessId, actor_user_id: actorUserId,
      sale_id: saleId, expected_version: expectedVersion, changes, reason,
    });

    return transaction(this.pool, async (client) => {
      const claim = await claimOperation(client, { businessId, actorUserId, idempotencyKey, payloadHash });
      if (claim.receipt) return claim.receipt;
      const business = await lockBusiness(client, businessId);
      const selected = await client.query<SaleRow>(
        `SELECT id, product_id, quantity, unit_price, sale_date::text AS sale_date, version, voided
           FROM sales
          WHERE business_id = $1 AND id = $2
          FOR UPDATE`,
        [businessId, saleId],
      );
      if (!selected.rowCount) conflict('Sale is unavailable');
      const current = selected.rows[0];
      if (current.voided) conflict('A voided sale cannot be corrected');
      if (BigInt(current.version) !== expectedVersion) conflict('Sale version is stale', String(current.version));
      if (changes.product_id) await validateProducts(client, businessId, [String(changes.product_id)]);

      const before = snapshot(current);
      const next = {
        product_id: String(changes.product_id ?? current.product_id),
        quantity: String(changes.quantity ?? current.quantity),
        unit_price: Object.hasOwn(changes, 'unit_price')
          ? (changes.unit_price === null ? null : String(changes.unit_price))
          : current.unit_price,
        sale_date: String(changes.sale_date ?? before.sale_date),
      };
      if (
        next.product_id === before.product_id
        && next.quantity === before.quantity
        && next.unit_price === before.unit_price
        && next.sale_date === before.sale_date
      ) validation('correction does not change the sale');

      const updated = await client.query<SaleRow>(
        `UPDATE sales
            SET product_id = $3, quantity = $4, unit_price = $5, sale_date = $6,
                version = version + 1, updated_at = now()
          WHERE business_id = $1 AND id = $2
          RETURNING id, product_id, quantity, unit_price, sale_date::text AS sale_date, version, voided`,
        [businessId, saleId, next.product_id, next.quantity, next.unit_price, next.sale_date],
      );
      const after = snapshot(updated.rows[0]);
      await client.query(
        `INSERT INTO sale_revisions (
           id, business_id, sale_id, operation_id, before_values, after_values, actor_user_id, reason
         ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8)`,
        [randomUUID(), businessId, saleId, claim.operationId, JSON.stringify(before), JSON.stringify(after), actorUserId, reason],
      );
      await reopenCompletedDates(client, businessId, claim.operationId, actorUserId, [before.sale_date, after.sale_date]);
      const ledgerRevision = await incrementLedgerRevision(client, businessId);
      const receipt = createReceipt(claim.operationId, 'sale_correction', ledgerRevision, business.currency, [after], null);
      await finishOperation(client, claim.operationId, receipt);
      return receipt;
    });
  }

  async undoOperation(input: UndoOperationInput): Promise<MutationReceipt> {
    const businessId = requireUuid(input.business_id, 'business_id');
    const actorUserId = requireText(input.actor_user_id, 'actor_user_id');
    const idempotencyKey = requireText(input.idempotency_key, 'idempotency_key');
    const targetOperationId = requireUuid(input.operation_id, 'operation_id');
    const reason = input.reason === undefined ? 'undo operation' : requireText(input.reason, 'reason');
    if (!Array.isArray(input.expected_versions) || !input.expected_versions.length) {
      validation('expected_versions must identify every affected sale');
    }
    const expectedVersions = input.expected_versions.map((item, index) => ({
      sale_id: requireUuid(item.sale_id, `expected_versions[${index}].sale_id`),
      version: integer(item.version, `expected_versions[${index}].version`, 1n, 9_223_372_036_854_775_807n),
    })).sort((a, b) => a.sale_id.localeCompare(b.sale_id));
    if (new Set(expectedVersions.map((item) => item.sale_id)).size !== expectedVersions.length) {
      validation('expected_versions contains duplicate sale IDs');
    }
    const payloadHash = hashPayload({
      operation_type: 'sale_undo', business_id: businessId, actor_user_id: actorUserId,
      operation_id: targetOperationId, expected_versions: expectedVersions, reason,
    });

    return transaction(this.pool, async (client) => {
      const claim = await claimOperation(client, {
        businessId, actorUserId, idempotencyKey, payloadHash, undoOfOperationId: targetOperationId,
      });
      if (claim.receipt) return claim.receipt;
      const business = await lockBusiness(client, businessId);
      const target = await client.query<OperationRow>(
        `SELECT id, payload_hash, status, result_receipt, undo_of_operation_id
           FROM operations
          WHERE business_id = $1 AND id = $2`,
        [businessId, targetOperationId],
      );
      if (!target.rowCount || target.rows[0].status !== 'committed') conflict('Target operation is unavailable');
      const priorUndo = await client.query<{ id: string }>(
        `SELECT id FROM operations
          WHERE business_id = $1 AND undo_of_operation_id = $2 AND status = 'committed'
          LIMIT 1`,
        [businessId, targetOperationId],
      );
      if (priorUndo.rowCount) conflict('Operation has already been undone');

      const revisions = await client.query<RevisionRow>(
        `SELECT sale_id, before_values, after_values
           FROM sale_revisions
          WHERE business_id = $1 AND operation_id = $2
          ORDER BY sale_id`,
        [businessId, targetOperationId],
      );
      if (!revisions.rowCount) conflict('Target operation has no sale changes');
      const revisionIds = revisions.rows.map((row) => row.sale_id);
      if (canonicalPayload(revisionIds) !== canonicalPayload(expectedVersions.map((item) => item.sale_id))) {
        conflict('expected_versions must cover exactly the target sales');
      }
      const locked = await client.query<SaleRow>(
        `SELECT id, product_id, quantity, unit_price, sale_date::text AS sale_date, version, voided
           FROM sales
          WHERE business_id = $1 AND id = ANY($2::uuid[])
          ORDER BY id
          FOR UPDATE`,
        [businessId, revisionIds],
      );
      if (locked.rows.length !== revisionIds.length) conflict('A target sale is unavailable');
      const currentById = new Map(locked.rows.map((row) => [row.id, row]));
      const expectedById = new Map(expectedVersions.map((item) => [item.sale_id, item.version]));
      for (const revision of revisions.rows) {
        const current = currentById.get(revision.sale_id)!;
        if (BigInt(current.version) !== expectedById.get(revision.sale_id)) {
          conflict('A target sale version is stale', String(current.version));
        }
        if (!snapshotMatches(current, revision.after_values)) conflict('An intervening edit prevents undo');
      }

      const compensated: SaleSnapshot[] = [];
      const affectedDates = new Set<string>();
      for (const revision of revisions.rows) {
        const current = currentById.get(revision.sale_id)!;
        const beforeUndo = snapshot(current);
        affectedDates.add(beforeUndo.sale_date);
        const wasCreated = Object.keys(revision.before_values).length === 0;
        const targetValues = wasCreated ? { ...beforeUndo, voided: true } : revision.before_values as SaleSnapshot;
        affectedDates.add(targetValues.sale_date);
        const updated = await client.query<SaleRow>(
          `UPDATE sales
              SET product_id = $3, quantity = $4, unit_price = $5, sale_date = $6,
                  voided = $7, version = version + 1, updated_at = now()
            WHERE business_id = $1 AND id = $2
            RETURNING id, product_id, quantity, unit_price, sale_date::text AS sale_date, version, voided`,
          [businessId, current.id, targetValues.product_id, targetValues.quantity, targetValues.unit_price,
            targetValues.sale_date, targetValues.voided],
        );
        const afterUndo = snapshot(updated.rows[0]);
        compensated.push(afterUndo);
        await client.query(
          `INSERT INTO sale_revisions (
             id, business_id, sale_id, operation_id, before_values, after_values, actor_user_id, reason
           ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8)`,
          [randomUUID(), businessId, current.id, claim.operationId, JSON.stringify(beforeUndo),
            JSON.stringify(afterUndo), actorUserId, reason],
        );
      }

      await reopenCompletedDates(client, businessId, claim.operationId, actorUserId, affectedDates);
      const ledgerRevision = await incrementLedgerRevision(client, businessId);
      const receipt = createReceipt(
        claim.operationId, 'sale_undo', ledgerRevision, business.currency, compensated, targetOperationId,
      );
      await finishOperation(client, claim.operationId, receipt);
      return receipt;
    });
  }
}
