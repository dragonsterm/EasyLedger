import test from 'node:test';
import assert from 'node:assert/strict';

import { createApp } from '../../apps/api/app.ts';

const realMerchantUserId = '00000000-0000-4000-8000-000000000101';
const demoMerchantUserId = '00000000-0000-4000-8000-000000000102';

const realBusinessId = '00000000-0000-4000-8000-000000000001';
const demoBusinessId = '00000000-0000-4000-8000-000000000002';

function createMockDemoPool() {
  const businesses = [
    {
      id: realBusinessId,
      owner_user_id: realMerchantUserId,
      name: 'Real Merchant Store',
      currency: 'IDR',
      timezone: 'Asia/Jakarta',
      is_demo: false, // REAL BUSINESS!
      ledger_revision: '15',
    },
    {
      id: demoBusinessId,
      owner_user_id: demoMerchantUserId,
      name: '[DEMO] EasyLedger Juice Stall',
      currency: 'IDR',
      timezone: 'Asia/Jakarta',
      is_demo: true, // DEMO BUSINESS!
      ledger_revision: '8',
    },
  ];

  const executedQueries = [];

  return {
    executedQueries,
    async query(text, values = []) {
      const sql = String(text);
      executedQueries.push({ sql, values });

      if (sql.includes('owner_user_id = $1')) {
        const found = businesses.filter((b) => b.owner_user_id === values[0]);
        return { rows: found, rowCount: found.length };
      }
      if (sql.includes('businesses') && sql.includes('WHERE id = $1')) {
        const found = businesses.filter((b) => b.id === values[0]);
        return { rows: found, rowCount: found.length };
      }
      if (sql.includes('UPDATE businesses SET ledger_revision = 0 WHERE id = $1')) {
        const b = businesses.find((item) => item.id === values[0]);
        if (b) b.ledger_revision = '0';
        return { rows: [], rowCount: 1 };
      }
      if (sql.startsWith('DELETE FROM')) {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
    async connect() {
      throw new Error('pool connect should not be invoked in this test');
    },
  };
}

test('TASK-28-02: unauthenticated demo reset request returns 401 UNAUTHORIZED', async (t) => {
  const pool = createMockDemoPool();
  const app = createApp({
    pool,
    authAdapter: () => null,
  });
  t.after(() => app.close());

  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/demo/reset',
    payload: {},
  });
  assert.equal(res.statusCode, 401);
  assert.equal(res.json().code, 'UNAUTHORIZED');
});

test('TASK-28-02: real merchant workspace is STRICTLY PROTECTED against reset (403 FORBIDDEN, FR-16, Test T-10)', async (t) => {
  const pool = createMockDemoPool();
  const app = createApp({
    pool,
    authAdapter: () => ({ userId: realMerchantUserId }), // Real merchant login!
  });
  t.after(() => app.close());

  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/demo/reset',
    payload: {},
  });

  assert.equal(res.statusCode, 403);
  const body = res.json();
  assert.equal(body.code, 'FORBIDDEN');
  assert.match(body.message, /restricted to demo workspaces only/i);

  // Assert ZERO delete queries were run
  const deleteQueries = pool.executedQueries.filter((q) => q.sql.startsWith('DELETE FROM'));
  assert.equal(deleteQueries.length, 0);
});

test('TASK-28-02: demo workspace reset clears transactions and resets ledger revision to 0 (Test T-10)', async (t) => {
  const pool = createMockDemoPool();
  const app = createApp({
    pool,
    authAdapter: () => ({ userId: demoMerchantUserId }), // Demo merchant login!
  });
  t.after(() => app.close());

  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/demo/reset',
    payload: {},
  });

  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.status, 'ok');
  assert.equal(body.data.business_id, demoBusinessId);
  assert.equal(body.data.is_demo, true);
  assert.equal(body.data.ledger_revision, '0');
  assert.match(body.data.message, /successfully reset/i);

  // Verify deletion targeted demoBusinessId
  const deleteQueries = pool.executedQueries.filter((q) => q.sql.startsWith('DELETE FROM'));
  assert.ok(deleteQueries.length >= 6);
  for (const q of deleteQueries) {
    assert.equal(q.values[0], demoBusinessId);
  }

  // Alias route /api/demo/reset works identically
  const aliasRes = await app.inject({
    method: 'POST',
    url: '/api/demo/reset',
    payload: {},
  });
  assert.equal(aliasRes.statusCode, 200);
});
