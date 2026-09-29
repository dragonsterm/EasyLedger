import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import pg from 'pg';
import { createApp } from '../../apps/api/app.ts';
import { SessionAuthService } from '../../apps/api/sessionAuth.ts';
import { runDatabaseMigrations } from '../../scripts/migrate-db.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const databaseUrl = process.env.EASYLEDGER_TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const migrations = await Promise.all([
  '001_initial_schema.sql',
  '002_product_versions.sql',
  '003_voice_sessions.sql',
].map((name) => readFile(path.join(root, 'db/migrations', name), 'utf8')));
const demoSeed = await readFile(path.join(root, 'db/seed/001_demo_catalog.sql'), 'utf8');

function cookieFrom(response) {
  const value = response.headers['set-cookie'];
  assert.equal(typeof value, 'string');
  return value.split(';', 1)[0];
}

function appFor(pool) {
  return createApp({ pool, sessionAuth: new SessionAuthService(pool) });
}

test('account auth, durable sessions, tenant isolation, demo, and migration baselines', { skip: !databaseUrl }, async (t) => {
  const admin = new pg.Pool({ connectionString: databaseUrl, max: 2 });
  const schemaNames = [
    `auth_legacy_${randomUUID().replaceAll('-', '')}`,
    `auth_fresh_${randomUUID().replaceAll('-', '')}`,
    `auth_partial_${randomUUID().replaceAll('-', '')}`,
  ];
  const pools = [];
  const scopedPool = (schema) => {
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 8, options: `-c search_path=${schema}` });
    pools.push(pool);
    return pool;
  };

  t.after(async () => {
    for (const pool of pools) await pool.end();
    for (const schema of schemaNames) await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  });

  for (const schema of schemaNames) await admin.query(`CREATE SCHEMA ${schema}`);

  const legacyPool = scopedPool(schemaNames[0]);
  for (const migration of migrations) await legacyPool.query(migration);
  await legacyPool.query(demoSeed);
  // 001–003 exist without a ledger. The runner validates their tables,
  // columns, indexes, functions, and triggers before recording that baseline.
  await runDatabaseMigrations(legacyPool);

  let app = appFor(legacyPool);
  await app.ready();
  const firstRegistration = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/signup',
    payload: {
      username: 'first_merchant',
      email: 'first@example.test',
      password: 'first-account-password',
      business_name: 'First Private Shop',
      currency: 'USD',
    },
  });
  assert.equal(firstRegistration.statusCode, 201);
  assert.equal(firstRegistration.json().data.business.is_demo, false);
  assert.equal(firstRegistration.json().data.business.currency, 'USD');
  assert.equal(firstRegistration.json().data.token, undefined, 'raw session token is only sent as an HttpOnly cookie');
  const firstCookie = cookieFrom(firstRegistration);
  const firstBusinessId = firstRegistration.json().data.business.id;

  const duplicate = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/signup',
    payload: {
      username: 'first_merchant',
      email: 'duplicate@example.test',
      password: 'first-account-password',
      business_name: 'Duplicate Shop',
      currency: 'IDR',
    },
  });
  assert.equal(duplicate.statusCode, 409);
  assert.equal(duplicate.headers['set-cookie'], undefined);

  const wrongPassword = await app.inject({
    method: 'POST', url: '/api/v1/auth/login',
    payload: { merchant: 'account', username: 'first_merchant', password: 'wrong-password' },
  });
  assert.equal(wrongPassword.statusCode, 401);
  assert.equal(wrongPassword.headers['set-cookie'], undefined);
  const unknownAccount = await app.inject({
    method: 'POST', url: '/api/v1/auth/login',
    payload: { merchant: 'account', username: 'not-registered', password: 'wrong-password' },
  });
  assert.equal(unknownAccount.statusCode, 401);
  assert.equal(unknownAccount.headers['set-cookie'], undefined);

  const [initialProducts, initialSales, initialDashboards, analytics] = await Promise.all([
    app.inject({ method: 'GET', url: '/api/v1/products', headers: { cookie: firstCookie } }),
    app.inject({ method: 'GET', url: '/api/v1/sales?page_size=100&include_voided=false', headers: { cookie: firstCookie } }),
    app.inject({ method: 'GET', url: '/api/v1/dashboards', headers: { cookie: firstCookie } }),
    app.inject({ method: 'POST', url: '/api/v1/analytics/query', headers: { cookie: firstCookie }, payload: { metric: 'revenue', dimension: 'none', product_ids: [] } }),
  ]);
  assert.equal(initialProducts.statusCode, 200);
  assert.deepEqual(initialProducts.json().data.products, []);
  assert.deepEqual(initialSales.json().data.items, []);
  assert.deepEqual(initialDashboards.json().data.dashboards, []);
  assert.equal(analytics.statusCode, 200);
  assert.equal(analytics.json().data.total, '0.00');
  assert.deepEqual(analytics.json().data.rows, [{
    key: 'total', label: 'Total', quantity: '0', revenue: '0', data_state: 'no-sales',
  }]);
  assert.equal(analytics.json().data.ledger_revision, '0');

  const savedDashboard = await app.inject({
    method: 'POST',
    url: '/api/v1/dashboards',
    headers: { cookie: firstCookie },
    payload: {
      name: 'Saved account overview',
      widgets: [{ id: 'total-revenue', type: 'kpi', title: 'Total revenue', metric: 'revenue', dimension: 'none', style: 'warm' }],
      layout: [{ i: 'total-revenue', x: 0, y: 0, w: 4, h: 5 }],
      schema_version: 1,
    },
  });
  assert.equal(savedDashboard.statusCode, 201);
  const savedDashboardId = savedDashboard.json().data.id;
  assert.equal(savedDashboard.json().data.version, '1');
  const updatedDashboard = await app.inject({
    method: 'PUT',
    url: `/api/v1/dashboards/${savedDashboardId}`,
    headers: { cookie: firstCookie },
    payload: {
      name: 'Saved account overview',
      expected_version: '1',
      widgets: [
        { id: 'total-revenue', type: 'kpi', title: 'Revenue summary', metric: 'revenue', dimension: 'none', style: 'warm' },
        { id: 'complete-days', type: 'kpi', title: 'Day coverage', metric: 'units', dimension: 'date', format: 'coverage', style: 'sage' },
      ],
      layout: [
        { i: 'total-revenue', x: 0, y: 0, w: 4, h: 5 },
        { i: 'complete-days', x: 4, y: 0, w: 4, h: 5 },
      ],
      schema_version: 1,
    },
  });
  assert.equal(updatedDashboard.statusCode, 200);
  assert.equal(updatedDashboard.json().data.version, '2');
  const staleSave = await app.inject({
    method: 'PUT',
    url: `/api/v1/dashboards/${savedDashboardId}`,
    headers: { cookie: firstCookie },
    payload: { name: 'Lost update', expected_version: '1', widgets: [], layout: [] },
  });
  assert.equal(staleSave.statusCode, 409);
  assert.equal(staleSave.json().current_version, '2');

  const secondRegistration = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/signup',
    payload: {
      username: 'second_merchant',
      email: 'second@example.test',
      password: 'second-account-password',
      business_name: 'Second Private Shop',
      currency: 'IDR',
    },
  });
  assert.equal(secondRegistration.statusCode, 201);
  const secondCookie = cookieFrom(secondRegistration);
  const secondBusinessId = secondRegistration.json().data.business.id;
  assert.notEqual(secondBusinessId, firstBusinessId);

  const createdProduct = await app.inject({
    method: 'POST',
    url: '/api/v1/products',
    headers: { cookie: firstCookie, 'idempotency-key': 'first-private-product' },
    payload: { name: 'First Shop Product', default_unit_price: '1200' },
  });
  assert.equal(createdProduct.statusCode, 201);
  const firstProducts = await app.inject({ method: 'GET', url: '/api/v1/products', headers: { cookie: firstCookie } });
  const secondProducts = await app.inject({ method: 'GET', url: '/api/v1/products', headers: { cookie: secondCookie } });
  const secondDashboards = await app.inject({ method: 'GET', url: '/api/v1/dashboards', headers: { cookie: secondCookie } });
  assert.equal(firstProducts.json().data.products.length, 1);
  assert.deepEqual(secondProducts.json().data.products, []);
  assert.deepEqual(secondDashboards.json().data.dashboards, []);
  const crossTenantDashboard = await app.inject({ method: 'GET', url: `/api/v1/dashboards/${savedDashboardId}`, headers: { cookie: secondCookie } });
  assert.equal(crossTenantDashboard.statusCode, 404);

  await app.close();
  // A new API instance can restore the session from PostgreSQL after restart.
  app = appFor(legacyPool);
  await app.ready();
  const restored = await app.inject({ method: 'GET', url: '/api/v1/auth/session', headers: { cookie: firstCookie } });
  assert.equal(restored.statusCode, 200);
  assert.equal(restored.json().data.authenticated, true);
  assert.equal(restored.json().data.business.id, firstBusinessId);
  const restoredDashboard = await app.inject({ method: 'GET', url: `/api/v1/dashboards/${savedDashboardId}`, headers: { cookie: firstCookie } });
  assert.equal(restoredDashboard.statusCode, 200);
  assert.equal(restoredDashboard.json().data.version, '2');
  assert.deepEqual(restoredDashboard.json().data.widgets.map((widget) => widget.style), ['warm', 'sage']);

  const logout = await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { cookie: firstCookie } });
  assert.equal(logout.statusCode, 200);
  const afterLogout = await app.inject({ method: 'GET', url: '/api/v1/auth/session', headers: { cookie: firstCookie } });
  assert.equal(afterLogout.json().data.authenticated, false);
  await app.close();

  app = appFor(legacyPool);
  await app.ready();
  const demoLogin = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { merchant: 'demo' } });
  assert.equal(demoLogin.statusCode, 200);
  assert.equal(demoLogin.json().data.business.currency, 'IDR');
  assert.equal(demoLogin.json().data.business.is_demo, true);
  const demoCookie = cookieFrom(demoLogin);
  const demoProducts = await app.inject({ method: 'GET', url: '/api/v1/products', headers: { cookie: demoCookie } });
  const demoSales = await app.inject({ method: 'GET', url: '/api/v1/sales', headers: { cookie: demoCookie } });
  assert.equal(demoProducts.json().data.products.length, 2);
  assert.deepEqual(demoSales.json().data.items, []);
  await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { cookie: demoCookie } });
  await app.close();

  const freshPool = scopedPool(schemaNames[1]);
  await runDatabaseMigrations(freshPool);
  const freshVersions = await freshPool.query('SELECT version FROM _schema_migrations ORDER BY version');
  assert.equal(freshVersions.rowCount, 5);
  const freshDemo = await freshPool.query('SELECT currency, is_demo FROM businesses WHERE is_demo = TRUE');
  assert.equal(freshDemo.rows[0].currency, 'IDR');

  const partialPool = scopedPool(schemaNames[2]);
  await partialPool.query('CREATE TABLE businesses (id UUID PRIMARY KEY)');
  await assert.rejects(() => runDatabaseMigrations(partialPool), /Untracked EasyLedger schema is incomplete/);
  const partialTracker = await partialPool.query("SELECT to_regclass(current_schema() || '._schema_migrations') AS tracker");
  assert.equal(partialTracker.rows[0].tracker, null, 'failed baseline check rolled back its tracker table');
});
