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
  quantity: string;
  /** Exact minor units (whole rupiah for IDR, cents for USD), or null when all prices are unknown. */
  revenue: string | null;
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

export interface ChartPoint {
  key: string;
  label: string;
  value: number | null;
  exactValue: string | null;
  quantity: string;
  state: 'known' | 'unknown-price';
}

export type ChartMapping =
  | { status: 'ready'; points: ChartPoint[] }
  | { status: 'empty'; points: [] }
  | { status: 'unsupported-range'; points: []; reason: string };

const DECIMAL_INTEGER = /^(0|[1-9]\d*)$/;
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
    if (!isDecimalInteger(quantity)) {
      throw new Error(`Analytics row ${index + 1} has an invalid quantity`);
    }
    if (revenue !== null && !isDecimalInteger(revenue)) {
      throw new Error(`Analytics row ${index + 1} has an invalid revenue`);
    }
    if (revenue === null) containsUnknownRevenue = true;
    return {
      key: requireString(value.key, `row ${index + 1} key`),
      label: requireString(value.label, `row ${index + 1} label`),
      quantity,
      revenue,
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

/** Converts only exact integer strings within Number's safe range for ECharts. */
export function mapAnalyticsRowsToChart(response: AnalyticsQueryResponse): ChartMapping {
  if (response.rows.length === 0) return { status: 'empty', points: [] };

  const points: ChartPoint[] = [];
  for (const row of response.rows) {
    const exactValue = response.metric === 'revenue' ? row.revenue : row.quantity;
    if (exactValue === null) {
      points.push({ ...row, value: null, exactValue: null, state: 'unknown-price' });
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
      state: 'known',
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
  if (!response.rows.some((row) => BigInt(row.quantity) > 0n)) return 'No data';
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
  { key: '2026-09-16', label: '2026-09-16', quantity: '52', revenue: '520000' },
  { key: '2026-09-17', label: '2026-09-17', quantity: '78', revenue: '820000' },
  { key: '2026-09-18', label: '2026-09-18', quantity: '64', revenue: '620000' },
  { key: '2026-09-19', label: '2026-09-19', quantity: '118', revenue: '1060000' },
  { key: '2026-09-20', label: '2026-09-20', quantity: '4', revenue: null },
  { key: '2026-09-21', label: '2026-09-21', quantity: '6', revenue: '0' },
  { key: '2026-09-22', label: '2026-09-22', quantity: '102', revenue: '480000' },
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
