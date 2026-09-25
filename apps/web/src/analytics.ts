export type AnalyticsMetric = 'revenue' | 'units';
export type AnalyticsDimension = 'date' | 'product' | 'none';
export type LedgerCurrency = 'IDR' | 'USD';

export interface AnalyticsQueryRequest {
  metric: AnalyticsMetric;
  dimension: AnalyticsDimension;
  date_from?: string;
  date_to?: string;
  product_ids?: string[];
}

export interface AnalyticsQueryRow {
  key: string;
  label: string;
  quantity: string | null;
  /** Exact minor units (whole rupiah for IDR, cents for USD), or null for a gap or wholly unknown revenue. */
  revenue: string | null;
  /** Present for date rows; distinguishes an open-day gap from confirmed zero and recorded sales. */
  data_state?: 'sales' | 'unknown-price' | 'gap' | 'confirmed-zero';
  /** Day completeness is independent of whether recorded sales have unknown prices. */
  coverage_state?: 'open' | 'complete';
}

export interface AnalyticsQueryResponse {
  metric: AnalyticsMetric;
  dimension: AnalyticsDimension;
  /** IDR whole-rupiah string or USD major-unit decimal string, both without a currency prefix. */
  total: string;
  currency: LedgerCurrency;
  ledger_revision: string;
  rows: AnalyticsQueryRow[];
  completeness: 'complete' | 'incomplete';
  has_unknown_prices: boolean;
  filters: {
    date_from: string | null;
    date_to: string | null;
    product_ids: string[];
  };
}

export interface AnalyticsQueryEnvelope {
  request_id: string;
  status: 'ok';
  data: AnalyticsQueryResponse;
  warnings: string[];
}

export interface SourceTransactionsQueryRequest {
  dimension: 'date' | 'product';
  datum_key: string;
  ledger_revision: string;
  date_from: string | null;
  date_to: string | null;
  product_ids: string[];
  cursor?: string;
  page_size: number;
}

export interface SourceTransaction {
  id: string;
  product_id: string;
  product_name: string;
  quantity: string;
  unit_price: string | null;
  line_revenue: string | null;
  sale_date: string;
  version: string;
  currency: LedgerCurrency;
}

export interface SourceTransactionsResponse {
  items: SourceTransaction[];
  has_more: boolean;
  next_cursor: string | null;
  currency: LedgerCurrency;
  ledger_revision: string;
  dimension: 'date' | 'product';
  datum_key: string;
  filters: AnalyticsQueryResponse['filters'];
}

export class AnalyticsHttpError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Analytics request failed with status ${status}`);
    this.name = 'AnalyticsHttpError';
    this.status = status;
  }
}

export interface ChartPoint {
  key: string;
  label: string;
  value: number | null;
  exactValue: string | null;
  quantity: string | null;
  state: 'known' | 'unknown-price' | 'gap' | 'confirmed-zero';
  coverageState?: 'open' | 'complete';
}

export type ChartMapping =
  | { status: 'ready'; points: ChartPoint[] }
  | { status: 'empty'; points: [] }
  | { status: 'unsupported-range'; points: []; reason: string };

/** Returns only an in-range ECharts series datum index; axis/background clicks are ignored. */
export function chartDataIndexFromEvent(event: unknown, pointCount: number): number | null {
  if (typeof event !== 'object' || event === null || !('componentType' in event) || !('dataIndex' in event)) return null;
  const click = event as { componentType?: unknown; dataIndex?: unknown };
  if (click.componentType !== 'series' || typeof click.dataIndex !== 'number' || !Number.isInteger(click.dataIndex)
    || click.dataIndex < 0 || click.dataIndex >= pointCount) return null;
  return click.dataIndex;
}

const DECIMAL_INTEGER = /^(0|[1-9]\d*)$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_SAFE_INTEGER = BigInt(Number.MAX_SAFE_INTEGER);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDecimalInteger(value: unknown): value is string {
  return typeof value === 'string' && DECIMAL_INTEGER.test(value);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Analytics response has an invalid ${field}`);
  }
  return value;
}

function dateRangeKeys(start: string, end: string): string[] {
  if (!ISO_DATE.test(start) || !ISO_DATE.test(end)) throw new Error('Analytics response has invalid date filters');
  const first = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(first.valueOf()) || Number.isNaN(last.valueOf()) || first.toISOString().slice(0, 10) !== start || last.toISOString().slice(0, 10) !== end || last < first) {
    throw new Error('Analytics response has invalid date filters');
  }
  const dayCount = (last.valueOf() - first.valueOf()) / 86_400_000 + 1;
  if (dayCount > 366) throw new Error('Analytics response date range exceeds 366 days');
  const keys: string[] = [];
  for (let day = 0; day < dayCount; day += 1) {
    const date = new Date(first.valueOf());
    date.setUTCDate(date.getUTCDate() + day);
    keys.push(date.toISOString().slice(0, 10));
  }
  return keys;
}

