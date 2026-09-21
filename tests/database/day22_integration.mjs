import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import pg from 'pg';

import { createApp } from '../../apps/api/app.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const migration = await readFile(path.join(root, 'db/migrations/001_initial_schema.sql'), 'utf8');
const productVersions = await readFile(path.join(root, 'db/migrations/002_product_versions.sql'), 'utf8');
const seed = await readFile(path.join(root, 'db/seed/001_demo_catalog.sql'), 'utf8');
const databaseUrl = process.env.EASYLEDGER_TEST_DATABASE_URL;

test('Day 22 API enforces tenant isolation, catalog versions, idempotency, and coverage semantics', { skip: !databaseUrl }, async (t) => {
  const schema = `day22_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Pool({ connectionString: databaseUrl, max: 2 });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 12, options: `-c search_path=${schema}` });
  const userA = '00000000-0000-4000-8000-000000000101';
  const userB = '00000000-0000-4000-8000-000000000102';
  const businessA = '00000000-0000-4000-8000-000000000001';
  const businessB = '00000000-0000-4000-8000-000000000002';
  const productA = '00000000-0000-4000-8000-000000000011';
  const productB = '00000000-0000-4000-8000-000000000021';
  const catalogSaleDate = '2026-09-24';
  const saleDate = '2026-09-25';

  t.after(async () => {
    await pool.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  });

  await pool.query(migration);
  await pool.query(productVersions);
  await pool.query(seed);
  await pool.query(
    `INSERT INTO businesses (id, owner_user_id, name, currency, timezone)
     VALUES ($1, $2, 'Second business', 'USD', 'Asia/Jakarta')`,
    [businessB, userB],
  );
  await pool.query(
    `INSERT INTO products (id, business_id, name, default_unit_price)
     VALUES ($1, $2, 'Tenant B Product', 250)`,
    [productB, businessB],
  );

  let activeUser = null;
  const app = createApp({
    pool,
    authAdapter: () => (activeUser ? { userId: activeUser } : null),
  });
  await app.ready();
  t.after(() => app.close());

  async function request(method, url, payload, key) {
    const headers = {};
    if (key) headers['idempotency-key'] = key;
    const response = await app.inject({ method, url, payload, headers });
    return { status: response.statusCode, body: response.json() };
  }

  let result = await request('GET', '/api/v1/products');
  assert.equal(result.status, 401);

  activeUser = userA;
  result = await request('POST', '/api/v1/products', { name: 'API Product', default_unit_price: '1234', business_id: businessB }, 'catalog-extra');
  assert.equal(result.status, 422);

  result = await request('POST', '/api/v1/products', { name: 'API Product', default_unit_price: '1234' }, 'catalog-create');
  assert.equal(result.status, 201);
  const apiProduct = result.body.data;
  assert.equal(apiProduct.version, '1');
  assert.equal(apiProduct.default_unit_price, '1234');
  const cachedProduct = await request('POST', '/api/v1/products', { name: 'API Product', default_unit_price: '1234' }, 'catalog-create');
  assert.deepEqual(cachedProduct.body.data, apiProduct);
  result = await request('POST', '/api/v1/products', { name: 'Different', default_unit_price: '1234' }, 'catalog-create');
  assert.equal(result.status, 409);

  result = await request('POST', '/api/v1/products', { name: '  api   product  ', default_unit_price: null }, 'catalog-duplicate-name');
  assert.equal(result.status, 409);
  result = await request('PATCH', `/api/v1/products/${apiProduct.id}`, {
    expected_version: '1',
    changes: { name: 'Renamed API Product', default_unit_price: '4321' },
  }, 'catalog-update');
  assert.equal(result.status, 200);
  assert.equal(result.body.data.name, 'Renamed API Product');
  assert.equal(result.body.data.default_unit_price, '4321');
  assert.equal(result.body.data.version, '2');
  result = await request('PATCH', `/api/v1/products/${apiProduct.id}`, { expected_version: '1', active: false }, 'catalog-stale');
  assert.equal(result.status, 409);
  assert.equal(result.body.current_version, '2');

  result = await request('POST', '/api/v1/sales', {
    lines: [{ product_id: apiProduct.id, quantity: '1', unit_price: '1234', sale_date: catalogSaleDate }],
  }, 'catalog-history-sale');
  assert.equal(result.status, 201);

  result = await request('PATCH', `/api/v1/products/${apiProduct.id}`, { expected_version: '2', active: false }, 'catalog-deactivate');
  assert.equal(result.status, 200);
  assert.equal(result.body.data.active, false);
  assert.equal(result.body.data.version, '3');

  result = await request('POST', '/api/v1/sales', {
    lines: [{ product_id: apiProduct.id, quantity: '1', unit_price: '0', sale_date: saleDate }],
  }, 'deactivated-sale');
  assert.equal(result.status, 409);
  result = await request('POST', '/api/v1/sales', {
    lines: [{ product_id: productB, quantity: '1', unit_price: '250', sale_date: saleDate }],
  }, 'cross-tenant-sale');
  assert.equal(result.status, 404);

  result = await request('POST', '/api/v1/sales', {
    lines: [
      { product_id: productA, quantity: '2', unit_price: null, sale_date: saleDate },
      { product_id: productA, quantity: '3', unit_price: '0', sale_date: saleDate },
    ],
  }, 'sales-create');
  assert.equal(result.status, 201);
  const saleIds = result.body.data.affected_sale_ids;
  assert.equal(result.body.data.totals.unknown_price_count, 1);
  const cachedSales = await request('POST', '/api/v1/sales', {
    lines: [
      { product_id: productA, quantity: '2', unit_price: null, sale_date: saleDate },
      { product_id: productA, quantity: '3', unit_price: '0', sale_date: saleDate },
    ],
  }, 'sales-create');
  assert.deepEqual(cachedSales.body.data, result.body.data);
  result = await request('POST', '/api/v1/sales', {
    lines: [{ product_id: productA, quantity: '1', unit_price: '1', sale_date: saleDate }],
  }, 'sales-create');
  assert.equal(result.status, 409);

  result = await request('PUT', `/api/v1/sales/${saleIds[0]}`, {
    expected_version: '1', changes: { quantity: '4' }, reason: 'manual correction',
  }, 'sale-correction');
  assert.equal(result.status, 200);
  assert.equal(result.body.data.sales[0].quantity, '4');
  assert.equal(result.body.data.sales[0].version, '2');
  result = await request('PUT', `/api/v1/sales/${saleIds[0]}`, {
    expected_version: '1', changes: { quantity: '5' }, reason: 'stale correction',
  }, 'sale-correction-stale');
  assert.equal(result.status, 409);
  assert.equal(result.body.current_version, '2');

  result = await request('GET', `/api/v1/sales?product_id=${productB}`);
  assert.equal(result.status, 404);
  result = await request('GET', `/api/v1/sales?date_from=${saleDate}&date_to=${saleDate}`);
  assert.equal(result.status, 200);
  assert.equal(result.body.status, 'ok');
  assert.equal(result.body.data.items.length, 2);
  result = await request('GET', '/api/v1/sales?date_from=2025-01-01&date_to=2026-01-02');
  assert.equal(result.status, 422);
  result = await request('GET', '/api/v1/sales?page_size=1');
  assert.equal(result.status, 200);
  assert.equal(result.body.data.items.length, 1);
  assert.equal(result.body.data.has_more, true);
  const next = result.body.data.next_cursor;
  result = await request('GET', `/api/v1/sales?page_size=10&cursor=${encodeURIComponent(next)}`);
  assert.equal(result.status, 200);
  assert.equal(result.body.data.items.length, 2);
  const listed = [...(await request('GET', '/api/v1/sales?page_size=10')).body.data.items].sort((a, b) => a.id.localeCompare(b.id));
  assert.equal(listed.find((sale) => sale.id === saleIds[0]).line_revenue, null);
  assert.equal(listed.find((sale) => sale.id === saleIds[1]).line_revenue, '0');
  const historicalCatalogSale = listed.find((sale) => sale.product_id === apiProduct.id);
  assert.equal(historicalCatalogSale.product_name, 'Renamed API Product');
  assert.equal(historicalCatalogSale.unit_price, '1234');

  activeUser = userB;
  result = await request('GET', `/api/v1/products/${productA}`);
  assert.equal(result.status, 404);
  result = await request('PATCH', `/api/v1/products/${productA}`, { expected_version: '1', active: false }, 'cross-tenant-patch');
  assert.equal(result.status, 404);
  result = await request('PUT', `/api/v1/sales/${saleIds[0]}`, { expected_version: '1', changes: { quantity: '4' }, reason: 'cross tenant' }, 'cross-tenant-correction');
  assert.equal(result.status, 404);

  activeUser = userA;
  const zeroDate = '2026-10-01';
  result = await request('POST', `/api/v1/days/${zeroDate}/coverage`, { state: 'complete', expected_version: '0' }, 'coverage-complete');
  assert.equal(result.status, 200);
  assert.equal(result.body.data.confirmed_zero, true);

  activeUser = userB;
  result = await request('POST', `/api/v1/days/${zeroDate}/coverage`, { state: 'complete', expected_version: '0' }, 'tenant-b-coverage');
  assert.equal(result.status, 200);
  const isolatedCoverage = await pool.query(
    `SELECT business_id::text, state FROM day_coverages WHERE local_date = $1 ORDER BY business_id`,
    [zeroDate],
  );
  assert.deepEqual(isolatedCoverage.rows, [
    { business_id: businessA, state: 'complete' },
    { business_id: businessB, state: 'complete' },
  ]);

  activeUser = userA;
  const cachedCoverage = await request('POST', `/api/v1/days/${zeroDate}/coverage`, { state: 'complete', expected_version: '0' }, 'coverage-complete');
  assert.deepEqual(cachedCoverage.body.data, result.body.data);
  result = await request('POST', `/api/v1/days/${zeroDate}/coverage`, { state: 'complete', expected_version: '1' }, 'coverage-noop');
  assert.equal(result.status, 409);
  result = await request('POST', `/api/v1/days/${zeroDate}/coverage`, { state: 'open', expected_version: '1' }, 'coverage-open');
  assert.equal(result.status, 200);
  assert.equal(result.body.data.confirmed_zero, false);

  const reopenDate = '2026-10-02';
  await request('POST', `/api/v1/days/${reopenDate}/coverage`, { state: 'complete', expected_version: '0' }, 'coverage-reopen-complete');
  result = await request('POST', '/api/v1/sales', {
    lines: [{ product_id: productA, quantity: '1', unit_price: '15000', sale_date: reopenDate }],
  }, 'reopen-sale');
  assert.equal(result.status, 201);
  const coverageRow = await pool.query(
    `SELECT state, version::text AS version FROM day_coverages WHERE business_id = $1 AND local_date = $2`,
    [businessA, reopenDate],
  );
  assert.deepEqual(coverageRow.rows[0], { state: 'open', version: '2' });
  const revisionCount = await pool.query(
    `SELECT count(*)::int AS count FROM coverage_revisions WHERE business_id = $1 AND local_date = $2`,
    [businessA, reopenDate],
  );
  assert.equal(revisionCount.rows[0].count, 2);
});
