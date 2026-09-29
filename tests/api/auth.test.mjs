import test from 'node:test';
import assert from 'node:assert/strict';

import { createApp } from '../../apps/api/app.ts';
import { SessionAuthService } from '../../apps/api/sessionAuth.ts';

const demoUserId = '00000000-0000-4000-8000-000000000101';
const demoBusinessId = '00000000-0000-4000-8000-000000000001';

function createMockAuthPool() {
  const businesses = [
    {
      id: demoBusinessId,
      owner_user_id: demoUserId,
      name: '[DEMO] EasyLedger Juice Stall',
      currency: 'IDR',
      timezone: 'Asia/Jakarta',
      is_demo: true,
      ledger_revision: '4',
    },
  ];

  const products = [
    {
      id: '00000000-0000-4000-8000-000000000011',
      business_id: demoBusinessId,
      name: 'Orange Juice',
      default_unit_price: 15000,
      active: true,
    },
  ];

  const sales = [
    {
      id: '00000000-0000-4000-8000-000000000021',
      business_id: demoBusinessId,
      product_id: '00000000-0000-4000-8000-000000000011',
      quantity: 5,
      unit_price: 15000,
      sale_date: '2026-09-28',
      version: 1,
      voided: false,
    },
  ];

  const executedQueries = [];

  return {
    businesses,
    products,
    sales,
    executedQueries,
    async query(text, values = []) {
      const sql = String(text);
      executedQueries.push({ sql, values });

      if (sql.includes('FROM businesses') && sql.includes('WHERE is_demo = TRUE')) {
        const found = businesses.filter((b) => b.is_demo);
        return { rows: found, rowCount: found.length };
      }

      if (sql.includes('FROM businesses') && sql.includes('WHERE owner_user_id = $1')) {
        const found = businesses.filter((b) => b.owner_user_id === values[0]);
        return { rows: found, rowCount: found.length };
      }

      if (sql.includes('FROM businesses') && sql.includes('WHERE id = $1')) {
        const found = businesses.filter((b) => b.id === values[0]);
        return { rows: found, rowCount: found.length };
      }

      if (sql.includes('INSERT INTO businesses')) {
        const [id, owner_user_id, name, currency, timezone, is_demo] = values;
        const newBiz = { id, owner_user_id, name, currency, timezone, is_demo, ledger_revision: '0' };
        businesses.push(newBiz);
        return { rows: [newBiz], rowCount: 1 };
      }

      if (sql.includes('INSERT INTO products')) {
        return { rows: [], rowCount: 2 };
      }

      if (sql.includes('FROM products') && sql.includes('WHERE business_id = $1')) {
        const found = products.filter((p) => p.business_id === values[0]);
        return { rows: found, rowCount: found.length };
      }

      if (sql.includes('FROM sales') && sql.includes('WHERE business_id = $1')) {
        const found = sales.filter((s) => s.business_id === values[0]);
        return {
          rows: found.map((s) => ({
            ...s,
            product_name: 'Orange Juice',
            total_price: String(s.quantity * s.unit_price),
            created_at: new Date().toISOString(),
          })),
          rowCount: found.length,
        };
      }

      return { rows: [], rowCount: 0 };
    },
    async connect() {
      throw new Error('connect not implemented in mock');
    },
  };
}

test('TASK-29-01 auth: GET /health and /api/v1/health are public and return 200 OK', async (t) => {
  const pool = createMockAuthPool();
  const app = createApp({ pool });
  t.after(() => app.close());

  const h1 = await app.inject({ method: 'GET', url: '/health' });
  assert.equal(h1.statusCode, 200);
  assert.equal(h1.json().status, 'ok');

  const h2 = await app.inject({ method: 'GET', url: '/api/v1/health' });
  assert.equal(h2.statusCode, 200);
  assert.equal(h2.json().status, 'ok');
});

test('TASK-29-01 auth: OPTIONS preflight returns 204 with permissive CORS headers', async (t) => {
  const pool = createMockAuthPool();
  const app = createApp({ pool });
  t.after(() => app.close());

  const res = await app.inject({
    method: 'OPTIONS',
    url: '/api/v1/sales',
    headers: {
      origin: 'https://easyledger.onrender.com',
      'access-control-request-method': 'POST',
    },
  });
  assert.equal(res.statusCode, 204);
  assert.equal(res.headers['access-control-allow-origin'], 'https://easyledger.onrender.com');
  assert.match(res.headers['access-control-allow-methods'], /GET, POST/);
});

test('TASK-29-01 auth: unauthenticated request to protected endpoint returns 401 UNAUTHORIZED', async (t) => {
  const pool = createMockAuthPool();
  const app = createApp({ pool, authAdapter: () => null });
  t.after(() => app.close());

  const res = await app.inject({ method: 'GET', url: '/api/v1/sales' });
  assert.equal(res.statusCode, 401);
  assert.equal(res.json().code, 'UNAUTHORIZED');
});

test('TASK-29-01 auth: one-click demo login issues token, sets cookie, and unlocks protected APIs', async (t) => {
  const pool = createMockAuthPool();
  const sessionAuth = new SessionAuthService();
  const app = createApp({ pool, sessionAuth });
  t.after(() => app.close());

  // Check initial unauthenticated session status
  const initialSession = await app.inject({ method: 'GET', url: '/api/v1/auth/session' });
  assert.equal(initialSession.statusCode, 200);
  assert.equal(initialSession.json().data.authenticated, false);

  // 1-Click Demo Login
  const loginRes = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { merchant: 'demo' },
  });
  assert.equal(loginRes.statusCode, 200);
  const loginBody = loginRes.json();
  assert.equal(loginBody.status, 'ok');
  assert.ok(loginBody.data.token.startsWith('eld_'));
  assert.equal(loginBody.data.user_id, demoUserId);
  assert.equal(loginBody.data.business.name, '[DEMO] EasyLedger Juice Stall');
  assert.equal(loginBody.data.business.is_demo, true);
  assert.match(loginRes.headers['set-cookie'], /easyledger_session=eld_/);

  const token = loginBody.data.token;

  // Access protected API using Bearer Token
  const salesRes = await app.inject({
    method: 'GET',
    url: '/api/v1/sales',
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(salesRes.statusCode, 200);
  assert.equal(salesRes.json().status, 'ok');

  // Verify /auth/session now reports authenticated
  const checkSession = await app.inject({
    method: 'GET',
    url: '/api/v1/auth/session',
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(checkSession.statusCode, 200);
  assert.equal(checkSession.json().data.authenticated, true);
  assert.equal(checkSession.json().data.business.id, demoBusinessId);

  // Logout
  const logoutRes = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/logout',
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(logoutRes.statusCode, 200);

  // Token is now revoked
  const afterLogout = await app.inject({
    method: 'GET',
    url: '/api/v1/sales',
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(afterLogout.statusCode, 401);
});

test('TASK-29-01 auth: create new simulated merchant creates isolated tenant and session', async (t) => {
  const pool = createMockAuthPool();
  const sessionAuth = new SessionAuthService();
  const app = createApp({ pool, sessionAuth });
  t.after(() => app.close());

  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: {
      merchant: 'new',
      name: 'Warung Kopi Barokah',
      currency: 'IDR',
    },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.status, 'ok');
  assert.equal(body.data.business.name, 'Warung Kopi Barokah');
  assert.equal(body.data.business.currency, 'IDR');
  assert.equal(body.data.business.is_demo, false);

  const token = body.data.token;
  const salesRes = await app.inject({
    method: 'GET',
    url: '/api/v1/sales',
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(salesRes.statusCode, 200);
});