/** Validates the API success envelope before any response values reach the UI. */
export function parseAnalyticsQueryEnvelope(input: unknown): AnalyticsQueryEnvelope {
  if (!isRecord(input) || input.status !== 'ok' || !isRecord(input.data)) {
    throw new Error('Expected an analytics success response');
  }

  const data = input.data;
  if (data.metric !== 'revenue' && data.metric !== 'units') {
    throw new Error('Analytics response has an invalid metric');
  }
  if (data.dimension !== 'date' && data.dimension !== 'product' && data.dimension !== 'none') {
    throw new Error('Analytics response has an invalid dimension');
  }
  if (data.currency !== 'IDR' && data.currency !== 'USD') {
    throw new Error('Analytics response has an invalid currency');
  }
  if (data.completeness !== 'complete' && data.completeness !== 'incomplete') {
    throw new Error('Analytics response has an invalid completeness state');
  }
  if (typeof data.has_unknown_prices !== 'boolean') {
    throw new Error('Analytics response has an invalid unknown-price flag');
  }
  if (data.completeness !== (data.has_unknown_prices ? 'incomplete' : 'complete')) {
    throw new Error('Analytics completeness does not match its unknown-price flag');
  }
  if (!isDecimalInteger(data.ledger_revision)) {
    throw new Error('Analytics response has an invalid ledger revision');
  }
  const total = requireString(data.total, 'total');
  if (data.metric === 'units' && !isDecimalInteger(total)) {
    throw new Error('Analytics unit total must be a whole-number string');
  }
  if (data.metric === 'revenue') {
    if (data.currency === 'IDR' && !isDecimalInteger(total)) {
      throw new Error('IDR revenue total must be a whole-rupiah string');
    }
    if (data.currency === 'USD') parseUsdMajorTotalToMinor(total);
  }
  if (!Array.isArray(data.rows)) {
    throw new Error('Analytics response rows must be an array');
  }

  let containsUnknownRevenue = false;
  const rows = data.rows.map((value, index): AnalyticsQueryRow => {
    if (!isRecord(value)) throw new Error(`Analytics row ${index + 1} is invalid`);
    const quantity = value.quantity;
    const revenue = value.revenue;
    if (quantity !== null && !isDecimalInteger(quantity)) {
      throw new Error(`Analytics row ${index + 1} has an invalid quantity`);
    }
    if (revenue !== null && !isDecimalInteger(revenue)) {
      throw new Error(`Analytics row ${index + 1} has an invalid revenue`);
    }
    const dataState = value.data_state;
    const coverageState = value.coverage_state;
    if (dataState !== undefined && dataState !== 'sales' && dataState !== 'unknown-price' && dataState !== 'gap' && dataState !== 'confirmed-zero') {
      throw new Error(`Analytics row ${index + 1} has an invalid data state`);
    }
    if (coverageState !== undefined && coverageState !== 'open' && coverageState !== 'complete') {
      throw new Error(`Analytics row ${index + 1} has an invalid coverage state`);
    }
    if (data.dimension === 'date' && dataState === undefined) {
      throw new Error(`Analytics date row ${index + 1} is missing its data state`);
    }
    if (dataState === 'gap' && (quantity !== null || revenue !== null || coverageState !== 'open')) {
      throw new Error(`Analytics gap row ${index + 1} must be open with null values`);
    }
    if (dataState === 'confirmed-zero' && (quantity !== '0' || revenue !== '0' || coverageState !== 'complete')) {
      throw new Error(`Analytics confirmed-zero row ${index + 1} must be complete with exact zeros`);
    }
    if (dataState === 'sales' && revenue === null) {
      throw new Error(`Analytics sales row ${index + 1} cannot have unknown revenue`);
    }
    if ((dataState === 'sales' || dataState === 'unknown-price') && quantity === null) {
      throw new Error(`Analytics sales row ${index + 1} must include its quantity`);
    }
    if (quantity === null && dataState !== 'gap') {
      throw new Error(`Analytics row ${index + 1} can omit quantity only for a gap`);
    }
    if ((revenue === null && dataState !== 'gap') || dataState === 'unknown-price') {
      containsUnknownRevenue = true;
    }
    if (coverageState !== undefined && data.dimension !== 'date') {
      throw new Error(`Analytics non-date row ${index + 1} cannot include day coverage`);
    }
    return {
      key: requireString(value.key, `row ${index + 1} key`),
      label: requireString(value.label, `row ${index + 1} label`),
      quantity,
      revenue,
      ...(dataState ? { data_state: dataState } : {}),
      ...(coverageState ? { coverage_state: coverageState } : {}),
    };
  });
  if (containsUnknownRevenue && !data.has_unknown_prices) {
    throw new Error('Null revenue rows must be marked as having unknown prices');
  }

  if (!isRecord(data.filters) || !Array.isArray(data.filters.product_ids)) {
    throw new Error('Analytics response filters are invalid');
  }
  const { date_from: dateFrom, date_to: dateTo, product_ids: productIds } = data.filters;
  if ((dateFrom !== null && typeof dateFrom !== 'string') || (dateTo !== null && typeof dateTo !== 'string')) {
    throw new Error('Analytics response date filters are invalid');
  }
  if (!productIds.every((productId) => typeof productId === 'string')) {
    throw new Error('Analytics response product filters are invalid');
  }
  if (data.dimension === 'date' && (dateFrom !== null || dateTo !== null)) {
    if (typeof dateFrom !== 'string' || typeof dateTo !== 'string') {
      throw new Error('Bounded date analytics requires both normalized date filters');
    }
    const expectedDateKeys = dateRangeKeys(dateFrom, dateTo);
    if (rows.length !== expectedDateKeys.length || rows.some((row, index) => row.key !== expectedDateKeys[index])) {
      throw new Error('Bounded date analytics must include every date in the requested range');
    }
    if (rows.some((row) => row.coverage_state === undefined)) {
      throw new Error('Bounded date analytics rows must include day coverage state');
    }
  }

  const envelope: AnalyticsQueryEnvelope = {
    request_id: requireString(input.request_id, 'request id'),
    status: 'ok',
    data: {
      metric: data.metric,
      dimension: data.dimension,
      total,
      currency: data.currency,
      ledger_revision: data.ledger_revision,
      rows,
      completeness: data.completeness,
      has_unknown_prices: data.has_unknown_prices,
      filters: {
        date_from: dateFrom,
        date_to: dateTo,
        product_ids: productIds,
      },
    },
    warnings: Array.isArray(input.warnings) && input.warnings.every((warning) => typeof warning === 'string')
      ? input.warnings
      : [],
  };
  return envelope;
}

