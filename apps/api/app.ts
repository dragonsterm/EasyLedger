import Fastify from 'fastify';

import {
  CatalogNotFoundError,
  CatalogService,
  CoverageService,
} from '../../packages/domain/catalog.ts';
import {
  OperationError,
  OperationService,
  type DatabasePool,
} from '../../packages/domain/mutations.ts';
import {
  ProposalService,
  SalesQueryService,
  VoiceSessionService,
  fetchAssemblyAiToken,
  type VoiceSessionRecord,
} from '../../packages/domain/voice.ts';

/**
 * The API intentionally receives authentication as an adapter.  Production
 * code can bind this to its verified session or token middleware, while tests
 * can provide a deterministic identity.  The adapter is the only component
 * allowed to turn an HTTP request into a user identity.
 */
export interface AuthenticatedUser {
  userId?: string;
  user_id?: string;
}

type AuthenticationResult = AuthenticatedUser | string | null | undefined;

export type AuthenticationAdapter = {
  authenticate(request: unknown): Promise<AuthenticationResult> | AuthenticationResult;
} | ((request: unknown) => Promise<AuthenticationResult> | AuthenticationResult);

export interface AppOptions {
  pool: DatabasePool & { query?: unknown; end?: () => Promise<void> };
  authAdapter?: AuthenticationAdapter;
  authenticate?: AuthenticationAdapter;
  auth?: AuthenticationAdapter;
  logger?: boolean;
  assemblyApiKey?: string;
  assemblyTokenGenerator?: (options?: { expiresInSeconds?: number }) => Promise<string> | string;
}

class ApiError extends Error {
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
    this.name = 'ApiError';
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.httpStatus = options.httpStatus ?? 500;
    this.currentVersion = options.currentVersion;
    this.fieldErrors = options.fieldErrors;
  }
}

const UUID_PATTERN = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$';
const DATE_PATTERN = '^\\d{4}-\\d{2}-\\d{2}$';
const INTEGER_PATTERN = '^(0|[1-9][0-9]*)$';
const uuidSchema = { type: 'string', pattern: UUID_PATTERN };
const dateSchema = { type: 'string', pattern: DATE_PATTERN };
const integerSchema = { type: 'string', pattern: INTEGER_PATTERN };
const moneySchema = { type: ['string', 'null'], pattern: INTEGER_PATTERN };

const idempotencyHeaders = {
  type: 'object',
  required: ['idempotency-key'],
  properties: {
    'idempotency-key': { type: 'string', minLength: 1, maxLength: 200 },
  },
  // Other HTTP headers are accepted because Node/Fastify supplies host,
  // content-type and connection headers alongside the stable key.
  additionalProperties: true,
};

const saleLineSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['product_id', 'quantity', 'unit_price', 'sale_date'],
  properties: {
    product_id: uuidSchema,
    quantity: integerSchema,
    unit_price: moneySchema,
    sale_date: dateSchema,
  },
};

const saleCreateSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['lines'],
  properties: {
    lines: { type: 'array', minItems: 1, maxItems: 100, items: saleLineSchema },
  },
};

const saleCorrectionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['expected_version', 'changes', 'reason'],
  properties: {
    expected_version: { type: 'string', pattern: INTEGER_PATTERN },
    changes: {
      type: 'object',
      minProperties: 1,
      additionalProperties: false,
      properties: {
        product_id: uuidSchema,
        quantity: integerSchema,
        unit_price: moneySchema,
        sale_date: dateSchema,
      },
    },
    reason: { type: 'string', minLength: 1, maxLength: 500 },
  },
};

const productCreateSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name'],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 200 },
    default_unit_price: moneySchema,
  },
};

const productPatchSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['expected_version'],
  properties: {
    expected_version: { type: 'string', pattern: INTEGER_PATTERN },
    // The nested form mirrors sale corrections; the flat form keeps the
    // manual catalog PATCH ergonomic.  The handler merges them and rejects
    // duplicate field names.
    changes: {
      type: 'object',
      minProperties: 1,
      additionalProperties: false,
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 200 },
        default_unit_price: moneySchema,
        active: { type: 'boolean' },
      },
    },
    name: { type: 'string', minLength: 1, maxLength: 200 },
    default_unit_price: moneySchema,
    active: { type: 'boolean' },
  },
};

const coverageSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['state', 'expected_version'],
  properties: {
    state: { type: 'string', enum: ['open', 'complete'] },
    expected_version: { type: 'string', pattern: INTEGER_PATTERN },
  },
};

const salesQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    cursor: { type: 'string', minLength: 1, maxLength: 500 },
    limit: { type: 'string', pattern: '^[1-9][0-9]*$' },
    page_size: { type: 'string', pattern: '^[1-9][0-9]*$' },
    date_from: dateSchema,
    date_to: dateSchema,
    start_date: dateSchema,
    end_date: dateSchema,
    product_id: uuidSchema,
    include_voided: { type: 'string', enum: ['true', 'false'] },
  },
};

const productsQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    active: { type: 'string', enum: ['true', 'false'] },
  },
};

const uuidParams = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: { id: uuidSchema },
};

const dateParams = {
  type: 'object',
  additionalProperties: false,
  required: ['date'],
  properties: { date: dateSchema },
};

const voiceSessionCreateSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    selected_dashboard_id: uuidSchema,
    ttl_seconds: { type: 'integer', minimum: 60, maximum: 3600 },
  },
};

const toolGetContextSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    dashboard_id: uuidSchema,
  },
};

const toolSaleLineSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['product_id', 'quantity', 'sale_date'],
  properties: {
    product_id: uuidSchema,
    quantity: integerSchema,
    unit_price: moneySchema,
    sale_date: dateSchema,
  },
};

const toolProposeSalesSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['lines'],
  properties: {
    lines: { type: 'array', minItems: 1, maxItems: 100, items: toolSaleLineSchema },
    intent: { type: 'string', enum: ['additional', 'total', 'unknown'] },
  },
};

const toolCommitSalesSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['proposal_id', 'confirmation_token', 'idempotency_key'],
  properties: {
    proposal_id: uuidSchema,
    confirmation_token: { type: 'string', minLength: 1, maxLength: 200 },
    idempotency_key: { type: 'string', minLength: 1, maxLength: 200 },
  },
};

const toolCancelProposalSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['proposal_id'],
  properties: {
    proposal_id: uuidSchema,
    reason: { type: 'string', minLength: 1, maxLength: 500 },
  },
};

const toolProposeCorrectionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['sale_id', 'expected_version', 'changes', 'reason'],
  properties: {
    sale_id: uuidSchema,
    expected_version: integerSchema,
    changes: {
      type: 'object',
      minProperties: 1,
      additionalProperties: false,
      properties: {
        product_id: uuidSchema,
        quantity: integerSchema,
        unit_price: moneySchema,
        sale_date: dateSchema,
      },
    },
    reason: { type: 'string', minLength: 1, maxLength: 500 },
  },
};

const toolCommitCorrectionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['proposal_id', 'confirmation_token', 'idempotency_key'],
  properties: {
    proposal_id: uuidSchema,
    confirmation_token: { type: 'string', minLength: 1, maxLength: 200 },
    idempotency_key: { type: 'string', minLength: 1, maxLength: 200 },
  },
};

const toolQuerySalesSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['metric'],
  properties: {
    metric: { type: 'string', enum: ['units', 'revenue'] },
    dimension: { type: 'string', enum: ['date', 'product', 'none'] },
    date_from: dateSchema,
    date_to: dateSchema,
    start_date: dateSchema,
    end_date: dateSchema,
    product_ids: { type: 'array', items: uuidSchema, maxItems: 50 },
    comparison: { type: 'string', minLength: 1, maxLength: 100 },
  },
};

function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ApiError('VALIDATION_ERROR', `${field} is required`, { httpStatus: 422, fieldErrors: { [field]: 'required' } });
  }
  return value.trim();
}

function stringInteger(value: unknown, field: string, minimum: bigint, maximum: bigint): bigint {
  const valueText = text(value, field);
  if (!/^(0|[1-9]\d*)$/.test(valueText)) {
    throw new ApiError('VALIDATION_ERROR', `${field} must be a decimal integer`, { httpStatus: 422, fieldErrors: { [field]: 'invalid integer' } });
  }
  const parsed = BigInt(valueText);
  if (parsed < minimum || parsed > maximum) {
    throw new ApiError('VALIDATION_ERROR', `${field} is out of range`, { httpStatus: 422, fieldErrors: { [field]: 'out of range' } });
  }
  return parsed;
}

