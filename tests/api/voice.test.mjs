import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { createApp } from '../../apps/api/app.ts';

const owner = '00000000-0000-4000-8000-000000000101';
const business = '00000000-0000-4000-8000-000000000001';
const orangeProduct = '00000000-0000-4000-8000-000000000011';
const mangoProduct = '00000000-0000-4000-8000-000000000012';

function mockPool() {
  const businesses = [
    {
      id: business,
      name: 'Juice Stall Demo',
      currency: 'IDR',
      timezone: 'Asia/Jakarta',
      ledger_revision: '5',
      owner_user_id: owner,
    },
  ];

  const products = [
    {
      id: orangeProduct,
      business_id: business,
      name: 'Orange Juice',
      default_unit_price: '15000',
      active: true,
    },
    {
      id: mangoProduct,
      business_id: business,
      name: 'Mango Juice',
      default_unit_price: '18000',
      active: true,
    },
  ];

  const sales = [
    {
      id: '00000000-0000-4000-8000-000000000051',
      business_id: business,
      product_id: orangeProduct,
      product_name: 'Orange Juice',
      quantity: '10',
      unit_price: '15000',
      sale_date: '2026-09-23',
      version: '1',
      voided: false,
    },
  ];

  return {
    async query(text, values = []) {
      const sql = String(text);
      if (sql.includes('owner_user_id = $1')) {
        const found = businesses.filter((b) => b.owner_user_id === values[0]);
        return { rows: found, rowCount: found.length };
      }
      if (sql.includes('businesses') && sql.includes('WHERE id = $1')) {
        const found = businesses.filter((b) => b.id === values[0]);
        return { rows: found, rowCount: found.length };
      }
      if (sql.includes('FROM products') && sql.includes('id = $2')) {
        const found = products.filter((p) => p.business_id === values[0] && p.id === values[1]);
        return { rows: found, rowCount: found.length };
      }
      if (sql.includes('FROM products') && sql.includes('active')) {
        const found = products.filter((p) => p.business_id === values[0] && p.active);
        return { rows: found, rowCount: found.length };
      }
      if (sql.includes('SELECT 1 FROM products WHERE business_id = $1 AND id = $2')) {
        const found = products.filter((p) => p.business_id === values[0] && p.id === values[1]);
        return { rows: found, rowCount: found.length };
      }
      if (sql.includes('SELECT 1 FROM sales WHERE business_id = $1 AND id = $2')) {
        const found = sales.filter((s) => s.business_id === values[0] && s.id === values[1]);
        return { rows: found, rowCount: found.length };
      }
      if (sql.includes('SELECT id, name, default_unit_price') || sql.includes('FROM products WHERE business_id = $1 AND id = $2')) {
        const found = products.filter((p) => p.business_id === values[0] && p.id === values[1]);
        return { rows: found, rowCount: found.length };
      }
      if (sql.includes('FROM sales s') && sql.includes('s.id = $2')) {
        const found = sales.filter((s) => s.business_id === values[0] && s.id === values[1]);
        return { rows: found, rowCount: found.length };
      }
      if (sql.includes('FROM sales s')) {
        return {
          rows: [
            {
              row_key: 'total',
              row_label: 'Total',
              quantity_sum: '10',
              revenue_sum: '150000',
              unknown_price_count: '0',
            },
          ],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    },
    async connect() {
      throw new Error('mock pool mutation should not be called in this test');
    },
  };
}

test('TASK-23-01: POST /api/v1/voice/sessions authenticates merchant and issues ephemeral tokens', async (t) => {
  const app = createApp({
    pool: mockPool(),
    authAdapter: () => ({ userId: owner }),
    assemblyTokenGenerator: () => 'mock_provider_token_xyz',
  });
  t.after(() => app.close());

  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/voice/sessions',
    payload: { ttl_seconds: 900 },
  });

  assert.equal(res.statusCode, 201);
  const body = res.json();
  assert.equal(body.status, 'ok');
  assert.ok(body.data.session_id);
  assert.ok(body.data.session_token.startsWith('easysess_'));
  assert.equal(body.data.provider_token, 'mock_provider_token_xyz');
  assert.equal(body.data.expires_in_seconds, 900);
  assert.ok(body.data.websocket_url);

  // Alias /api/voice/sessions works identically
  const aliasRes = await app.inject({
    method: 'POST',
    url: '/api/voice/sessions',
    payload: {},
  });
  assert.equal(aliasRes.statusCode, 201);
});

