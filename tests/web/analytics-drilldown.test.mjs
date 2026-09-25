import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AnalyticsHttpError,
  buildSourceTransactionsRequest,
  chartDataIndexFromEvent,
  fetchAnalyticsQuery,
  fetchSourceTransactions,
  mapAnalyticsRowsToChart,
  parseSourceTransactionsEnvelope,
  sampleDailyRevenue,
  sampleProductUnits,
} from '../../apps/web/src/analytics.ts';

const productId = '00000000-0000-4000-8000-000000000011';
const saleId = '00000000-0000-4000-8000-000000000021';

function responseFor(request, overrides = {}) {
  return {
    request_id: 'req-test',
    status: 'ok',
    data: {
      items: [{
        id: saleId,
        product_id: productId,
        product_name: 'Coffee',
        quantity: '3',
        unit_price: null,
        line_revenue: null,
        sale_date: '2026-09-17',
        version: '2',
        currency: 'IDR',
      }],
      has_more: false,
      next_cursor: null,
      currency: 'IDR',
      ledger_revision: request.ledger_revision,
      dimension: request.dimension,
      datum_key: request.datum_key,
      filters: {
        date_from: request.date_from,
        date_to: request.date_to,
        product_ids: request.product_ids,
      },
      ...overrides,
    },
    warnings: [],
  };
}

test('source request preserves the chart ledger revision and normalized date/product filters', () => {
  const datePoint = buildSourceTransactionsRequest(sampleDailyRevenue, 'date', '2026-09-22');
  assert.deepEqual(datePoint, {
    dimension: 'date',
    datum_key: '2026-09-22',
    ledger_revision: '142',
    date_from: '2026-09-16',
    date_to: '2026-09-22',
    product_ids: [],
    page_size: 50,
  });
  const productPoint = buildSourceTransactionsRequest(sampleProductUnits, 'product', productId, 'eyJvayI6MX0', 25);
  assert.equal(productPoint.dimension, 'product');
  assert.equal(productPoint.cursor, 'eyJvayI6MX0');
  assert.equal(productPoint.page_size, 25);
  assert.throws(() => buildSourceTransactionsRequest(sampleDailyRevenue, 'product', productId), /dimension/);
});

test('ECharts series clicks map to an in-range chart datum and ignore axes/background', () => {
  const mapping = mapAnalyticsRowsToChart(sampleDailyRevenue);
  assert.equal(mapping.status, 'ready');
  assert.equal(chartDataIndexFromEvent({ componentType: 'series', dataIndex: 6 }, mapping.points.length), 6);
  assert.equal(mapping.points[chartDataIndexFromEvent({ componentType: 'series', dataIndex: 6 }, mapping.points.length)].key, '2026-09-22');
  assert.equal(chartDataIndexFromEvent({ componentType: 'xAxis', dataIndex: 6 }, mapping.points.length), null);
  assert.equal(chartDataIndexFromEvent({ componentType: 'series', dataIndex: 7 }, mapping.points.length), null);
  assert.equal(chartDataIndexFromEvent({ componentType: 'series', dataIndex: -1 }, mapping.points.length), null);
});

test('source envelope validates exact minor-unit values, selected datum, revision and filters', () => {
  const request = buildSourceTransactionsRequest(sampleDailyRevenue, 'date', '2026-09-17');
  const parsed = parseSourceTransactionsEnvelope(responseFor(request), request);
  assert.equal(parsed.items[0].line_revenue, null);
  assert.equal(parsed.items[0].quantity, '3');
  assert.equal(parsed.ledger_revision, '142');

  const priced = responseFor(request);
  priced.data.items[0].unit_price = '1250';
  priced.data.items[0].line_revenue = '3750';
  assert.equal(parseSourceTransactionsEnvelope(priced, request).items[0].line_revenue, '3750');
  priced.data.items[0].line_revenue = '3751';
  assert.throws(() => parseSourceTransactionsEnvelope(priced, request), /inconsistent exact amounts/);

  const wrongRevision = responseFor(request);
  wrongRevision.data.ledger_revision = '143';
  assert.throws(() => parseSourceTransactionsEnvelope(wrongRevision, request), /do not match/);
});

test('live analytics and source fetch use same-origin authenticated requests and preserve HTTP status', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const calls = [];
  globalThis.fetch = async (path, init) => {
    calls.push({ path, init });
    return { ok: true, json: async () => responseFor(init.body ? JSON.parse(init.body) : {}) };
  };
  const request = buildSourceTransactionsRequest(sampleDailyRevenue, 'date', '2026-09-17');
  await fetchSourceTransactions(request);
  assert.equal(calls[0].path, '/api/v1/analytics/source-transactions');
  assert.equal(calls[0].init.credentials, 'same-origin');
  assert.deepEqual(JSON.parse(calls[0].init.body), request);

  globalThis.fetch = async (path, init) => {
    calls.push({ path, init });
    return {
      ok: true,
      json: async () => ({
        request_id: 'req-live', status: 'ok', warnings: [],
        data: {
          metric: 'revenue', dimension: 'date', total: '0', currency: 'IDR', ledger_revision: '9',
          rows: [], completeness: 'complete', has_unknown_prices: false,
          filters: { date_from: null, date_to: null, product_ids: [] },
        },
      }),
    };
  };
  const live = await fetchAnalyticsQuery({ metric: 'revenue', dimension: 'date' });
  assert.equal(live.ledger_revision, '9');
  assert.equal(calls[1].path, '/api/v1/analytics/query');
  assert.equal(calls[1].init.credentials, 'same-origin');

  globalThis.fetch = async () => ({ ok: false, status: 401 });
  await assert.rejects(fetchAnalyticsQuery({ metric: 'revenue', dimension: 'date' }), (error) => {
    assert.ok(error instanceof AnalyticsHttpError);
    assert.equal(error.status, 401);
    return true;
  });
});
