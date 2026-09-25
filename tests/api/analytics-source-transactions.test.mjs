import test from 'node:test';
import assert from 'node:assert/strict';

import { createApp } from '../../apps/api/app.ts';

const ownerA = '00000000-0000-4000-8000-000000000101';
const ownerB = '00000000-0000-4000-8000-000000000102';
const businessA = '00000000-0000-4000-8000-000000000001';
const businessB = '00000000-0000-4000-8000-000000000002';
const productA = '00000000-0000-4000-8000-000000000011';
const productB = '00000000-0000-4000-8000-000000000012';
const saleA = '00000000-0000-4000-8000-000000000021';
const saleB = '00000000-0000-4000-8000-000000000022';

function sourceRow(id, unitPrice) {
  return {
    id,
    product_id: productA,
    product_name: 'Coffee',
    quantity: '3',
    unit_price: unitPrice,
    sale_date: '2026-09-17',
    version: '2',
  };
}

function sourceApp({ currentUser = ownerA, revision = '7' } = {}) {
  const captures = [];
  const pool = {
    async query(_sql, values) {
      const row = values[0] === ownerA
        ? { id: businessA, currency: 'IDR', ledger_revision: revision }
        : { id: businessB, currency: 'USD', ledger_revision: revision };
      return { rows: [row], rowCount: 1 };
    },
    async connect() {
      let snapshotRevision = revision;
      return {
        async query(sql, values = []) {
          if (sql.startsWith('BEGIN') || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [], rowCount: 0 };
          if (sql.includes('SELECT currency, ledger_revision::text AS ledger_revision')) {
            return {
              rows: [{ currency: values[0] === businessA ? 'IDR' : 'USD', ledger_revision: snapshotRevision }],
              rowCount: 1,
            };
          }
          if (sql.includes('FROM sales s')) {
            captures.push({ sql, values });
            const cursorId = values.find((value) => value === saleA);
            const rows = cursorId ? [sourceRow(saleB, null)] : [sourceRow(saleA, '1250'), sourceRow(saleB, null)];
            return { rows, rowCount: rows.length };
          }
          throw new Error(`Unexpected SQL: ${sql}`);
        },
        release() {},
      };
    },
  };
  const app = createApp({ pool, authAdapter: () => ({ userId: currentUser }) });
  return { app, captures };
}

function body(overrides = {}) {
  return {
    dimension: 'date',
    datum_key: '2026-09-17',
    ledger_revision: '7',
    date_from: '2026-09-16',
    date_to: '2026-09-18',
    product_ids: [productA],
    page_size: 1,
    ...overrides,
  };
}

test('source-transactions API binds authenticated tenant, chart filters and returns exact paged rows', async (t) => {
  const { app, captures } = sourceApp();
  t.after(() => app.close());

  const first = await app.inject({ method: 'POST', url: '/api/v1/analytics/source-transactions', payload: body() });
  assert.equal(first.statusCode, 200);
  const data = first.json().data;
  assert.equal(data.items.length, 1);
  assert.equal(data.items[0].line_revenue, '3750');
  assert.equal(data.items[0].currency, 'IDR');
  assert.equal(data.ledger_revision, '7');
  assert.equal(data.has_more, true);
  assert.equal(typeof data.next_cursor, 'string');
  assert.match(captures[0].sql, /s\.business_id = \$1/);
  assert.match(captures[0].sql, /s\.sale_date >= \$2::date/);
  assert.match(captures[0].sql, /s\.sale_date <= \$3::date/);
  assert.match(captures[0].sql, /s\.product_id = ANY\(\$4::uuid\[\]\)/);
  assert.match(captures[0].sql, /NOT s\.voided/);
  assert.equal(captures[0].values[0], businessA);
  assert.deepEqual(captures[0].values[3], [productA]);

  const second = await app.inject({
    method: 'POST',
    url: '/api/v1/analytics/source-transactions',
    payload: body({ cursor: data.next_cursor }),
  });
  assert.equal(second.statusCode, 200);
  assert.deepEqual(second.json().data.items.map(({ id, line_revenue }) => ({ id, line_revenue })), [{ id: saleB, line_revenue: null }]);
  assert.ok(captures[1].values.includes(saleA));
});

test('product datum uses the original date and product bar predicate under the authenticated tenant', async (t) => {
  const { app, captures } = sourceApp({ currentUser: ownerB });
  t.after(() => app.close());
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/analytics/source-transactions',
    payload: body({ dimension: 'product', datum_key: productA, product_ids: [], page_size: 10 }),
  });
  assert.equal(response.statusCode, 200);
  assert.equal(captures[0].values[0], businessB);
  assert.match(captures[0].sql, /s\.product_id = \$4::uuid/);
  assert.deepEqual(captures[0].values.slice(1, 4), ['2026-09-16', '2026-09-18', productA]);

  const unbounded = await app.inject({
    method: 'POST',
    url: '/api/v1/analytics/source-transactions',
    payload: body({ dimension: 'product', datum_key: productA, date_from: null, date_to: null, product_ids: [], page_size: 10 }),
  });
  assert.equal(unbounded.statusCode, 200);
  assert.doesNotMatch(captures[1].sql, /s\.sale_date >=/);
  assert.doesNotMatch(captures[1].sql, /s\.sale_date <=/);
});

test('source-transactions fails closed when chart revision is stale and gives refresh guidance', async (t) => {
  const { app } = sourceApp({ revision: '8' });
  t.after(() => app.close());
  const response = await app.inject({ method: 'POST', url: '/api/v1/analytics/source-transactions', payload: body() });
  assert.equal(response.statusCode, 409);
  assert.equal(response.json().code, 'STALE_QUERY');
  assert.equal(response.json().current_version, '8');
  assert.match(response.json().message, /Refresh the chart/);
});

test('source-transactions rejects unauthenticated and malformed requests before returning rows', async (t) => {
  const { app } = sourceApp();
  const unauthenticated = createApp({
    pool: {
      async query() { return { rows: [], rowCount: 0 }; },
      async connect() { throw new Error('unauthenticated request reached source query'); },
    },
    authAdapter: () => null,
  });
  t.after(() => app.close());
  t.after(() => unauthenticated.close());
  const unauthorizedResponse = await unauthenticated.inject({ method: 'POST', url: '/api/v1/analytics/source-transactions', payload: body() });
  assert.equal(unauthorizedResponse.statusCode, 401);

  const malformedCursor = await app.inject({
    method: 'POST', url: '/api/v1/analytics/source-transactions', payload: body({ cursor: '***' }),
  });
  assert.equal(malformedCursor.statusCode, 422);
  assert.equal(malformedCursor.json().field_errors.cursor, 'invalid cursor');

  const clientTenant = await app.inject({
    method: 'POST', url: '/api/v1/analytics/source-transactions', payload: body({ business_id: businessB }),
  });
  assert.equal(clientTenant.statusCode, 422);

  const excludedDatum = await app.inject({
    method: 'POST',
    url: '/api/v1/analytics/source-transactions',
    payload: body({ dimension: 'product', datum_key: productB, product_ids: [productA] }),
  });
  assert.equal(excludedDatum.statusCode, 422);

  const outOfRangeDate = await app.inject({
    method: 'POST',
    url: '/api/v1/analytics/source-transactions',
    payload: body({ datum_key: '2026-09-19' }),
  });
  assert.equal(outOfRangeDate.statusCode, 422);
});
