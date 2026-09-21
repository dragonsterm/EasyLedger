import test from 'node:test';
import assert from 'node:assert/strict';

import { createApp } from '../../apps/api/app.ts';

const owner = '00000000-0000-4000-8000-000000000101';
const business = '00000000-0000-4000-8000-000000000001';

function stubPool(rows = [{ id: business, currency: 'IDR', ledger_revision: '0' }]) {
  return {
    async query() { return { rows, rowCount: rows.length }; },
    async connect() { throw new Error('mutation should not reach the database in this contract test'); },
  };
}

test('API requires the injected authentication adapter and returns a request id', async (t) => {
  const app = createApp({ pool: stubPool(), authAdapter: () => null });
  t.after(() => app.close());
  const response = await app.inject({ method: 'GET', url: '/api/v1/products' });
  assert.equal(response.statusCode, 401);
  const body = response.json();
  assert.equal(body.code, 'UNAUTHORIZED');
  assert.match(body.request_id, /^req-/);
});

test('request schemas reject tenant identity and other extra properties', async (t) => {
  const app = createApp({ pool: stubPool(), authAdapter: () => ({ userId: owner }) });
  t.after(() => app.close());
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/products',
    headers: { 'idempotency-key': 'contract-extra' },
    payload: { name: 'Unsafe', business_id: business },
  });
  assert.equal(response.statusCode, 422);
  assert.equal(response.json().code, 'VALIDATION_ERROR');
});

test('mutations require the idempotency header before entering a service', async (t) => {
  const app = createApp({ pool: stubPool(), authAdapter: () => ({ userId: owner }) });
  t.after(() => app.close());
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/products',
    payload: { name: 'No Key' },
  });
  assert.equal(response.statusCode, 422);
  assert.equal(response.json().field_errors['idempotency-key'], 'must have required property \'idempotency-key\'');
});

test('authenticated users without a business receive 403 without a fallback tenant', async (t) => {
  const app = createApp({ pool: stubPool([]), authAdapter: () => ({ userId: owner }) });
  t.after(() => app.close());
  const response = await app.inject({ method: 'GET', url: '/api/v1/products' });
  assert.equal(response.statusCode, 403);
  assert.equal(response.json().code, 'FORBIDDEN');
});

test('read responses are ok and malformed JSON is a safe 400', async (t) => {
  const app = createApp({ pool: stubPool(), authAdapter: () => ({ userId: owner }) });
  t.after(() => app.close());

  const read = await app.inject({ method: 'GET', url: '/api/v1/products' });
  assert.equal(read.statusCode, 200);
  assert.equal(read.json().status, 'ok');

  const malformed = await app.inject({
    method: 'POST',
    url: '/api/v1/products',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': 'contract-malformed',
    },
    payload: '{"name":',
  });
  assert.equal(malformed.statusCode, 400);
  assert.equal(malformed.json().code, 'BAD_REQUEST');
  assert.equal(malformed.json().message, 'Request body is malformed');
});

test('TASK-25-02: POST /api/v1/analytics/query enforces auth, validates schemas, and returns aggregates', async (t) => {
  const app = createApp({ pool: stubPool(), authAdapter: () => ({ userId: owner }) });
  t.after(() => app.close());

  // 1. Unauthenticated request returns 401
  const unauthApp = createApp({ pool: stubPool(), authAdapter: () => null });
  t.after(() => unauthApp.close());
  const unauthRes = await unauthApp.inject({
    method: 'POST',
    url: '/api/v1/analytics/query',
    payload: { metric: 'revenue' },
  });
  assert.equal(unauthRes.statusCode, 401);
  assert.equal(unauthRes.json().code, 'UNAUTHORIZED');

  // 2. Extra property (business_id) returns 422 VALIDATION_ERROR
  const extraRes = await app.inject({
    method: 'POST',
    url: '/api/v1/analytics/query',
    payload: { metric: 'revenue', business_id: business },
  });
  assert.equal(extraRes.statusCode, 422);
  assert.equal(extraRes.json().code, 'VALIDATION_ERROR');

  // 3. Valid analytics query returns 200 OK and expected structure
  const validRes = await app.inject({
    method: 'POST',
    url: '/api/v1/analytics/query',
    payload: {
      metric: 'revenue',
      dimension: 'none',
      date_from: '2026-09-01',
      date_to: '2026-09-30',
    },
  });
  assert.equal(validRes.statusCode, 200);
  const data = validRes.json().data;
  assert.equal(data.metric, 'revenue');
  assert.equal(data.currency, 'IDR');
  assert.equal(data.completeness, 'complete');
  assert.equal(Array.isArray(data.rows), true);
  assert.equal(data.filters.date_from, '2026-09-01');
  assert.equal(data.filters.date_to, '2026-09-30');

  // 4. Exceeding 366 days limit returns 422 VALIDATION_ERROR
  const wideRangeRes = await app.inject({
    method: 'POST',
    url: '/api/v1/analytics/query',
    payload: {
      metric: 'units',
      date_from: '2024-01-01',
      date_to: '2025-06-01',
    },
  });
  assert.equal(wideRangeRes.statusCode, 422);
  assert.equal(wideRangeRes.json().code, 'VALIDATION_ERROR');
});