test('TASK-23-04: Tool endpoints require valid voice session tokens (401 on missing/expired/invalid)', async (t) => {
  const app = createApp({
    pool: mockPool(),
    authAdapter: () => ({ userId: owner }),
    assemblyTokenGenerator: () => 'mock_token',
  });
  t.after(() => app.close());

  // 1. Missing token -> 401
  const missingRes = await app.inject({
    method: 'POST',
    url: '/api/v1/voice/tools/get_context',
    payload: {},
  });
  assert.equal(missingRes.statusCode, 401);
  assert.equal(missingRes.json().code, 'UNAUTHORIZED');

  // 2. Invalid token -> 401
  const invalidRes = await app.inject({
    method: 'POST',
    url: '/api/v1/voice/tools/get_context',
    headers: { authorization: 'Bearer invalid_token_123' },
    payload: {},
  });
  assert.equal(invalidRes.statusCode, 401);
  assert.equal(invalidRes.json().code, 'UNAUTHORIZED');

  // 3. Valid token works via header or query parameter
  const sessionRes = await app.inject({
    method: 'POST',
    url: '/api/v1/voice/sessions',
    payload: { ttl_seconds: 600 },
  });
  const sessionToken = sessionRes.json().data.session_token;

  const validRes = await app.inject({
    method: 'POST',
    url: '/api/v1/voice/tools/get_context',
    headers: { authorization: `Bearer ${sessionToken}` },
    payload: {},
  });
  assert.equal(validRes.statusCode, 200);
  const contextData = validRes.json().data;
  assert.equal(contextData.business_id, business);
  assert.equal(contextData.currency, 'IDR');
  assert.equal(contextData.timezone, 'Asia/Jakarta');
  assert.equal(contextData.catalog.length, 2);
});

test('TASK-23-03: Tool endpoints strictly reject client-supplied or model-supplied business_id (422)', async (t) => {
  const app = createApp({
    pool: mockPool(),
    authAdapter: () => ({ userId: owner }),
    assemblyTokenGenerator: () => 'mock_token',
  });
  t.after(() => app.close());

  const sessionRes = await app.inject({
    method: 'POST',
    url: '/api/v1/voice/sessions',
    payload: {},
  });
  const sessionToken = sessionRes.json().data.session_token;

  // Attempting to supply business_id in propose_sales
  const spoofRes = await app.inject({
    method: 'POST',
    url: '/api/v1/voice/tools/propose_sales',
    headers: { authorization: `Bearer ${sessionToken}` },
    payload: {
      business_id: randomUUID(), // forbidden
      lines: [
        { product_id: orangeProduct, quantity: '3', sale_date: '2026-09-23' },
      ],
    },
  });

  assert.equal(spoofRes.statusCode, 422);
  assert.equal(spoofRes.json().code, 'VALIDATION_ERROR');

  // Attempting to supply actor_user_id in get_context
  const spoofActorRes = await app.inject({
    method: 'POST',
    url: '/api/v1/voice/tools/get_context',
    headers: { authorization: `Bearer ${sessionToken}` },
    payload: {
      actor_user_id: 'malicious-user',
    },
  });
  assert.equal(spoofActorRes.statusCode, 422);
  assert.equal(spoofActorRes.json().code, 'VALIDATION_ERROR');
});