export function buildSourceTransactionsRequest(
  response: AnalyticsQueryResponse,
  dimension: 'date' | 'product',
  datumKey: string,
  cursor?: string,
  pageSize = 50,
): SourceTransactionsQueryRequest {
  if (response.dimension !== dimension) throw new Error('Chart datum dimension does not match its analytics query');
  if (datumKey.length === 0 || datumKey.length > 200) throw new Error('Chart datum key is invalid');
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new Error('Source transaction page size is invalid');
  return {
    dimension,
    datum_key: datumKey,
    ledger_revision: response.ledger_revision,
    date_from: response.filters.date_from,
    date_to: response.filters.date_to,
    product_ids: [...response.filters.product_ids],
    ...(cursor ? { cursor } : {}),
    page_size: pageSize,
  };
}

function sameFilters(left: AnalyticsQueryResponse['filters'], right: AnalyticsQueryResponse['filters']): boolean {
  return left.date_from === right.date_from
    && left.date_to === right.date_to
    && left.product_ids.length === right.product_ids.length
    && left.product_ids.every((value, index) => value === right.product_ids[index]);
}

/** Validates the owner-authorized source response against the exact chart query target. */
export function parseSourceTransactionsEnvelope(
  input: unknown,
  request: SourceTransactionsQueryRequest,
): SourceTransactionsResponse {
  if (!isRecord(input) || input.status !== 'ok' || !isRecord(input.data)) {
    throw new Error('Expected an authorized source-transactions response');
  }
  const data = input.data;
  if (data.dimension !== 'date' && data.dimension !== 'product') throw new Error('Source transaction dimension is invalid');
  if (data.dimension !== request.dimension || data.datum_key !== request.datum_key || data.ledger_revision !== request.ledger_revision) {
    throw new Error('Source transactions do not match the selected chart datum');
  }
  const currency = data.currency;
  if (currency !== 'IDR' && currency !== 'USD') throw new Error('Source transactions have an invalid currency');
  if (!isDecimalInteger(data.ledger_revision) || typeof data.has_more !== 'boolean' || !Array.isArray(data.items)) {
    throw new Error('Source transactions response is invalid');
  }
  if (data.next_cursor !== null && typeof data.next_cursor !== 'string') throw new Error('Source transaction cursor is invalid');
  if ((data.has_more && !data.next_cursor) || (!data.has_more && data.next_cursor !== null)) {
    throw new Error('Source transaction pagination state is invalid');
  }
  if (!isRecord(data.filters)) throw new Error('Source transaction filters are invalid');
  const filters = data.filters;
  if ((filters.date_from !== null && typeof filters.date_from !== 'string')
    || (filters.date_to !== null && typeof filters.date_to !== 'string')
    || !Array.isArray(filters.product_ids)
    || !filters.product_ids.every((productId) => typeof productId === 'string')) {
    throw new Error('Source transaction filters are invalid');
  }
  const normalizedFilters = {
    date_from: filters.date_from as string | null,
    date_to: filters.date_to as string | null,
    product_ids: filters.product_ids as string[],
  };
  if (!sameFilters(normalizedFilters, request)) throw new Error('Source transaction filters differ from the selected chart');

  const items = data.items.map((value, index): SourceTransaction => {
    if (!isRecord(value)) throw new Error(`Source transaction ${index + 1} is invalid`);
    const id = value.id;
    const productId = value.product_id;
    const productName = value.product_name;
    const quantity = value.quantity;
    const unitPrice = value.unit_price;
    const lineRevenue = value.line_revenue;
    const saleDate = value.sale_date;
    const version = value.version;
    if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
      || typeof productId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(productId)
      || typeof productName !== 'string' || productName.length === 0
      || !isDecimalInteger(quantity) || (unitPrice !== null && !isDecimalInteger(unitPrice))
      || (lineRevenue !== null && !isDecimalInteger(lineRevenue)) || !isDecimalInteger(version)
      || typeof saleDate !== 'string' || !ISO_DATE.test(saleDate)
      || value.currency !== currency) {
      throw new Error(`Source transaction ${index + 1} has invalid fields`);
    }
    if ((unitPrice === null && lineRevenue !== null)
      || (unitPrice !== null && lineRevenue !== (BigInt(quantity) * BigInt(unitPrice)).toString())) {
      throw new Error(`Source transaction ${index + 1} has inconsistent exact amounts`);
    }
    return {
      id,
      product_id: productId,
      product_name: productName,
      quantity,
      unit_price: unitPrice,
      line_revenue: lineRevenue,
      sale_date: saleDate,
      version,
      currency,
    };
  });
  if (items.length > request.page_size) throw new Error('Source transaction page exceeds requested size');
  return {
    items,
    has_more: data.has_more,
    next_cursor: data.next_cursor as string | null,
    currency,
    ledger_revision: data.ledger_revision,
    dimension: data.dimension,
    datum_key: request.datum_key,
    filters: normalizedFilters,
  };
}

