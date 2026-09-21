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