test('TASK-23-02: HTTP tool gateway supports propose_sales, propose_correction, and query_sales', async (t) => {
  const app = createApp({
    pool: mockPool(),
    authAdapter: () => ({ userId: owner }),
    assemblyTokenGenerator: () => 'mock_token',
  });
  t.after(() => app.close());

  const sessionRes = await app.inject({
    method: 'POST',
    url: '/api/v1/voice/sessions',
    payload: {},
  });
  const sessionToken = sessionRes.json().data.session_token;

  // 1. propose_sales with default price snapshot
  const proposeRes = await app.inject({
    method: 'POST',
    url: '/api/v1/voice/tools/propose_sales',
    headers: { 'x-session-token': sessionToken },
    payload: {
      lines: [
        { product_id: orangeProduct, quantity: '2', sale_date: '2026-09-23' },
      ],
    },
  });

  assert.equal(proposeRes.statusCode, 200);
  const propBody = proposeRes.json().data;
  assert.ok(propBody.proposal_id);
  assert.ok(propBody.confirmation_token);
  assert.equal(propBody.status, 'awaiting_confirmation');
  assert.equal(propBody.total_quantity, '2');
  assert.equal(propBody.known_total_revenue, '30000'); // 2 * 15000
  assert.equal(propBody.lines[0].unit_price, '15000');

  // 2. propose_correction checks current sale version
  const corrRes = await app.inject({
    method: 'POST',
    url: '/api/v1/voice/tools/propose_correction',
    headers: { 'x-session-token': sessionToken },
    payload: {
      sale_id: '00000000-0000-4000-8000-000000000051',
      expected_version: '1',
      changes: { quantity: '8' },
      reason: 'Customer requested 8 instead of 10',
    },
  });

  assert.equal(corrRes.statusCode, 200);
  const corrBody = corrRes.json().data;
  assert.ok(corrBody.proposal_id);
  assert.ok(corrBody.confirmation_token);
  assert.equal(corrBody.before_values.quantity, '10');
  assert.equal(corrBody.after_values.quantity, '8');

  // Stale version rejected with 409
  const staleRes = await app.inject({
    method: 'POST',
    url: '/api/v1/voice/tools/propose_correction',
    headers: { 'x-session-token': sessionToken },
    payload: {
      sale_id: '00000000-0000-4000-8000-000000000051',
      expected_version: '999', // stale
      changes: { quantity: '8' },
      reason: 'Customer requested 8',
    },
  });
  assert.equal(staleRes.statusCode, 409);
  assert.equal(staleRes.json().code, 'CONFLICT');

  // 3. query_sales returns aggregated numbers
  const queryRes = await app.inject({
    method: 'POST',
    url: '/api/v1/voice/tools/query_sales',
    headers: { 'x-session-token': sessionToken },
    payload: {
      metric: 'revenue',
      dimension: 'none',
      date_from: '2026-09-01',
      date_to: '2026-09-30',
    },
  });
  assert.equal(queryRes.statusCode, 200);
  const queryBody = queryRes.json().data;
  assert.equal(queryBody.metric, 'revenue');
  assert.equal(queryBody.currency, 'IDR');
  assert.equal(queryBody.total, '150000');

  // 4. Generic tool dispatcher route: POST /api/v1/voice/tools/:tool
  const dispatchRes = await app.inject({
    method: 'POST',
    url: '/api/v1/voice/tools/get_context',
    headers: { authorization: `Bearer ${sessionToken}` },
    payload: {},
  });
  assert.equal(dispatchRes.statusCode, 200);
});