async function postJson(path: string, payload: unknown): Promise<unknown> {
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new AnalyticsHttpError(response.status);
  return response.json() as Promise<unknown>;
}

export async function fetchAnalyticsQuery(request: AnalyticsQueryRequest): Promise<AnalyticsQueryResponse> {
  const envelope = parseAnalyticsQueryEnvelope(await postJson('/api/v1/analytics/query', request));
  return envelope.data;
}

export async function fetchSourceTransactions(
  request: SourceTransactionsQueryRequest,
): Promise<SourceTransactionsResponse> {
  const envelope = await postJson('/api/v1/analytics/source-transactions', request);
  return parseSourceTransactionsEnvelope(envelope, request);
}

/** Converts only exact integer strings within Number's safe range for ECharts. */
export function mapAnalyticsRowsToChart(response: AnalyticsQueryResponse): ChartMapping {
  if (response.rows.length === 0) return { status: 'empty', points: [] };

  const points: ChartPoint[] = [];
  for (const row of response.rows) {
    const exactValue = response.metric === 'revenue' ? row.revenue : row.quantity;
    if (row.data_state === 'gap') {
      points.push({ ...row, value: null, exactValue: null, state: 'gap', coverageState: row.coverage_state });
      continue;
    }
    if (exactValue === null) {
      points.push({
        ...row,
        value: null,
        exactValue: null,
        state: row.data_state === 'confirmed-zero' ? 'confirmed-zero' : 'unknown-price',
        coverageState: row.coverage_state,
      });
      continue;
    }

    const integer = BigInt(exactValue);
    if (integer > MAX_SAFE_INTEGER) {
      return {
        status: 'unsupported-range',
        points: [],
        reason: `${response.metric === 'revenue' ? 'Revenue' : 'Quantity'} is larger than the chart's safe numeric range.`,
      };
    }
    points.push({
      ...row,
      value: Number(integer),
      exactValue,
      state: row.data_state === 'confirmed-zero'
        ? 'confirmed-zero'
        : row.data_state === 'unknown-price'
          ? 'unknown-price'
          : 'known',
      coverageState: row.coverage_state,
    });
  }
  return { status: 'ready', points };
}

