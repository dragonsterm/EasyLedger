import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

import { SalesQueryService } from '../../packages/domain/voice.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const migration = await readFile(path.join(root, 'db/migrations/001_initial_schema.sql'), 'utf8');
const databaseUrl = process.env.EASYLEDGER_TEST_DATABASE_URL;

test('TASK-25-04 date analytics uses real coverage and tenant-filtered sales', { skip: !databaseUrl }, async (t) => {
  const schema = `day25_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Pool({ connectionString: databaseUrl, max: 2 });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 4, options: `-c search_path=${schema}` });
  t.after(async () => {
    await pool.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  });

  await pool.query(migration);
  const businessA = randomUUID();
  const businessB = randomUUID();
  const productA = randomUUID();
  const productB = randomUUID();
  await pool.query(
    `INSERT INTO businesses (id, owner_user_id, name, currency) VALUES
      ($1, 'owner-a', 'A', 'IDR'), ($2, 'owner-b', 'B', 'IDR')`,
    [businessA, businessB],
  );
  await pool.query(
    `INSERT INTO products (id, business_id, name) VALUES
      ($1, $2, 'A product'), ($3, $4, 'B product')`,
    [productA, businessA, productB, businessB],
  );
  for (const [businessId, productId, quantity, price, date, voided] of [
    [businessA, productA, 2, 100, '2026-09-16', false],
    [businessA, productA, 3, null, '2026-09-17', false],
    [businessA, productA, 1, 0, '2026-09-20', false],
    [businessA, productA, 7, 100, '2026-09-21', true],
    [businessB, productB, 99, 1000, '2026-09-18', false],
  ]) {
    await pool.query(
      `INSERT INTO sales (id, business_id, product_id, quantity, unit_price, sale_date, voided)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [randomUUID(), businessId, productId, quantity, price, date, voided],
    );
  }
  await pool.query(
    `INSERT INTO day_coverages (business_id, local_date, state) VALUES
      ($1, '2026-09-19', 'complete'), ($2, '2026-09-18', 'complete')`,
    [businessA, businessB],
  );

  const query = new SalesQueryService(pool);
  const result = await query.querySales({
    business_id: businessA,
    currency: 'IDR',
    ledger_revision: '7',
    metric: 'revenue',
    dimension: 'date',
    date_from: '2026-09-16',
    date_to: '2026-09-21',
    product_ids: [productA],
  });
  assert.equal(result.total, '200');
  assert.equal(result.has_unknown_prices, true);
  assert.equal(result.ledger_revision, '7');
  assert.deepEqual(result.rows.map(({ key, quantity, revenue, data_state, coverage_state }) => ({ key, quantity, revenue, data_state, coverage_state })), [
    { key: '2026-09-16', quantity: '2', revenue: '200', data_state: 'sales', coverage_state: 'open' },
    { key: '2026-09-17', quantity: '3', revenue: null, data_state: 'unknown-price', coverage_state: 'open' },
    { key: '2026-09-18', quantity: null, revenue: null, data_state: 'gap', coverage_state: 'open' },
    { key: '2026-09-19', quantity: '0', revenue: '0', data_state: 'confirmed-zero', coverage_state: 'complete' },
    { key: '2026-09-20', quantity: '1', revenue: '0', data_state: 'sales', coverage_state: 'open' },
    { key: '2026-09-21', quantity: null, revenue: null, data_state: 'gap', coverage_state: 'open' },
  ]);

  const filtered = await query.querySales({
    business_id: businessA,
    currency: 'IDR',
    ledger_revision: '7',
    metric: 'units',
    dimension: 'date',
    date_from: '2026-09-18',
    date_to: '2026-09-19',
    product_ids: [productB],
  });
  assert.equal(filtered.total, '0');
  assert.deepEqual(filtered.rows.map(({ data_state }) => data_state), ['gap', 'confirmed-zero']);
});
