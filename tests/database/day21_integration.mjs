import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import pg from 'pg';

import { OperationError, OperationService } from '../../packages/domain/mutations.ts';

const databaseUrl = process.env.EASYLEDGER_TEST_DATABASE_URL;
const run = databaseUrl ? test : test.skip;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const migration = await readFile(path.join(root, 'db/migrations/001_initial_schema.sql'), 'utf8');
const seed = await readFile(path.join(root, 'db/seed/001_demo_catalog.sql'), 'utf8');

run('Day 21 PostgreSQL transactions, retries, corrections, undo, and coverage are atomic', async (t) => {
  const schema = `day21_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Pool({ connectionString: databaseUrl, max: 2 });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 25, options: `-c search_path=${schema}` });
  t.after(async () => {
    await pool.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  });
  await pool.query(migration);
  await pool.query(seed);

  const service = new OperationService(pool);
  const businessId = '00000000-0000-4000-8000-000000000001';
  const orangeId = '00000000-0000-4000-8000-000000000011';
  const mangoId = '00000000-0000-4000-8000-000000000012';
  const actor = '00000000-0000-4000-8000-000000000101';
  const saleDate = '2026-09-21';
  const movedDate = '2026-09-22';

  await pool.query(
    `INSERT INTO day_coverages (business_id, local_date, state) VALUES ($1, $2, 'complete')`,
    [businessId, saleDate],
  );
  const golden = {
    business_id: businessId,
    actor_user_id: actor,
    idempotency_key: 'day21-golden-concurrent',
    lines: [
      { product_id: orangeId, quantity: 10, unit_price: 15_000, sale_date: saleDate },
      { product_id: mangoId, quantity: 6, unit_price: 18_000, sale_date: saleDate },
    ],
  };

  const concurrent = await Promise.all(Array.from({ length: 20 }, () => service.commitSales(golden)));
  for (const receipt of concurrent) assert.deepEqual(receipt, concurrent[0]);
  assert.equal(concurrent[0].totals.known_revenue, '258000');
  assert.equal(concurrent[0].ledger_revision, '1');
  assert.equal(concurrent[0].sales.length, 2);

  const afterRace = await pool.query(
    `SELECT
       (SELECT count(*)::int FROM operations) AS operations,
       (SELECT count(*)::int FROM sales) AS sales,
       (SELECT count(*)::int FROM sale_revisions) AS revisions,
       (SELECT ledger_revision::text FROM businesses WHERE id = $1) AS ledger_revision,
       (SELECT state FROM day_coverages WHERE business_id = $1 AND local_date = $2) AS coverage,
       (SELECT count(*)::int FROM coverage_revisions) AS coverage_revisions`,
    [businessId, saleDate],
  );
  assert.deepEqual(afterRace.rows[0], {
    operations: 1, sales: 2, revisions: 2, ledger_revision: '1', coverage: 'open', coverage_revisions: 1,
  });
  assert.deepEqual(await service.commitSales(golden), concurrent[0]);
  await assert.rejects(
    service.commitSales({ ...golden, lines: [{ ...golden.lines[0], quantity: 9 }] }),
    (error) => error instanceof OperationError && error.code === 'IDEMPOTENCY_CONFLICT' && error.httpStatus === 409,
  );

  const beforeInvalid = (await pool.query(
    `SELECT (SELECT count(*)::int FROM operations) AS operations,
            (SELECT count(*)::int FROM sales) AS sales,
            (SELECT count(*)::int FROM sale_revisions) AS revisions,
            (SELECT ledger_revision::text FROM businesses WHERE id = $1) AS ledger_revision`,
    [businessId],
  )).rows[0];
  await pool.query(
    `UPDATE day_coverages SET state = 'complete' WHERE business_id = $1 AND local_date = $2`,
    [businessId, saleDate],
  );
  await assert.rejects(
    service.commitSales({
      ...golden,
      idempotency_key: 'day21-invalid-atomic',
      lines: [golden.lines[0], {
        product_id: '99999999-9999-4999-8999-999999999999', quantity: 1, unit_price: 1, sale_date: saleDate,
      }],
    }),
    (error) => error instanceof OperationError && error.code === 'CONFLICT',
  );
  const afterInvalid = (await pool.query(
    `SELECT (SELECT count(*)::int FROM operations) AS operations,
            (SELECT count(*)::int FROM sales) AS sales,
            (SELECT count(*)::int FROM sale_revisions) AS revisions,
            (SELECT ledger_revision::text FROM businesses WHERE id = $1) AS ledger_revision,
            (SELECT state FROM day_coverages WHERE business_id = $1 AND local_date = $2) AS coverage`,
    [businessId, saleDate],
  )).rows[0];
  assert.deepEqual(afterInvalid, { ...beforeInvalid, coverage: 'complete' });

  await pool.query(
    `INSERT INTO day_coverages (business_id, local_date, state) VALUES ($1, $2, 'complete')`,
    [businessId, movedDate],
  );
  const orangeSale = concurrent[0].sales.find((sale) => sale.product_id === orangeId);
  const correction = await service.correctSale({
    business_id: businessId,
    actor_user_id: actor,
    idempotency_key: 'day21-correct-orange',
    sale_id: orangeSale.sale_id,
    expected_version: 1,
    changes: { quantity: 8, sale_date: movedDate },
    reason: 'Customer corrected orange quantity and date',
  });
  assert.equal(correction.sales[0].sale_id, orangeSale.sale_id);
  assert.equal(correction.sales[0].quantity, '8');
  assert.equal(correction.sales[0].version, '2');
  assert.equal(correction.ledger_revision, '2');
  assert.deepEqual(await service.correctSale({
    business_id: businessId,
    actor_user_id: actor,
    idempotency_key: 'day21-correct-orange',
    sale_id: orangeSale.sale_id,
    expected_version: 1,
    changes: { quantity: 8, sale_date: movedDate },
    reason: 'Customer corrected orange quantity and date',
  }), correction);
  assert.equal((await pool.query(
    `SELECT sum(quantity::bigint * unit_price)::text AS total
       FROM sales WHERE business_id = $1 AND NOT voided AND unit_price IS NOT NULL`,
    [businessId],
  )).rows[0].total, '228000');
  assert.deepEqual((await pool.query(
    `SELECT local_date::text, state FROM day_coverages WHERE business_id = $1 ORDER BY local_date`,
    [businessId],
  )).rows, [
    { local_date: saleDate, state: 'open' },
    { local_date: movedDate, state: 'open' },
  ]);

  await assert.rejects(
    service.correctSale({
      business_id: businessId, actor_user_id: actor, idempotency_key: 'day21-stale-correction',
      sale_id: orangeSale.sale_id, expected_version: 1, changes: { quantity: 7 }, reason: 'stale edit',
    }),
    (error) => error instanceof OperationError && error.code === 'CONFLICT' && error.currentVersion === '2',
  );
  assert.equal((await pool.query(
    `SELECT count(*)::int AS count FROM operations WHERE idempotency_key = 'day21-stale-correction'`,
  )).rows[0].count, 0);

  await pool.query(
    `UPDATE day_coverages SET state = 'complete'
      WHERE business_id = $1 AND local_date = ANY($2::date[])`,
    [businessId, [saleDate, movedDate]],
  );
  const undoneCorrection = await service.undoOperation({
    business_id: businessId,
    actor_user_id: actor,
    idempotency_key: 'day21-undo-correction',
    operation_id: correction.operation_id,
    expected_versions: [{ sale_id: orangeSale.sale_id, version: 2 }],
  });
  assert.equal(undoneCorrection.sales[0].quantity, '10');
  assert.equal(undoneCorrection.sales[0].sale_date, saleDate);
  assert.equal(undoneCorrection.sales[0].version, '3');
  assert.equal(undoneCorrection.ledger_revision, '3');
  assert.deepEqual(await service.undoOperation({
    business_id: businessId,
    actor_user_id: actor,
    idempotency_key: 'day21-undo-correction',
    operation_id: correction.operation_id,
    expected_versions: [{ sale_id: orangeSale.sale_id, version: 2 }],
  }), undoneCorrection);
  await assert.rejects(
    service.undoOperation({
      business_id: businessId,
      actor_user_id: actor,
      idempotency_key: 'day21-duplicate-undo',
      operation_id: correction.operation_id,
      expected_versions: [{ sale_id: orangeSale.sale_id, version: 3 }],
    }),
    (error) => error instanceof OperationError && error.code === 'CONFLICT',
  );

  const correctionTwo = await service.correctSale({
    business_id: businessId, actor_user_id: actor, idempotency_key: 'day21-correct-again',
    sale_id: orangeSale.sale_id, expected_version: 3, changes: { quantity: 9 }, reason: 'second correction',
  });
  const correctionThree = await service.correctSale({
    business_id: businessId, actor_user_id: actor, idempotency_key: 'day21-intervening-edit',
    sale_id: orangeSale.sale_id, expected_version: 4, changes: { quantity: 7 }, reason: 'intervening edit',
  });
  await assert.rejects(
    service.undoOperation({
      business_id: businessId, actor_user_id: actor, idempotency_key: 'day21-blocked-undo',
      operation_id: correctionTwo.operation_id,
      expected_versions: [{ sale_id: orangeSale.sale_id, version: 5 }],
    }),
    (error) => error instanceof OperationError && error.code === 'CONFLICT',
  );
  assert.equal(correctionThree.sales[0].quantity, '7');
  assert.equal((await pool.query(
    `SELECT count(*)::int AS count FROM operations WHERE idempotency_key = 'day21-blocked-undo'`,
  )).rows[0].count, 0);

  const nullableBatch = await service.commitSales({
    business_id: businessId,
    actor_user_id: actor,
    idempotency_key: 'day21-null-zero',
    lines: [
      { product_id: orangeId, quantity: 1, unit_price: null, sale_date: saleDate },
      { product_id: mangoId, quantity: 1, unit_price: 0, sale_date: saleDate },
    ],
  });
  assert.deepEqual(nullableBatch.totals, { known_revenue: '0', unknown_price_count: 1, complete: false });
  const undoneBatch = await service.undoOperation({
    business_id: businessId,
    actor_user_id: actor,
    idempotency_key: 'day21-undo-created-batch',
    operation_id: nullableBatch.operation_id,
    expected_versions: nullableBatch.sales.map((sale) => ({ sale_id: sale.sale_id, version: sale.version })),
  });
  assert(undoneBatch.sales.every((sale) => sale.voided && sale.version === '2'));

  assert.deepEqual((await pool.query(
    `SELECT (SELECT count(*)::int FROM operations WHERE status = 'committed') AS operations,
            (SELECT count(*)::int FROM sale_revisions) AS revisions,
            (SELECT count(*)::int FROM sales WHERE voided) AS voided_sales,
            (SELECT ledger_revision::text FROM businesses WHERE id = $1) AS ledger_revision`,
    [businessId],
  )).rows[0], { operations: 7, revisions: 10, voided_sales: 2, ledger_revision: '7' });
});