/** Formats a minor-unit string exactly; it never converts through a floating-point value. */
export function formatMoneyMinor(minorUnits: string, currency: LedgerCurrency): string {
  if (!isDecimalInteger(minorUnits)) throw new Error('Money value must be a non-negative integer string');
  const amount = BigInt(minorUnits);
  if (currency === 'IDR') {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }

  const dollars = amount / 100n;
  const cents = (amount % 100n).toString().padStart(2, '0');
  const whole = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(dollars);
  return `${whole}.${cents}`;
}

/** Escapes data labels before putting them into ECharts' HTML tooltip renderer. */
export function escapeTooltipHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function formatAnalyticsTotal(response: AnalyticsQueryResponse): string {
  const hasRecordedSales = response.rows.some((row) => row.quantity !== null && BigInt(row.quantity) > 0n);
  const hasConfirmedZeroDay = response.rows.some((row) => row.data_state === 'confirmed-zero');
  if (!hasRecordedSales && !hasConfirmedZeroDay) return 'No data';
  if (response.metric === 'revenue') {
    const minorUnits = response.currency === 'IDR'
      ? response.total
      : parseUsdMajorTotalToMinor(response.total);
    return formatMoneyMinor(minorUnits, response.currency);
  }
  if (!isDecimalInteger(response.total)) throw new Error('Unit total must be a whole-number string');
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(BigInt(response.total));
}

function parseUsdMajorTotalToMinor(total: string): string {
  const match = /^(0|[1-9]\d*)\.(\d{2})$/.exec(total);
  if (!match) throw new Error('USD revenue total must have exactly two decimal places');
  return (BigInt(match[1]) * 100n + BigInt(match[2])).toString();
}

const sampleFilters: AnalyticsQueryResponse['filters'] = {
  date_from: '2026-09-16',
  date_to: '2026-09-22',
  product_ids: [],
};

function sampleResponse(
  metric: AnalyticsMetric,
  dimension: AnalyticsDimension,
  total: string,
  rows: AnalyticsQueryRow[],
  unknownPrices = false,
): AnalyticsQueryResponse {
  return {
    metric,
    dimension,
    total,
    currency: 'IDR',
    ledger_revision: '142',
    rows,
    completeness: unknownPrices ? 'incomplete' : 'complete',
    has_unknown_prices: unknownPrices,
    filters: sampleFilters,
  };
}

/** Clearly labeled local fixture until the browser has an authenticated session. */
export const sampleDailyRevenue = sampleResponse('revenue', 'date', '3500000', [
  { key: '2026-09-16', label: '2026-09-16', quantity: '52', revenue: '520000', data_state: 'sales', coverage_state: 'complete' },
  { key: '2026-09-17', label: '2026-09-17', quantity: '78', revenue: '820000', data_state: 'sales', coverage_state: 'complete' },
  { key: '2026-09-18', label: '2026-09-18', quantity: '64', revenue: '620000', data_state: 'sales', coverage_state: 'complete' },
  { key: '2026-09-19', label: '2026-09-19', quantity: '118', revenue: '1060000', data_state: 'sales', coverage_state: 'complete' },
  { key: '2026-09-20', label: '2026-09-20', quantity: null, revenue: null, data_state: 'gap', coverage_state: 'open' },
  { key: '2026-09-21', label: '2026-09-21', quantity: '0', revenue: '0', data_state: 'confirmed-zero', coverage_state: 'complete' },
  { key: '2026-09-22', label: '2026-09-22', quantity: '112', revenue: '480000', data_state: 'unknown-price', coverage_state: 'open' },
], true);

export const sampleProductUnits = sampleResponse('units', 'product', '424', [
  { key: 'orange-juice', label: 'Orange Juice', quantity: '164', revenue: '1600000' },
  { key: 'rice-5kg', label: 'Rice 5kg', quantity: '118', revenue: '900000' },
  { key: 'coffee', label: 'Coffee', quantity: '88', revenue: '700000' },
  { key: 'other', label: 'Other', quantity: '54', revenue: '300000' },
], true);

export const sampleTotalRevenue = sampleResponse('revenue', 'none', '3500000', [
  { key: 'total', label: 'Total', quantity: '424', revenue: '3500000' },
], true);

export const sampleTotalUnits = sampleResponse('units', 'none', '424', [
  { key: 'total', label: 'Total', quantity: '424', revenue: '3500000' },
], true);