test('TASK-24-02: ambiguity detection triggers NEEDS_CLARIFICATION without ledger mutation', async (t) => {
  const app = createApp({
    pool: mockPool(),
    authAdapter: () => ({ userId: owner }),
    assemblyTokenGenerator: () => 'mock_token',
  });
  t.after(() => app.close());

  const sessionRes = await app.inject({
    method: 'POST',
    url: '/api/v1/voice/sessions',
    payload: {},
  });
  const sessionToken = sessionRes.json().data.session_token;

  // 1. Ambiguous intent (total vs additional) triggers NEEDS_CLARIFICATION
  const ambigRes = await app.inject({
    method: 'POST',
    url: '/api/v1/voice/tools/propose_sales',
    headers: { 'x-session-token': sessionToken },
    payload: {
      intent: 'unknown',
      lines: [
        { product_id: orangeProduct, quantity: '10', sale_date: '2026-09-24' },
      ],
    },
  });
  assert.equal(ambigRes.statusCode, 422);
  const ambigBody = ambigRes.json();
  assert.equal(ambigBody.code, 'NEEDS_CLARIFICATION');
  assert.equal(ambigBody.message, 'Is this your total sales for today, or additional sales?');
  assert.equal(ambigBody.field_errors.intent, 'ambiguous_intent');

  // 2. Unknown product in catalog triggers NEEDS_CLARIFICATION
  const unknownProdRes = await app.inject({
    method: 'POST',
    url: '/api/v1/voice/tools/propose_sales',
    headers: { 'x-session-token': sessionToken },
    payload: {
      lines: [
        { product_id: '00000000-0000-4000-8000-999999999999', quantity: '5', sale_date: '2026-09-24' },
      ],
    },
  });
  assert.equal(unknownProdRes.statusCode, 422);
  const unknownProdBody = unknownProdRes.json();
  assert.equal(unknownProdBody.code, 'NEEDS_CLARIFICATION');
  assert.equal(unknownProdBody.field_errors.product_id, 'unknown_product');

  // 3. Ambiguous or unknown correction target triggers NEEDS_CLARIFICATION
  const ambigTargetRes = await app.inject({
    method: 'POST',
    url: '/api/v1/voice/tools/propose_correction',
    headers: { 'x-session-token': sessionToken },
    payload: {
      sale_id: '00000000-0000-4000-8000-999999999999',
      expected_version: '1',
      changes: { quantity: '5' },
      reason: 'Fix wrong amount',
    },
  });
  assert.equal(ambigTargetRes.statusCode, 422);
  const ambigTargetBody = ambigTargetRes.json();
  assert.equal(ambigTargetBody.code, 'NEEDS_CLARIFICATION');
  assert.equal(ambigTargetBody.field_errors.sale_id, 'ambiguous_target');
});

test('TASK-24-04: cancellation/disconnect handling prevents mutation and marks proposal cancelled', async (t) => {
  const app = createApp({
    pool: mockPool(),
    authAdapter: () => ({ userId: owner }),
    assemblyTokenGenerator: () => 'mock_token',
  });
  t.after(() => app.close());

  const sessionRes = await app.inject({
    method: 'POST',
    url: '/api/v1/voice/sessions',
    payload: {},
  });
  const sessionToken = sessionRes.json().data.session_token;

  // 1. Propose sales
  const proposeRes = await app.inject({
    method: 'POST',
    url: '/api/v1/voice/tools/propose_sales',
    headers: { 'x-session-token': sessionToken },
    payload: {
      lines: [
        { product_id: orangeProduct, quantity: '3', sale_date: '2026-09-24' },
      ],
    },
  });
  assert.equal(proposeRes.statusCode, 200);
  const proposalId = proposeRes.json().data.proposal_id;
  const token = proposeRes.json().data.confirmation_token;

  // 2. Cancel proposal via tool
  const cancelRes = await app.inject({
    method: 'POST',
    url: '/api/v1/voice/tools/cancel_proposal',
    headers: { 'x-session-token': sessionToken },
    payload: {
      proposal_id: proposalId,
      reason: 'User disconnected or interrupted turn',
    },
  });
  assert.equal(cancelRes.statusCode, 200);
  assert.equal(cancelRes.json().data.status, 'cancelled');

  // 3. Attempting to commit cancelled proposal is rejected with 409
  const commitRes = await app.inject({
    method: 'POST',
    url: '/api/v1/voice/tools/commit_sales',
    headers: { 'x-session-token': sessionToken },
    payload: {
      proposal_id: proposalId,
      confirmation_token: token,
      idempotency_key: 'cancelled-commit-attempt',
    },
  });
  assert.equal(commitRes.statusCode, 409);
  assert.equal(commitRes.json().code, 'PROPOSAL_EXPIRED');

  // 4. Test REST route POST /api/v1/proposals/:id/cancel
  const propose2 = await app.inject({
    method: 'POST',
    url: '/api/v1/voice/tools/propose_sales',
    headers: { 'x-session-token': sessionToken },
    payload: {
      lines: [{ product_id: orangeProduct, quantity: '1', sale_date: '2026-09-24' }],
    },
  });
  const prop2Id = propose2.json().data.proposal_id;
  const restCancel = await app.inject({
    method: 'POST',
    url: `/api/v1/proposals/${prop2Id}/cancel`,
  });
  assert.equal(restCancel.statusCode, 200);
  assert.equal(restCancel.json().data.status, 'cancelled');
});