function validDate(value: unknown, field: string): string {
  const valueText = text(value, field);
  const parsed = new Date(`${valueText}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valueText) || Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== valueText) {
    throw new ApiError('VALIDATION_ERROR', `${field} must be an ISO local date`, { httpStatus: 422, fieldErrors: { [field]: 'invalid date' } });
  }
  return valueText;
}

function addDays(dateText: string, days: number): string {
  const value = new Date(`${dateText}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function dateRange(start: string | undefined, end: string | undefined): { start?: string; end?: string } {
  if (!start && !end) return {};
  const normalizedStart = start ? validDate(start, 'date_from') : end!;
  const normalizedEnd = end ? validDate(end, 'date_to') : start!;
  if (normalizedStart > normalizedEnd) {
    throw new ApiError('VALIDATION_ERROR', 'date_from must be on or before date_to', { httpStatus: 422 });
  }
  const endExclusive = addDays(normalizedEnd, 1);
  const rangeStart = new Date(`${normalizedStart}T00:00:00Z`).valueOf();
  const rangeEnd = new Date(`${endExclusive}T00:00:00Z`).valueOf();
  if ((rangeEnd - rangeStart) / 86_400_000 > 366) {
    throw new ApiError('VALIDATION_ERROR', 'date range cannot exceed 366 days', { httpStatus: 422 });
  }
  return { start: normalizedStart, end: normalizedEnd };
}

function decodeCursor(value: unknown): { sale_date: string; id: string } | undefined {
  if (value === undefined) return undefined;
  const cursor = text(value, 'cursor');
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { sale_date?: unknown; id?: unknown };
    const saleDate = validDate(decoded.sale_date, 'cursor.sale_date');
    const id = text(decoded.id, 'cursor.id');
    if (!new RegExp(UUID_PATTERN).test(id)) throw new Error('invalid cursor id');
    return { sale_date: saleDate, id };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('VALIDATION_ERROR', 'cursor is invalid', { httpStatus: 422, fieldErrors: { cursor: 'invalid cursor' } });
  }
}

function encodeCursor(value: { sale_date: string; id: string }): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function toError(error: unknown): ApiError | OperationError {
  if (error instanceof ApiError || error instanceof OperationError) return error;
  return new ApiError('INTERNAL_ERROR', 'The request could not be completed', { httpStatus: 500, retryable: true });
}

function errorEnvelope(requestId: string, error: ApiError | OperationError) {
  return {
    request_id: requestId,
    code: error instanceof OperationError ? error.code : error.code,
    message: error.message,
    retryable: error.retryable,
    ...(error.fieldErrors ? { field_errors: error.fieldErrors } : {}),
    ...(error.currentVersion ? { current_version: error.currentVersion } : {}),
  };
}

function successEnvelope(requestId: string, data: unknown, extra: Record<string, unknown> = {}) {
  return {
    request_id: requestId,
    status: extra.operation_id ? 'committed' : 'ok',
    data,
    warnings: [],
    ...extra,
  };
}

async function poolQuery<Row = Record<string, unknown>>(
  pool: DatabasePool & { query?: unknown },
  textQuery: string,
  values: unknown[],
) {
  if (typeof pool.query !== 'function') throw new Error('API pool must expose query() for read operations');
  return (pool.query as (text: string, values: unknown[]) => Promise<{ rows: Row[]; rowCount: number | null }>)(textQuery, values);
}

async function resolveBusiness(
  pool: DatabasePool & { query?: unknown },
  userId: string,
): Promise<{ id: string; currency: 'IDR' | 'USD'; ledger_revision: string; name: string; timezone: string }> {
  const result = await poolQuery<{ id: string; currency: 'IDR' | 'USD'; ledger_revision: string; name?: string; timezone?: string }>(
    pool,
    `SELECT id, currency, ledger_revision::text AS ledger_revision, name, timezone
       FROM businesses
      WHERE owner_user_id = $1
      ORDER BY created_at ASC, id ASC
      LIMIT 1`,
    [userId],
  );
  if (!result.rowCount || !result.rows[0]) throw new ApiError('FORBIDDEN', 'Authenticated user has no business', { httpStatus: 403 });
  const row = result.rows[0];
  return {
    id: row.id,
    currency: row.currency,
    ledger_revision: row.ledger_revision,
    name: row.name ?? 'EasyLedger Merchant',
    timezone: row.timezone ?? 'Asia/Jakarta',
  };
}

async function getBusinessById(
  pool: DatabasePool & { query?: unknown },
  businessId: string,
): Promise<{ id: string; currency: 'IDR' | 'USD'; ledger_revision: string; name: string; timezone: string }> {
  const result = await poolQuery<{ id: string; currency: 'IDR' | 'USD'; ledger_revision: string; name?: string; timezone?: string }>(
    pool,
    `SELECT id, currency, ledger_revision::text AS ledger_revision, name, timezone
       FROM businesses
      WHERE id = $1
      LIMIT 1`,
    [businessId],
  );
  if (!result.rowCount || !result.rows[0]) throw new ApiError('FORBIDDEN', 'Business not found for session', { httpStatus: 403 });
  const row = result.rows[0];
  return {
    id: row.id,
    currency: row.currency,
    ledger_revision: row.ledger_revision,
    name: row.name ?? 'EasyLedger Merchant',
    timezone: row.timezone ?? 'Asia/Jakarta',
  };
}

async function ensureSaleOwned(pool: DatabasePool & { query?: unknown }, businessId: string, saleId: string): Promise<void> {
  const result = await poolQuery(pool, 'SELECT 1 FROM sales WHERE business_id = $1 AND id = $2', [businessId, saleId]);
  if (!result.rowCount) throw new ApiError('NOT_FOUND', 'Sale is unavailable', { httpStatus: 404 });
}

async function ensureProductOwned(pool: DatabasePool & { query?: unknown }, businessId: string, productId: string): Promise<void> {
  const result = await poolQuery(pool, 'SELECT 1 FROM products WHERE business_id = $1 AND id = $2', [businessId, productId]);
  if (!result.rowCount) throw new ApiError('NOT_FOUND', 'Product is unavailable', { httpStatus: 404 });
}

async function listSales(
  pool: DatabasePool & { query?: unknown },
  business: { id: string; currency: 'IDR' | 'USD'; ledger_revision: string },
  query: Record<string, unknown>,
) {
  const rawFrom = (query.date_from ?? query.start_date) as string | undefined;
  const rawTo = (query.date_to ?? query.end_date) as string | undefined;
  const dates = dateRange(rawFrom, rawTo);
  const productId = query.product_id as string | undefined;
  if (productId) await ensureProductOwned(pool, business.id, productId);
  const cursor = decodeCursor(query.cursor);
  const pageValue = query.page_size ?? query.limit ?? '50';
  const pageSize = Number(stringInteger(pageValue, 'page_size', 1n, 100n));
  const includeVoided = query.include_voided === undefined || query.include_voided === 'true';
  const values: unknown[] = [business.id];
  const where = ['s.business_id = $1'];
  if (dates.start) { values.push(dates.start); where.push(`s.sale_date >= $${values.length}`); }
  if (dates.end) { values.push(dates.end); where.push(`s.sale_date <= $${values.length}`); }
  if (productId) { values.push(productId); where.push(`s.product_id = $${values.length}`); }
  if (!includeVoided) where.push('NOT s.voided');
  if (cursor) {
    values.push(cursor.sale_date, cursor.id);
    where.push(`(s.sale_date < $${values.length - 1}::date OR (s.sale_date = $${values.length - 1}::date AND s.id < $${values.length}::uuid))`);
  }
  values.push(pageSize + 1);
  const result = await poolQuery<{
    sale_id: string;
    product_id: string;
    product_name: string;
    quantity: string;
    unit_price: string | null;
    sale_date: string;
    version: string;
    voided: boolean;
  }>(
    pool,
    `SELECT s.id AS sale_id, s.product_id, p.name AS product_name,
            s.quantity::text AS quantity, s.unit_price::text AS unit_price,
            s.sale_date::text AS sale_date, s.version::text AS version, s.voided
       FROM sales s
       JOIN products p ON p.id = s.product_id AND p.business_id = s.business_id
      WHERE ${where.join(' AND ')}
      ORDER BY s.sale_date DESC, s.id DESC
      LIMIT $${values.length}`,
    values,
  );
  const hasMore = result.rows.length > pageSize;
  const rows = hasMore ? result.rows.slice(0, pageSize) : result.rows;
  const sales = rows.map((row) => {
    const lineRevenue = row.unit_price === null ? null : (BigInt(row.quantity) * BigInt(row.unit_price)).toString();
    return {
      id: row.sale_id,
      sale_id: row.sale_id,
      product_id: row.product_id,
      product_name: row.product_name,
      quantity: row.quantity,
      unit_price: row.unit_price,
      sale_date: row.sale_date,
      version: row.version,
      voided: row.voided,
      line_revenue: row.voided ? '0' : lineRevenue,
      currency: business.currency,
      ledger_revision: business.ledger_revision,
    };
  });
  const nextCursor = hasMore ? encodeCursor({ sale_date: rows[rows.length - 1].sale_date, id: rows[rows.length - 1].sale_id }) : null;
  return {
    items: sales,
    sales,
    next_cursor: nextCursor,
    has_more: hasMore,
    currency: business.currency,
    ledger_revision: business.ledger_revision,
    filters: { date_from: dates.start ?? null, date_to: dates.end ?? null, product_id: productId ?? null, include_voided: includeVoided },
  };
}

export function createApp(options: AppOptions) {
  if (!options?.pool) throw new TypeError('createApp requires a PostgreSQL pool');
  const adapter = options.authAdapter ?? options.authenticate ?? options.auth;
  const app = Fastify({
    logger: options.logger ?? false,
    requestIdHeader: 'x-request-id',
    // Extra JSON properties are rejected at the boundary.  Silently
    // removing a business_id or actor_user_id would turn an unsafe request
    // into a different request and would hide client contract errors.
    ajv: { customOptions: { removeAdditional: false, allErrors: true } },
  });
  const operations = new OperationService(options.pool);
  const catalog = new CatalogService(options.pool);
  const coverage = new CoverageService(options.pool);
  const voiceSessions = new VoiceSessionService(options.pool);
  const proposals = new ProposalService(options.pool);
  const salesQueries = new SalesQueryService(options.pool);

  app.addHook('onRequest', async (request) => {
    const rawUrl = request.raw.url ?? request.url;
    const isVoiceTool = rawUrl.startsWith('/api/v1/voice/tools') || rawUrl.startsWith('/api/voice/tools');

    if (isVoiceTool) {
      let token: string | undefined;
      const authHeader = request.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.slice(7).trim();
      } else if (typeof request.headers['x-session-token'] === 'string') {
        token = request.headers['x-session-token'].trim();
      } else if (typeof request.headers['x-assemblyai-session-token'] === 'string') {
        token = request.headers['x-assemblyai-session-token'].trim();
      } else {
        const query = request.query as Record<string, unknown> | undefined;
        if (typeof query?.token === 'string') token = query.token.trim();
        else if (typeof query?.session_token === 'string') token = query.session_token.trim();
      }

      if (!token) {
        throw new ApiError('UNAUTHORIZED', 'Voice session token is required', { httpStatus: 401 });
      }

      const session = await voiceSessions.validateSessionToken(token);
      if (!session) {
        throw new ApiError('UNAUTHORIZED', 'Voice session token is invalid or expired', { httpStatus: 401 });
      }

      const business = await getBusinessById(options.pool, session.business_id);
      (request as unknown as { easyLedger?: unknown }).easyLedger = {
        userId: session.actor_user_id,
        business,
        voiceSession: session,
      };
      return;
    }

    if (!adapter) throw new ApiError('UNAUTHORIZED', 'Authentication is required', { httpStatus: 401 });
    const identity = typeof adapter === 'function' ? await adapter(request) : await adapter.authenticate(request);
    const userId = typeof identity === 'string'
      ? identity
      : identity?.userId ?? identity?.user_id;
    if (typeof userId !== 'string' || userId.trim() === '') {
      throw new ApiError('UNAUTHORIZED', 'Authentication is required', { httpStatus: 401 });
    }
    const business = await resolveBusiness(options.pool, userId.trim());
    (request as unknown as { easyLedger?: { userId: string; business: typeof business } }).easyLedger = {
      userId: userId.trim(),
      business,
    };
  });

  app.addHook('preValidation', async (request) => {
    const rawUrl = request.raw.url ?? request.url;
    const isVoiceTool = rawUrl.startsWith('/api/v1/voice/tools') || rawUrl.startsWith('/api/voice/tools');
    if (isVoiceTool && request.body && typeof request.body === 'object') {
      const b = request.body as Record<string, unknown>;
      if ('business_id' in b || 'actor_user_id' in b) {
        throw new ApiError('VALIDATION_ERROR', 'client-supplied or model-supplied business_id is prohibited', { httpStatus: 422 });
      }
    }
  });

  app.setErrorHandler((error, request, reply) => {
    const requestId = String(request.id);
    const validationErrors = (error as { validation?: Array<{ instancePath?: string; keyword?: string; params?: Record<string, unknown>; message?: string }> }).validation;
    if (validationErrors) {
      const fieldErrors: Record<string, string> = {};
      for (const item of validationErrors) {
        const path = item.instancePath?.replace(/^\//, '').replaceAll('/', '.')
          || (item.params?.missingProperty ? String(item.params.missingProperty) : 'request');
        fieldErrors[path] = item.message ?? 'invalid value';
      }
      const validationError = new ApiError('VALIDATION_ERROR', 'Request validation failed', {
        httpStatus: 422,
        fieldErrors,
      });
      return reply.code(422).send(errorEnvelope(requestId, validationError));
    }
    const fastifyError = error as { code?: string; statusCode?: number };
    if (fastifyError.code === 'FST_ERR_CTP_INVALID_JSON_BODY' || fastifyError.statusCode === 400) {
      const badRequest = new ApiError('BAD_REQUEST', 'Request body is malformed', { httpStatus: 400 });
      return reply.code(400).send(errorEnvelope(requestId, badRequest));
    }
    const normalized = toError(error);
    const status = normalized instanceof OperationError ? normalized.httpStatus : normalized.httpStatus;
    if (status >= 500) {
      return reply.code(500).send(errorEnvelope(requestId, new ApiError('INTERNAL_ERROR', 'The request could not be completed', { httpStatus: 500, retryable: true })));
    }
    return reply.code(status).send(errorEnvelope(requestId, normalized));
  });

  app.get('/api/v1/sales', { schema: { querystring: salesQuerySchema } }, async (request, reply) => {
    const context = (request as unknown as { easyLedger: { business: { id: string; currency: 'IDR' | 'USD'; ledger_revision: string } } }).easyLedger;
    const data = await listSales(options.pool, context.business, request.query as Record<string, unknown>);
    return reply.code(200).send(successEnvelope(String(request.id), data, {
      currency: data.currency,
      ledger_revision: data.ledger_revision,
    }));
  });

  app.post('/api/v1/sales', { schema: { headers: idempotencyHeaders, body: saleCreateSchema } }, async (request, reply) => {
    const context = (request as unknown as { easyLedger: { userId: string; business: { id: string; currency: 'IDR' | 'USD'; ledger_revision: string } } }).easyLedger;
    const body = request.body as { lines: Array<{ product_id: string; quantity: string; unit_price: string | null; sale_date: string }> };
    for (const line of body.lines) await ensureProductOwned(options.pool, context.business.id, line.product_id);
    const receipt = await operations.commitSales({
      business_id: context.business.id,
      actor_user_id: context.userId,
      idempotency_key: text((request.headers as Record<string, unknown>)['idempotency-key'], 'Idempotency-Key'),
      lines: body.lines,
    });
    return reply.code(201).send(successEnvelope(String(request.id), receipt, {
      operation_id: receipt.operation_id,
      currency: receipt.currency,
      ledger_revision: receipt.ledger_revision,
      undo_available: receipt.undo_available,
    }));
  });

  app.put('/api/v1/sales/:id', { schema: { headers: idempotencyHeaders, params: uuidParams, body: saleCorrectionSchema } }, async (request, reply) => {
    const context = (request as unknown as { easyLedger: { userId: string; business: { id: string; currency: 'IDR' | 'USD'; ledger_revision: string } } }).easyLedger;
    const params = request.params as { id: string };
    await ensureSaleOwned(options.pool, context.business.id, params.id);
    const body = request.body as { expected_version: string; changes: Record<string, unknown>; reason: string };
    if (body.changes.product_id !== undefined) await ensureProductOwned(options.pool, context.business.id, String(body.changes.product_id));
    const receipt = await operations.correctSale({
      business_id: context.business.id,
      actor_user_id: context.userId,
      idempotency_key: text((request.headers as Record<string, unknown>)['idempotency-key'], 'Idempotency-Key'),
      sale_id: params.id,
      expected_version: body.expected_version,
      changes: body.changes,
      reason: body.reason,
    });
    return reply.code(200).send(successEnvelope(String(request.id), receipt, {
      operation_id: receipt.operation_id,
      currency: receipt.currency,
      ledger_revision: receipt.ledger_revision,
      undo_available: receipt.undo_available,
    }));
  });

  app.get('/api/v1/products', { schema: { querystring: productsQuerySchema } }, async (request, reply) => {
    const context = (request as unknown as { easyLedger: { business: { id: string; currency: 'IDR' | 'USD'; ledger_revision: string } } }).easyLedger;
    const query = request.query as { active?: string };
    const products = await catalog.listProducts(context.business.id, { active: query.active === undefined ? undefined : query.active === 'true' });
    return reply.code(200).send(successEnvelope(String(request.id), { products, items: products }, {
      currency: context.business.currency,
      ledger_revision: context.business.ledger_revision,
    }));
  });

  app.get('/api/v1/products/:id', { schema: { params: uuidParams } }, async (request, reply) => {
    const context = (request as unknown as { easyLedger: { business: { id: string; currency: 'IDR' | 'USD'; ledger_revision: string } } }).easyLedger;
    const product = await catalog.getProduct(context.business.id, (request.params as { id: string }).id);
    return reply.code(200).send(successEnvelope(String(request.id), product, {
      currency: context.business.currency,
      ledger_revision: context.business.ledger_revision,
    }));
  });

  app.post('/api/v1/products', { schema: { headers: idempotencyHeaders, body: productCreateSchema } }, async (request, reply) => {
    const context = (request as unknown as { easyLedger: { userId: string; business: { id: string } } } ).easyLedger;
    const body = request.body as { name: string; default_unit_price?: string | null };
    const receipt = await catalog.createProduct({
      business_id: context.business.id,
      actor_user_id: context.userId,
      idempotency_key: text((request.headers as Record<string, unknown>)['idempotency-key'], 'Idempotency-Key'),
      name: body.name,
      default_unit_price: body.default_unit_price,
    });
    return reply.code(201).send(successEnvelope(String(request.id), receipt.product, {
      operation_id: receipt.operation_id,
      currency: receipt.currency,
      ledger_revision: receipt.ledger_revision,
      undo_available: receipt.undo_available,
    }));
  });

  app.patch('/api/v1/products/:id', { schema: { headers: idempotencyHeaders, params: uuidParams, body: productPatchSchema } }, async (request, reply) => {
    const context = (request as unknown as { easyLedger: { userId: string; business: { id: string } } } ).easyLedger;
    const body = request.body as {
      expected_version: string;
      changes?: { name?: string; default_unit_price?: string | null; active?: boolean };
      name?: string;
      default_unit_price?: string | null;
      active?: boolean;
    };
    const changes: Record<string, unknown> = {};
    for (const key of ['name', 'default_unit_price', 'active'] as const) {
      if (Object.hasOwn(body, key)) changes[key] = body[key];
    }
    for (const key of ['name', 'default_unit_price', 'active'] as const) {
      if (body.changes && Object.hasOwn(body.changes, key)) {
        if (Object.hasOwn(changes, key)) {
          throw new ApiError('VALIDATION_ERROR', `product field ${key} was supplied twice`, { httpStatus: 422 });
        }
        changes[key] = body.changes[key];
      }
    }
    const receipt = await catalog.updateProduct({
      business_id: context.business.id,
      actor_user_id: context.userId,
      idempotency_key: text((request.headers as Record<string, unknown>)['idempotency-key'], 'Idempotency-Key'),
      product_id: (request.params as { id: string }).id,
      expected_version: body.expected_version,
      changes,
    });
    return reply.code(200).send(successEnvelope(String(request.id), receipt.product, {
      operation_id: receipt.operation_id,
      currency: receipt.currency,
      ledger_revision: receipt.ledger_revision,
      undo_available: receipt.undo_available,
    }));
  });

  app.post('/api/v1/days/:date/coverage', { schema: { headers: idempotencyHeaders, params: dateParams, body: coverageSchema } }, async (request, reply) => {
    const context = (request as unknown as { easyLedger: { userId: string; business: { id: string } } } ).easyLedger;
    const body = request.body as { state: 'open' | 'complete'; expected_version: string };
    const receipt = await coverage.setCoverage({
      business_id: context.business.id,
      actor_user_id: context.userId,
      idempotency_key: text((request.headers as Record<string, unknown>)['idempotency-key'], 'Idempotency-Key'),
      local_date: (request.params as { date: string }).date,
      state: body.state,
      expected_version: body.expected_version,
    });
    return reply.code(200).send(successEnvelope(String(request.id), receipt.coverage, {
      operation_id: receipt.operation_id,
      currency: receipt.currency,
      ledger_revision: receipt.ledger_revision,
      undo_available: receipt.undo_available,
    }));
  });

  // --- Day 23: Voice Agent Session Bootstrap & HTTP Tool Gateway ---

  const registerVoiceSessionRoute = (routePath: string) => {
    app.post(routePath, { schema: { body: voiceSessionCreateSchema } }, async (request, reply) => {
      const context = (request as unknown as { easyLedger: { userId: string; business: { id: string; currency: 'IDR' | 'USD'; ledger_revision: string } } }).easyLedger;
      const body = (request.body ?? {}) as { selected_dashboard_id?: string; ttl_seconds?: number };

      const ttl = body.ttl_seconds ?? 600;
      let providerToken: string;

      if (options.assemblyTokenGenerator) {
        providerToken = await options.assemblyTokenGenerator({ expiresInSeconds: ttl });
      } else {
        const apiKey = options.assemblyApiKey ?? process.env.ASSEMBLYAI_API_KEY;
        if (apiKey) {
          const res = await fetchAssemblyAiToken(apiKey, ttl);
          providerToken = res.token;
        } else {
          providerToken = `mock_aai_${randomUUID().replaceAll('-', '')}`;
        }
      }

      const session = await voiceSessions.createSession({
        business_id: context.business.id,
        actor_user_id: context.userId,
        selected_dashboard_id: body.selected_dashboard_id,
        ttl_seconds: ttl,
      });

      return reply.code(201).send(successEnvelope(String(request.id), {
        session_id: session.session_id,
        session_token: session.session_token,
        provider_token: providerToken,
        expires_at: session.expires_at,
        expires_in_seconds: session.expires_in_seconds,
        websocket_url: 'wss://streaming.assemblyai.com/v3/ws',
      }));
    });
  };

  registerVoiceSessionRoute('/api/v1/voice/sessions');
  registerVoiceSessionRoute('/api/voice/sessions');

  const handleGetContext = async (request: unknown, reply: unknown) => {
    const req = request as { id: string; body?: { dashboard_id?: string }; easyLedger: { business: { id: string; currency: 'IDR' | 'USD'; ledger_revision: string; name: string; timezone: string }; voiceSession?: VoiceSessionRecord } };
    const rep = reply as { code: (status: number) => { send: (payload: unknown) => unknown } };
    const context = req.easyLedger;
    const body = req.body ?? {};
    const products = await catalog.listProducts(context.business.id, { active: true });
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());

    const data = {
      business_id: context.business.id,
      business_name: context.business.name,
      currency: context.business.currency,
      timezone: context.business.timezone,
      ledger_revision: context.business.ledger_revision,
      today,
      catalog: products.map((p) => ({
        id: p.id,
        name: p.name,
        default_unit_price: p.default_unit_price,
      })),
      dashboard_id: context.voiceSession?.selected_dashboard_id ?? body.dashboard_id ?? null,
    };

    return rep.code(200).send(successEnvelope(String(req.id), data, {
      currency: context.business.currency,
      ledger_revision: context.business.ledger_revision,
    }));
  };

  const handleProposeSales = async (request: unknown, reply: unknown) => {
    const req = request as { id: string; body: { lines: Array<{ product_id: string; quantity: string; unit_price?: string | null; sale_date: string }>; intent?: 'additional' | 'total' }; easyLedger: { business: { id: string; currency: 'IDR' | 'USD'; ledger_revision: string }; voiceSession?: VoiceSessionRecord } };
    const rep = reply as { code: (status: number) => { send: (payload: unknown) => unknown } };
    const context = req.easyLedger;
    const body = req.body;

    const evaluatedLines: Array<{ product_id: string; product_name: string; quantity: string; unit_price: string | null; sale_date: string; line_revenue: string | null }> = [];
    let totalQuantity = 0n;
    let knownRevenue = 0n;
    let unknownPriceCount = 0;

    if (body.intent === 'unknown') {
      throw new ApiError('NEEDS_CLARIFICATION', 'Is this your total sales for today, or additional sales?', {
        httpStatus: 422,
        fieldErrors: { intent: 'ambiguous_intent' },
      });
    }

    for (const line of body.lines) {
      let product;
      try {
        product = await catalog.getProduct(context.business.id, line.product_id);
      } catch (err) {
        if (err instanceof CatalogNotFoundError) {
          throw new ApiError('NEEDS_CLARIFICATION', `Product ${line.product_id} is unknown in your catalog. Please select a valid product.`, {
            httpStatus: 422,
            fieldErrors: { product_id: 'unknown_product' },
          });
        }
        throw err;
      }
      if (!product.active) {
        throw new ApiError('VALIDATION_ERROR', `Product ${product.name} is deactivated and cannot receive new sales`, { httpStatus: 422 });
      }
      const q = stringInteger(line.quantity, 'quantity', 1n, 1_000_000n);
      totalQuantity += q;

      let priceMinor: bigint | null = null;
      let unitPriceStr: string | null = null;

      if (line.unit_price !== undefined && line.unit_price !== null) {
        priceMinor = stringInteger(line.unit_price, 'unit_price', 0n, 1_000_000_000n);
        unitPriceStr = priceMinor.toString();
      } else if (product.default_unit_price !== null) {
        priceMinor = BigInt(product.default_unit_price);
        unitPriceStr = product.default_unit_price;
      } else {
        unknownPriceCount++;
      }

      let lineRevenueStr: string | null = null;
      if (priceMinor !== null) {
        const lineRev = q * priceMinor;
        knownRevenue += lineRev;
        lineRevenueStr = lineRev.toString();
      }

      evaluatedLines.push({
        product_id: line.product_id,
        product_name: product.name,
        quantity: q.toString(),
        unit_price: unitPriceStr,
        sale_date: validDate(line.sale_date, 'sale_date'),
        line_revenue: lineRevenueStr,
      });
    }

    const warnings: string[] = [];
    if (unknownPriceCount > 0) {
      warnings.push(`${unknownPriceCount} item(s) have unknown prices; revenue total is incomplete`);
    }

    const proposal = await proposals.createProposal({
      business_id: context.business.id,
      session_id: context.voiceSession?.id,
      type: 'sale_batch',
      payload: {
        lines: evaluatedLines.map((l) => ({
          product_id: l.product_id,
          quantity: l.quantity,
          unit_price: l.unit_price,
          sale_date: l.sale_date,
        })),
        intent: body.intent ?? 'additional',
      },
      base_ledger_revision: context.business.ledger_revision,
    });

    const data = {
      proposal_id: proposal.proposal_id,
      confirmation_token: proposal.confirmation_token,
      status: 'awaiting_confirmation',
      intent: body.intent ?? 'additional',
      lines: evaluatedLines,
      total_quantity: totalQuantity.toString(),
      known_total_revenue: knownRevenue.toString(),
      currency: context.business.currency,
      has_unknown_prices: unknownPriceCount > 0,
      expires_at: proposal.expires_at,
      base_ledger_revision: context.business.ledger_revision,
      warnings,
    };

    return rep.code(200).send(successEnvelope(String(req.id), data, {
      currency: context.business.currency,
      ledger_revision: context.business.ledger_revision,
      warnings,
    }));
  };

  const handleCommitSales = async (request: unknown, reply: unknown) => {
    const req = request as { id: string; body: { proposal_id: string; confirmation_token: string; idempotency_key: string }; easyLedger: { userId: string; business: { id: string; currency: 'IDR' | 'USD'; ledger_revision: string } } };
    const rep = reply as { code: (status: number) => { send: (payload: unknown) => unknown } };
    const context = req.easyLedger;
    const body = req.body;

    const proposal = await proposals.verifyAndConsumeConfirmation({
      business_id: context.business.id,
      proposal_id: body.proposal_id,
      confirmation_token: body.confirmation_token,
    });

    if (proposal.normalized_payload.type !== 'sale_batch') {
      throw new ApiError('VALIDATION_ERROR', 'Proposal is not a sales batch proposal', { httpStatus: 422 });
    }

    const lines = proposal.normalized_payload.lines as Array<{ product_id: string; quantity: string; unit_price: string | null; sale_date: string }>;
    const receipt = await operations.commitSales({
      business_id: context.business.id,
      actor_user_id: context.userId,
      idempotency_key: text(body.idempotency_key, 'idempotency_key'),
      lines,
    });

    return rep.code(201).send(successEnvelope(String(req.id), receipt, {
      operation_id: receipt.operation_id,
      currency: receipt.currency,
      ledger_revision: receipt.ledger_revision,
      undo_available: receipt.undo_available,
    }));
  };

  const handleProposeCorrection = async (request: unknown, reply: unknown) => {
    const req = request as { id: string; body: { sale_id: string; expected_version: string; changes: Record<string, unknown>; reason: string }; easyLedger: { business: { id: string; currency: 'IDR' | 'USD'; ledger_revision: string }; voiceSession?: VoiceSessionRecord } };
    const rep = reply as { code: (status: number) => { send: (payload: unknown) => unknown } };
    const context = req.easyLedger;
    const body = req.body;

    const saleRes = await poolQuery<{
      id: string;
      product_id: string;
      product_name: string;
      quantity: string;
      unit_price: string | null;
      sale_date: string;
      version: string;
      voided: boolean;
    }>(
      options.pool,
      `SELECT s.id, s.product_id, p.name AS product_name, s.quantity::text AS quantity,
              s.unit_price::text AS unit_price, s.sale_date::text AS sale_date,
              s.version::text AS version, s.voided
         FROM sales s
         JOIN products p ON p.id = s.product_id AND p.business_id = s.business_id
        WHERE s.business_id = $1 AND s.id = $2`,
      [context.business.id, body.sale_id],
    );

    if (!saleRes.rowCount || !saleRes.rows[0]) {
      throw new ApiError('NEEDS_CLARIFICATION', 'Target sale is unknown or ambiguous. Please select a specific sale from your history.', {
        httpStatus: 422,
        fieldErrors: { sale_id: 'ambiguous_target' },
      });
    }
    const currentSale = saleRes.rows[0];
    if (currentSale.version !== body.expected_version) {
      throw new ApiError('CONFLICT', 'Expected version does not match current sale version', {
        httpStatus: 409,
        currentVersion: currentSale.version,
      });
    }

    if (body.changes.product_id !== undefined) {
      await ensureProductOwned(options.pool, context.business.id, String(body.changes.product_id));
    }

    const beforeValues = {
      product_id: currentSale.product_id,
      product_name: currentSale.product_name,
      quantity: currentSale.quantity,
      unit_price: currentSale.unit_price,
      sale_date: currentSale.sale_date,
      version: currentSale.version,
    };

    const afterValues = {
      product_id: body.changes.product_id ? String(body.changes.product_id) : currentSale.product_id,
      quantity: body.changes.quantity ? String(body.changes.quantity) : currentSale.quantity,
      unit_price: body.changes.unit_price !== undefined ? (body.changes.unit_price as string | null) : currentSale.unit_price,
      sale_date: body.changes.sale_date ? String(body.changes.sale_date) : currentSale.sale_date,
    };

    const proposal = await proposals.createProposal({
      business_id: context.business.id,
      session_id: context.voiceSession?.id,
      type: 'correction',
      payload: {
        sale_id: body.sale_id,
        expected_version: body.expected_version,
        changes: body.changes,
        reason: body.reason,
      },
      base_ledger_revision: context.business.ledger_revision,
    });

    const data = {
      proposal_id: proposal.proposal_id,
      confirmation_token: proposal.confirmation_token,
      status: 'awaiting_confirmation',
      sale_id: body.sale_id,
      expected_version: body.expected_version,
      before_values: beforeValues,
      after_values: afterValues,
      reason: body.reason,
      expires_at: proposal.expires_at,
      base_ledger_revision: context.business.ledger_revision,
    };

    return rep.code(200).send(successEnvelope(String(req.id), data, {
      currency: context.business.currency,
      ledger_revision: context.business.ledger_revision,
    }));
  };

  const handleCommitCorrection = async (request: unknown, reply: unknown) => {
    const req = request as { id: string; body: { proposal_id: string; confirmation_token: string; idempotency_key: string }; easyLedger: { userId: string; business: { id: string; currency: 'IDR' | 'USD'; ledger_revision: string } } };
    const rep = reply as { code: (status: number) => { send: (payload: unknown) => unknown } };
    const context = req.easyLedger;
    const body = req.body;

    const proposal = await proposals.verifyAndConsumeConfirmation({
      business_id: context.business.id,
      proposal_id: body.proposal_id,
      confirmation_token: body.confirmation_token,
    });

    if (proposal.normalized_payload.type !== 'correction') {
      throw new ApiError('VALIDATION_ERROR', 'Proposal is not a sale correction proposal', { httpStatus: 422 });
    }

    const payload = proposal.normalized_payload as {
      sale_id: string;
      expected_version: string;
      changes: Record<string, unknown>;
      reason: string;
    };

    const receipt = await operations.correctSale({
      business_id: context.business.id,
      actor_user_id: context.userId,
      idempotency_key: text(body.idempotency_key, 'idempotency_key'),
      sale_id: payload.sale_id,
      expected_version: payload.expected_version,
      changes: payload.changes,
      reason: payload.reason,
    });

    return rep.code(200).send(successEnvelope(String(req.id), receipt, {
      operation_id: receipt.operation_id,
      currency: receipt.currency,
      ledger_revision: receipt.ledger_revision,
      undo_available: receipt.undo_available,
    }));
  };

  const handleCancelProposal = async (request: unknown, reply: unknown) => {
    const req = request as { id: string; body: { proposal_id: string; reason?: string }; easyLedger: { business: { id: string; currency: 'IDR' | 'USD'; ledger_revision: string } } };
    const rep = reply as { code: (status: number) => { send: (payload: unknown) => unknown } };
    const context = req.easyLedger;
    const body = req.body;

    const result = await proposals.cancelProposal({
      business_id: context.business.id,
      proposal_id: body.proposal_id,
      reason: body.reason,
    });

    return rep.code(200).send(successEnvelope(String(req.id), result, {
      currency: context.business.currency,
      ledger_revision: context.business.ledger_revision,
    }));
  };

  const handleQuerySales = async (request: unknown, reply: unknown) => {
    const req = request as { id: string; body: { metric: 'units' | 'revenue'; dimension?: 'date' | 'product' | 'none'; date_from?: string; date_to?: string; start_date?: string; end_date?: string; product_ids?: string[] }; easyLedger: { business: { id: string; currency: 'IDR' | 'USD'; ledger_revision: string } } };
    const rep = reply as { code: (status: number) => { send: (payload: unknown) => unknown } };
    const context = req.easyLedger;
    const body = req.body;

    const rawFrom = body.date_from ?? body.start_date;
    const rawTo = body.date_to ?? body.end_date;
    const dates = dateRange(rawFrom, rawTo);

    const result = await salesQueries.querySales({
      business_id: context.business.id,
      currency: context.business.currency,
      ledger_revision: context.business.ledger_revision,
      metric: body.metric,
      dimension: body.dimension,
      date_from: dates.start,
      date_to: dates.end,
      product_ids: body.product_ids,
    });

    return rep.code(200).send(successEnvelope(String(req.id), result, {
      currency: result.currency,
      ledger_revision: result.ledger_revision,
    }));
  };

  for (const prefix of ['/api/v1/voice/tools', '/api/voice/tools']) {
    app.post(`${prefix}/get_context`, { schema: { body: toolGetContextSchema } }, handleGetContext);
    app.get(`${prefix}/get_context`, handleGetContext);
    app.post(`${prefix}/propose_sales`, { schema: { body: toolProposeSalesSchema } }, handleProposeSales);
    app.post(`${prefix}/commit_sales`, { schema: { body: toolCommitSalesSchema } }, handleCommitSales);
    app.post(`${prefix}/propose_correction`, { schema: { body: toolProposeCorrectionSchema } }, handleProposeCorrection);
    app.post(`${prefix}/commit_correction`, { schema: { body: toolCommitCorrectionSchema } }, handleCommitCorrection);
    app.post(`${prefix}/query_sales`, { schema: { body: toolQuerySalesSchema } }, handleQuerySales);
    app.post(`${prefix}/cancel_proposal`, { schema: { body: toolCancelProposalSchema } }, handleCancelProposal);

    app.post(`${prefix}/:tool`, async (request, reply) => {
      const toolName = (request.params as { tool: string }).tool;
      switch (toolName) {
        case 'get_context':
          return handleGetContext(request, reply);
        case 'propose_sales':
          return handleProposeSales(request, reply);
        case 'commit_sales':
          return handleCommitSales(request, reply);
        case 'propose_correction':
          return handleProposeCorrection(request, reply);
        case 'commit_correction':
          return handleCommitCorrection(request, reply);
        case 'cancel_proposal':
          return handleCancelProposal(request, reply);
        case 'query_sales':
          return handleQuerySales(request, reply);
        default:
          throw new ApiError('NOT_FOUND', `Tool ${toolName} is unavailable`, { httpStatus: 404 });
      }
    });
  }

  app.post('/api/v1/proposals/:id/cancel', { schema: { params: uuidParams } }, async (request, reply) => {
    const context = (request as unknown as { easyLedger: { business: { id: string; currency: 'IDR' | 'USD'; ledger_revision: string } } }).easyLedger;
    const params = request.params as { id: string };
    const result = await proposals.cancelProposal({
      business_id: context.business.id,
      proposal_id: params.id,
    });
    return reply.code(200).send(successEnvelope(String(request.id), result, {
      currency: context.business.currency,
      ledger_revision: context.business.ledger_revision,
    }));
  });

  // A catalog row missing from the tenant is deliberately normalized to the
  // same 404 as an unknown ID.  Keep this explicit for callers that import
  // the service and for any future route-specific adapter.
  app.setNotFoundHandler((request, reply) => {
    const error = new ApiError('NOT_FOUND', 'Resource is unavailable', { httpStatus: 404 });
    return reply.code(404).send(errorEnvelope(String(request.id), error));
  });

  return app;
}

export const buildApp = createApp;
export default createApp;
