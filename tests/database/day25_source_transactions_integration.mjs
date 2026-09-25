import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

import { createApp } from '../../apps/api/app.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const migration = await readFile(path.join(root, 'db/migrations/001_initial_schema.sql'), 'utf8');
const databaseUrl = process.env.EASYLEDGER_TEST_DATABASE_URL;

test('TASK-25-05 authenticated source transaction drilldown is snapshot-consistent, filtered, tenant-scoped, and paginated', { skip: !databaseUrl }, async (t) => {
  const schema = `day25_source_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Pool({ connectionString: databaseUrl, max: 2 });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 4, options: `-c search_path=${schema}` });
  let activeOwner = 'owner-a';
  const app = createApp({ pool, authAdapter: () => ({ userId: activeOwner }) });
  t.after(async () => {
    await app.close();
    await pool.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  });

  await pool.query(migration);
  const businessA = randomUUID();
  const businessB = randomUUID();
  const coffeeA = randomUUID();
  const teaA = randomUUID();
  const coffeeB = randomUUID();
  const saleOne = '00000000-0000-4000-8000-000000000031';
  const saleTwo = '00000000-0000-4000-8000-000000000032';
  const saleVoid = '00000000-0000-4000-8000-000000000033';
  const saleTea = '00000000-0000-4000-8000-000000000034';
  const saleOtherBusiness = '00000000-0000-4000-8000-000000000035';
  await pool.query(
    `INSERT INTO businesses (id, owner_user_id, name, currency, ledger_revision) VALUES
      ($1, 'owner-a', 'A', 'IDR', 5), ($2, 'owner-b', 'B', 'USD', 5)`,
    [businessA, businessB],
  );
  await pool.query(
    `INSERT INTO products (id, business_id, name) VALUES
      ($1, $2, 'Coffee'), ($3, $2, 'Tea'), ($4, $5, 'Coffee')`,
    [coffeeA, businessA, teaA, coffeeB, businessB],
  );
  await pool.query(
    `INSERT INTO sales (id, business_id, product_id, quantity, unit_price, sale_date, voided) VALUES
      ($1, $2, $3, 2, 125, '2026-09-16', FALSE),
      ($4, $2, $3, 3, NULL, '2026-09-16', FALSE),
      ($5, $2, $3, 4, 999, '2026-09-16', TRUE),
      ($6, $2, $7, 8, 200, '2026-09-16', FALSE),
      ($8, $9, $10, 99, 1000, '2026-09-16', FALSE)`,
    [saleOne, businessA, coffeeA, saleTwo, saleVoid, saleTea, teaA, saleOtherBusiness, businessB, coffeeB],
  );

  const dateRequest = {
    dimension: 'date',
    datum_key: '2026-09-16',
    ledger_revision: '5',
    date_from: '2026-09-16',
    date_to: '2026-09-17',
    product_ids: [coffeeA],
    page_size: 1,
  };
  const firstPage = await app.inject({ method: 'POST', url: '/api/v1/analytics/source-transactions', payload: dateRequest });
  assert.equal(firstPage.statusCode, 200);
  const firstData = firstPage.json().data;
  assert.equal(firstData.ledger_revision, '5');
  assert.equal(firstData.items.length, 1);
  assert.deepEqual(firstData.items.map(({ id, line_revenue, version }) => ({ id, line_revenue, version })), [
    { id: saleOne, line_revenue: '250', version: '1' },
  ]);
  assert.equal(firstData.has_more, true);
  assert.ok(firstData.next_cursor);

  const secondPage = await app.inject({
    method: 'POST',
    url: '/api/v1/analytics/source-transactions',
    payload: { ...dateRequest, cursor: firstData.next_cursor },
  });
  assert.equal(secondPage.statusCode, 200);
  assert.deepEqual(secondPage.json().data.items.map(({ id, line_revenue }) => ({ id, line_revenue })), [
    { id: saleTwo, line_revenue: null },
  ]);
  assert.equal(secondPage.json().data.has_more, false);

  const productBar = await app.inject({
    method: 'POST',
    url: '/api/v1/analytics/source-transactions',
    payload: {
      dimension: 'product', datum_key: coffeeA, ledger_revision: '5',
      date_from: '2026-09-16', date_to: '2026-09-17', product_ids: [], page_size: 10,
    },
  });
  assert.equal(productBar.statusCode, 200);
  assert.deepEqual(productBar.json().data.items.map(({ id }) => id), [saleOne, saleTwo]);

  activeOwner = 'owner-b';
  const otherOwner = await app.inject({
    method: 'POST',
    url: '/api/v1/analytics/source-transactions',
    payload: {
      dimension: 'product', datum_key: coffeeA, ledger_revision: '5',
      date_from: '2026-09-16', date_to: '2026-09-17', product_ids: [], page_size: 10,
    },
  });
  assert.equal(otherOwner.statusCode, 200);
  assert.deepEqual(otherOwner.json().data.items, []);
  assert.equal(otherOwner.json().data.currency, 'USD');

  activeOwner = 'owner-a';
  await pool.query('UPDATE businesses SET ledger_revision = 6 WHERE id = $1', [businessA]);
  const stale = await app.inject({ method: 'POST', url: '/api/v1/analytics/source-transactions', payload: dateRequest });
  assert.equal(stale.statusCode, 409);
  assert.equal(stale.json().code, 'STALE_QUERY');
  assert.equal(stale.json().current_version, '6');
  assert.match(stale.json().message, /Refresh the chart/);

  const malformed = await app.inject({
    method: 'POST', url: '/api/v1/analytics/source-transactions',
    payload: { ...dateRequest, datum_key: 'not-a-date' },
  });
  assert.equal(malformed.statusCode, 422);
  assert.equal(malformed.json().code, 'VALIDATION_ERROR');
});
