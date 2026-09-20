import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_LINES,
  MAX_QUANTITY,
  MAX_UNIT_PRICE,
  calculateRevenue,
  formatMoneyMinor,
  parseMoneyInput,
  serializeRevenueSummary,
  summarizeRevenue,
} from '../../packages/domain/money.ts';

test('T-01 golden ledger totals remain exact whole rupiah values', () => {
  const firstEntry = { quantity: 10n, unit_price: 15_000n };
  const secondEntry = { quantity: 6n, unit_price: 18_000n };

  assert.equal(calculateRevenue(firstEntry.quantity, firstEntry.unit_price), 150_000n);
  assert.equal(calculateRevenue(secondEntry.quantity, secondEntry.unit_price), 108_000n);
  assert.deepEqual(summarizeRevenue([firstEntry, secondEntry]), {
    currency: 'IDR',
    knownRevenue: 258_000n,
    unknownCount: 0,
    complete: true,
  });

  assert.deepEqual(summarizeRevenue([
    { ...firstEntry, quantity: 8n },
    secondEntry,
  ]), {
    currency: 'IDR',
    knownRevenue: 228_000n,
    unknownCount: 0,
    complete: true,
  });
});

test('NULL price is unknown while zero is a known free sale', () => {
  assert.equal(calculateRevenue(2n, null), null);
  assert.equal(calculateRevenue(2n, 0n), 0n);

  assert.deepEqual(summarizeRevenue([
    { quantity: 2n, unit_price: null },
    { quantity: 2n, unit_price: 0n },
  ]), {
    currency: 'IDR',
    knownRevenue: 0n,
    unknownCount: 1,
    complete: false,
  });
});

test('USD uses integer cents and rejects mixed-currency lines', () => {
  assert.equal(parseMoneyInput('12.50', 'USD'), 1250n);
  assert.equal(parseMoneyInput('12.5', 'USD'), 1250n);
  assert.equal(formatMoneyMinor(1250n, 'USD'), '12.50');
  assert.equal(parseMoneyInput('15000', 'IDR'), 15000n);
  assert.equal(formatMoneyMinor(15000n, 'IDR'), '15000');
  assert.equal(calculateRevenue(2n, 1250n, 'USD'), 2500n);
  assert.deepEqual(summarizeRevenue([
    { quantity: 2n, unit_price: 1250n, currency: 'USD' },
  ], 'USD'), {
    currency: 'USD',
    knownRevenue: 2500n,
    unknownCount: 0,
    complete: true,
  });
  assert.throws(() => summarizeRevenue([
    { quantity: 1n, unit_price: 100n, currency: 'USD' },
  ]), /mixed currencies/);
  assert.throws(() => calculateRevenue(1n, 1n, 'EUR'), /currency must be IDR or USD/);
  assert.throws(() => parseMoneyInput('15000.50', 'IDR'), /whole rupiah/);
  assert.throws(() => parseMoneyInput('12.345', 'USD'), /at most two decimal places/);
  assert.throws(() => parseMoneyInput('10000000.01', 'USD'), /unit_price must be between/);
});

test('maximum valid batch stays within PostgreSQL BIGINT without floating point', () => {
  const lines = Array.from({ length: MAX_LINES }, () => ({
    quantity: MAX_QUANTITY,
    unit_price: MAX_UNIT_PRICE,
  }));

  const summary = summarizeRevenue(lines);

  assert.equal(summary.knownRevenue, 100_000_000_000_000_000n);
  assert.equal(typeof summary.knownRevenue, 'bigint');
  assert.deepEqual(serializeRevenueSummary(summary), {
    currency: 'IDR',
    knownRevenue: '100000000000000000',
    unknownCount: 0,
    complete: true,
  });
});

test('quantity, price, line count, and numeric representation bounds are rejected', () => {
  assert.throws(() => calculateRevenue(0n, 1n), /quantity must be between 1 and 1000000/);
  assert.throws(() => calculateRevenue(BigInt(MAX_QUANTITY) + 1n, 1n), /quantity must be between 1 and 1000000/);
  assert.throws(() => calculateRevenue(1n, -1n), /unit_price must be between 0 and 1000000000/);
  assert.throws(() => calculateRevenue(1n, BigInt(MAX_UNIT_PRICE) + 1n), /unit_price must be between 0 and 1000000000/);
  assert.throws(() => calculateRevenue(1.5, 1n), /quantity must be a whole integer/);
  assert.throws(() => calculateRevenue(1n, '15000.0'), /unit_price must be a decimal integer/);
  assert.throws(() => calculateRevenue(1n, '1e3'), /unit_price must be a decimal integer/);
  assert.throws(() => summarizeRevenue(Array.from({ length: MAX_LINES + 1 }, () => ({ quantity: 1n, unit_price: 1n }))), /at most 100 lines/);
});
