/** Exact money arithmetic for the ledger boundary. */

export type Currency = 'IDR' | 'USD';

export interface RevenueLine {
  quantity: bigint | number | string;
  unit_price: bigint | number | string | null;
  currency?: Currency;
}

export interface RevenueSummary {
  currency: Currency;
  knownRevenue: bigint;
  unknownCount: number;
  complete: boolean;
}

export const MAX_LINES = 100;
export const MAX_QUANTITY = 1_000_000n;
// Prices are minor units: whole rupiah for IDR and cents for USD.
export const MAX_UNIT_PRICE_MINOR = 1_000_000_000n;
export const MAX_UNIT_PRICE = MAX_UNIT_PRICE_MINOR;
export const MAX_POSTGRES_BIGINT = 9_223_372_036_854_775_807n;

export const CURRENCIES = Object.freeze({
  IDR: Object.freeze({ code: 'IDR', minorUnit: 'rupiah', minorDigits: 0 }),
  USD: Object.freeze({ code: 'USD', minorUnit: 'cent', minorDigits: 2 }),
});

function parseCurrency(currency: string): Currency {
  if (currency !== 'IDR' && currency !== 'USD') {
    throw new TypeError('currency must be IDR or USD');
  }
  return currency;
}

function parseDecimalInteger(value: bigint | number | string, field: string): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new TypeError(`${field} must be a whole integer`);
    return BigInt(value);
  }
  if (/^(0|[1-9]\d*)$/.test(value)) return BigInt(value);
  throw new TypeError(`${field} must be a decimal integer`);
}

function validateBound(
  value: bigint,
  field: string,
  minimum: bigint,
  maximum: bigint,
): bigint {
  if (value < minimum || value > maximum) {
    throw new RangeError(`${field} must be between ${minimum} and ${maximum}`);
  }
  return value;
}

function parseQuantity(quantity: bigint | number | string): bigint {
  return validateBound(parseDecimalInteger(quantity, 'quantity'), 'quantity', 1n, MAX_QUANTITY);
}

function parseUnitPrice(unitPrice: bigint | number | string): bigint {
  return validateBound(
    parseDecimalInteger(unitPrice, 'unit_price'),
    'unit_price',
    0n,
    MAX_UNIT_PRICE_MINOR,
  );
}

/**
 * Parse a user-facing price into exact minor units.
 * IDR accepts whole rupiah. USD accepts dollars with at most two cent digits.
 */
export function parseMoneyInput(value: string, currency: Currency): bigint {
  const normalizedCurrency = parseCurrency(currency);
  if (typeof value !== 'string') throw new TypeError('money input must be a string');

  let minor: bigint;
  if (normalizedCurrency === 'IDR') {
    if (!/^(0|[1-9]\d*)$/.test(value)) {
      throw new TypeError('IDR input must be whole rupiah');
    }
    minor = BigInt(value);
  } else {
    const match = value.match(/^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/);
    if (!match) throw new TypeError('USD input must be dollars with at most two decimal places');
    const cents = (match[2] ?? '').padEnd(2, '0');
    minor = BigInt(match[1]) * 100n + BigInt(cents || '0');
  }

  return validateBound(minor, 'unit_price', 0n, MAX_UNIT_PRICE_MINOR);
}

export function formatMoneyMinor(value: bigint, currency: Currency): string {
  const normalizedCurrency = parseCurrency(currency);
  const minor = validateBound(value, 'money', 0n, MAX_POSTGRES_BIGINT);
  if (normalizedCurrency === 'IDR') return minor.toString();
  const dollars = minor / 100n;
  const cents = (minor % 100n).toString().padStart(2, '0');
  return `${dollars}.${cents}`;
}

/** Return exact known revenue, or null when unitPrice is unknown. */
export function calculateRevenue(
  quantity: bigint | number | string,
  unitPrice: bigint | number | string | null,
  currency: Currency = 'IDR',
): bigint | null {
  parseCurrency(currency);
  const normalizedQuantity = parseQuantity(quantity);
  if (unitPrice === null) return null;
  const revenue = normalizedQuantity * parseUnitPrice(unitPrice);
  if (revenue > MAX_POSTGRES_BIGINT) {
    throw new RangeError('revenue exceeds PostgreSQL BIGINT capacity');
  }
  return revenue;
}

/** Summarize a bounded batch without treating unknown revenue as zero. */
export function summarizeRevenue(
  lines: RevenueLine[],
  currency: Currency = 'IDR',
): RevenueSummary {
  if (!Array.isArray(lines)) throw new TypeError('lines must be an array');
  if (lines.length > MAX_LINES) {
    throw new RangeError(`a request may contain at most ${MAX_LINES} lines`);
  }

  const normalizedCurrency = parseCurrency(currency);
  let knownRevenue = 0n;
  let unknownCount = 0;
  for (const line of lines) {
    if (line.currency !== undefined && line.currency !== normalizedCurrency) {
      throw new RangeError('mixed currencies are not allowed in one ledger');
    }
    const revenue = calculateRevenue(line.quantity, line.unit_price, normalizedCurrency);
    if (revenue === null) {
      unknownCount += 1;
    } else {
      knownRevenue += revenue;
      if (knownRevenue > MAX_POSTGRES_BIGINT) {
        throw new RangeError('revenue exceeds PostgreSQL BIGINT capacity');
      }
    }
  }

  return { currency: normalizedCurrency, knownRevenue, unknownCount, complete: unknownCount === 0 };
}

export function serializeRevenueSummary(summary: RevenueSummary) {
  return {
    currency: summary.currency,
    knownRevenue: summary.knownRevenue.toString(),
    unknownCount: summary.unknownCount,
    complete: summary.complete,
  };
}

export const calculate_revenue = calculateRevenue;
export const summarize_revenue = summarizeRevenue;
