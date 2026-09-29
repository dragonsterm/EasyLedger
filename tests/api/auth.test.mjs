import test from 'node:test';
import assert from 'node:assert/strict';

import { createApp } from '../../apps/api/app.ts';

function mockPool(query = async () => ({ rows: [], rowCount: 0 })) {
  return {
    query,
    async connect() {
      throw new Error('This test does not use a transaction client');
    },
  };
}

test('CORS allows only an exact configured origin and answers an allowed preflight', async (t) => {
  const app = createApp({ pool: mockPool(), corsAllowedOrigins: 'https://ledger.example' });
  t.after(() => app.close());

  const allowed = await app.inject({ method: 'GET', url: '/health', headers: { origin: 'https://ledger.example' } });
  assert.equal(allowed.statusCode, 200);
  assert.equal(allowed.headers['access-control-allow-origin'], 'https://ledger.example');
  assert.equal(allowed.headers['access-control-allow-credentials'], 'true');

  const preflight = await app.inject({
    method: 'OPTIONS',
    url: '/api/v1/auth/signup',
    headers: { origin: 'https://ledger.example', 'access-control-request-method': 'POST' },
  });
  assert.equal(preflight.statusCode, 204);
  assert.match(preflight.headers['access-control-allow-methods'], /POST/);

  const denied = await app.inject({ method: 'GET', url: '/health', headers: { origin: 'https://evil.example' } });
  assert.equal(denied.statusCode, 403);
  assert.equal(denied.headers['access-control-allow-origin'], undefined);
});

test('login and signup share a bounded per-IP rate limit', async (t) => {
  const app = createApp({ pool: mockPool() });
  t.after(() => app.close());

  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { merchant: 'account', username: 'missing-user', password: 'wrong-password' },
    });
    assert.equal(response.statusCode, 401, `attempt ${attempt}`);
  }
  const limited = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/signup',
    payload: { username: 'new-merchant', email: 'new@example.test', password: 'long-password-1', business_name: 'New Shop', currency: 'IDR' },
  });
  assert.equal(limited.statusCode, 429);
  assert.ok(Number(limited.headers['retry-after']) > 0);
});

test('a session lookup database error returns 5xx instead of a signed-out result', async (t) => {
  const pool = mockPool(async () => { throw new Error('database is offline'); });
  const app = createApp({ pool });
  t.after(() => app.close());

  const response = await app.inject({
    method: 'GET',
    url: '/api/v1/auth/session',
    headers: { cookie: 'easyledger_session=token-that-cannot-be-checked' },
  });
  assert.equal(response.statusCode, 500);
  assert.notEqual(response.json().data?.authenticated, false);
});

test('analytics database errors are surfaced without returning fabricated rows', async (t) => {
  const ownerId = '00000000-0000-4000-8000-000000000101';
  const businessId = '00000000-0000-4000-8000-000000000001';
  const pool = mockPool(async (sql) => {
    if (String(sql).includes('FROM businesses') && String(sql).includes('owner_user_id')) {
      return {
        rows: [{ id: businessId, name: 'Private Shop', currency: 'IDR', timezone: 'Asia/Jakarta', is_demo: false, ledger_revision: '0' }],
        rowCount: 1,
      };
    }
    throw new Error('database analytics query failed');
  });
  const app = createApp({ pool, authAdapter: () => ownerId });
  t.after(() => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/analytics/query',
    payload: { metric: 'revenue', dimension: 'date', product_ids: [] },
  });
  assert.equal(response.statusCode, 500);
  assert.equal(response.json().data, undefined);
  assert.equal(response.json().code, 'INTERNAL_ERROR');
});

test('login never creates an account and unknown credentials do not set a session', async (t) => {
  const statements = [];
  const pool = mockPool(async (sql) => {
    statements.push(String(sql));
    return { rows: [], rowCount: 0 };
  });
  const app = createApp({ pool });
  t.after(() => app.close());

  const unknown = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { merchant: 'account', username: 'missing-user', password: 'long-password-1' },
  });
  assert.equal(unknown.statusCode, 401);
  assert.equal(unknown.headers['set-cookie'], undefined);

  const attemptedProvision = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { merchant: 'new', username: 'new-user', email: 'new@example.test', password: 'long-password-1', business_name: 'New Shop', currency: 'IDR' },
  });
  assert.equal(attemptedProvision.statusCode, 422);
  assert.equal(attemptedProvision.headers['set-cookie'], undefined);
  assert.equal(statements.some((sql) => /INSERT INTO (users|businesses|auth_sessions)/i.test(sql)), false);
});

test('logout revokes session and clears cookie without throwing errors', async (t) => {
  const pool = mockPool(async (sql) => {
    if (String(sql).includes('FROM auth_sessions')) {
      return {
        rows: [{ user_id: 'user-1', business_id: 'biz-1', created_at: new Date(), expires_at: new Date(Date.now() + 10000) }],
        rowCount: 1,
      };
    }
    if (String(sql).includes('FROM businesses')) {
      return { rows: [{ id: 'biz-1', is_demo: true }], rowCount: 1 };
    }
    return { rows: [], rowCount: 1 };
  });
  const app = createApp({ pool });
  t.after(() => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/logout',
    headers: { cookie: 'easyledger_session=test-token' },
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.headers['set-cookie'], /easyledger_session=;/);
  assert.equal(response.json().data.message, 'Logged out successfully');
});
