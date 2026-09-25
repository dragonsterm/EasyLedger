import test from 'node:test';
import assert from 'node:assert/strict';

import {
  mapAnalyticsRowsToChart,
  parseAnalyticsQueryEnvelope,
} from '../../apps/web/src/analytics.ts';

const product = '00000000-0000-4000-8000-000000000201';

function dateResponse(overrides = {}) {
  return {
    request_id: 'req-analytics',
    status: 'ok',
    data: {
      metric: 'revenue',
      dimension: 'date',
      total: '125',
      currency: 'IDR',
      ledger_revision: '9',
      completeness: 'incomplete',
      has_unknown_prices: true,
      rows: [
        { key: '2026-09-01', label: '2026-09-01', quantity: '2', revenue: null, data_state: 'unknown-price', coverage_state: 'open' },
        { key: '2026-09-02', label: '2026-09-02', quantity: null, revenue: null, data_state: 'gap', coverage_state: 'open' },
        { key: '2026-09-03', label: '2026-09-03', quantity: '0', revenue: '0', data_state: 'confirmed-zero', coverage_state: 'complete' },
        { key: '2026-09-04', label: '2026-09-04', quantity: '1', revenue: '125', data_state: 'sales', coverage_state: 'complete' },
      ],
      filters: { date_from: '2026-09-01', date_to: '2026-09-04', product_ids: [product] },
      ...overrides,
    },
  };
}

test('analytics chart mapping preserves open gaps, confirmed zeroes, and unknown-price sales', () => {
  const response = parseAnalyticsQueryEnvelope(dateResponse());
  const mapping = mapAnalyticsRowsToChart(response.data);

  assert.equal(mapping.status, 'ready');
  assert.deepEqual(mapping.points.map((point) => ({ key: point.key, value: point.value, exactValue: point.exactValue, state: point.state, coverageState: point.coverageState })), [
    { key: '2026-09-01', value: null, exactValue: null, state: 'unknown-price', coverageState: 'open' },
    { key: '2026-09-02', value: null, exactValue: null, state: 'gap', coverageState: 'open' },
    { key: '2026-09-03', value: 0, exactValue: '0', state: 'confirmed-zero', coverageState: 'complete' },
    { key: '2026-09-04', value: 125, exactValue: '125', state: 'known', coverageState: 'complete' },
  ]);
});

test('analytics envelope rejects malformed gap and confirmed-zero rows', () => {
  const malformedGap = dateResponse();
  malformedGap.data.rows[1].quantity = '0';
  assert.throws(() => parseAnalyticsQueryEnvelope(malformedGap), /gap row.*null values/);

  const malformedZero = dateResponse();
  malformedZero.data.rows[2].coverage_state = 'open';
  assert.throws(() => parseAnalyticsQueryEnvelope(malformedZero), /confirmed-zero row.*complete with exact zeros/);

  const missingUnknownFlag = dateResponse();
  missingUnknownFlag.data.has_unknown_prices = false;
  missingUnknownFlag.data.completeness = 'complete';
  assert.throws(() => parseAnalyticsQueryEnvelope(missingUnknownFlag), /Null revenue rows must be marked/);

  const missingDate = dateResponse();
  missingDate.data.rows.splice(1, 1);
  assert.throws(() => parseAnalyticsQueryEnvelope(missingDate), /include every date in the requested range/);

  const missingCoverage = dateResponse();
  delete missingCoverage.data.rows[0].coverage_state;
  assert.throws(() => parseAnalyticsQueryEnvelope(missingCoverage), /include day coverage state/);
});
