import test from 'node:test';
import assert from 'node:assert/strict';
import { runBenchmark, generate10kSalesRecords, executeAnalyticsQuery } from '../../scripts/benchmark-analytics.mjs';

test('TASK-27-03: benchmark generates exactly 10,000 synthetic sales records with realistic fields', () => {
  const { records, products } = generate10kSalesRecords();
  assert.equal(records.length, 10000);
  assert.ok(products.length >= 5);

  const sample = records[0];
  assert.ok(sample.id);
  assert.ok(sample.business_id);
  assert.ok(sample.product_id);
  assert.ok(sample.sale_date);
  assert.equal(typeof sample.quantity, 'bigint');
  assert.ok(sample.quantity > 0n);
});

test('TASK-27-03: deterministic query engine computes exact BigInt sums without floating point error', () => {
  const records = [
    { id: '1', business_id: 'b1', product_id: 'p1', product_name: 'Juice', quantity: 10n, unit_price: 15000n, sale_date: '2026-09-01', voided: false },
    { id: '2', business_id: 'b1', product_id: 'p1', product_name: 'Juice', quantity: 5n, unit_price: null, sale_date: '2026-09-02', voided: false },
    { id: '3', business_id: 'b1', product_id: 'p1', product_name: 'Juice', quantity: 20n, unit_price: 15000n, sale_date: '2026-09-03', voided: true }, // voided
  ];

  const resRevenue = executeAnalyticsQuery(records, { metric: 'revenue', dimension: 'none' });
  assert.equal(resRevenue.total, '150000'); // 10 * 15000 = 150000
  assert.equal(resRevenue.hasUnknownPrices, true);

  const resUnits = executeAnalyticsQuery(records, { metric: 'units', dimension: 'none' });
  assert.equal(resUnits.total, '15'); // 10 + 5 = 15 (voided excluded)
});

test('TASK-27-03: performance benchmark across 10,000 records meets SRS NFR-02 latency target (p95 < 1s)', async () => {
  const result = await runBenchmark(100);
  assert.equal(result.recordCount, 10000);
  assert.equal(result.operationCount, 100);
  assert.equal(result.targetMet, true);
  assert.ok(result.p95Ms < 1000, `Expected p95 < 1000ms, observed ${result.p95Ms}ms`);
  assert.ok(result.p50Ms > 0);
});
