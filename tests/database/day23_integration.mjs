import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import pg from 'pg';

import { createApp } from '../../apps/api/app.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const migration1 = await readFile(path.join(root, 'db/migrations/001_initial_schema.sql'), 'utf8');
const migration2 = await readFile(path.join(root, 'db/migrations/002_product_versions.sql'), 'utf8');
const migration3 = await readFile(path.join(root, 'db/migrations/003_voice_sessions.sql'), 'utf8');
const seed = await readFile(path.join(root, 'db/seed/001_demo_catalog.sql'), 'utf8');
const databaseUrl = process.env.EASYLEDGER_TEST_DATABASE_URL;

test('Day 23 Voice Agent session bootstrap, tool gateway, and multi-tenant isolation', { skip: !databaseUrl }, async (t) => {
  const schema = `day23_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Pool({ connectionString: databaseUrl, max: 2 });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 12, options: `-c search_path=${schema}` });

  const userA = '00000000-0000-4000-8000-000000000101';
  const userB = '00000000-0000-4000-8000-000000000102';
  const businessA = '00000000-0000-4000-8000-000000000001';
  const businessB = '00000000-0000-4000-8000-000000000002';
  const orangeProduct = '00000000-0000-4000-8000-000000000011';
  const mangoProduct = '00000000-0000-4000-8000-000000000012';
  const productB = '00000000-0000-4000-8000-000000000021';
  const saleDate = '2026-09-23';

  t.after(async () => {
    await pool.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  });

  await pool.query(migration1);
  await pool.query(migration2);
  await pool.query(migration3);
  await pool.query(seed);

  // Set up second tenant
  await pool.query(
    `INSERT INTO businesses (id, owner_user_id, name, currency, timezone)
     VALUES ($1, $2, 'Tenant B USD Business', 'USD', 'Asia/Jakarta')`,
    [businessB, userB],
  );
  await pool.query(
    `INSERT INTO products (id, business_id, name, default_unit_price)
     VALUES ($1, $2, 'Tenant B Coffee', 350)`,
    [productB, businessB],
  );

  let activeUser = null;
  const app = createApp({
    pool,
    authAdapter: () => (activeUser ? { userId: activeUser } : null),
    assemblyTokenGenerator: () => 'mock_provider_token_day23',
  });
  await app.ready();
  t.after(() => app.close());

  // 1. Session Bootstrap (TASK-23-01)
  activeUser = userA;
  const sessionResA = await app.inject({
    method: 'POST',
    url: '/api/v1/voice/sessions',
    payload: { ttl_seconds: 600 },
  });
  assert.equal(sessionResA.statusCode, 201);
  const sessionA = sessionResA.json().data;
  assert.ok(sessionA.session_id);
  assert.ok(sessionA.session_token.startsWith('easysess_'));
  assert.equal(sessionA.provider_token, 'mock_provider_token_day23');

  activeUser = userB;
  const sessionResB = await app.inject({
    method: 'POST',
    url: '/api/v1/voice/sessions',
    payload: { ttl_seconds: 600 },
  });
  assert.equal(sessionResB.statusCode, 201);
  const sessionB = sessionResB.json().data;

  // 2. Tool Gateway: get_context with tenant isolation (TASK-23-02 & TASK-23-03)
  const ctxResA = await app.inject({
    method: 'POST',
    url: '/api/v1/voice/tools/get_context',
    headers: { authorization: `Bearer ${sessionA.session_token}` },
    payload: {},
  });
  assert.equal(ctxResA.statusCode, 200);
  const ctxA = ctxResA.json().data;
  assert.equal(ctxA.business_id, businessA);
  assert.equal(ctxA.currency, 'IDR');
  assert.equal(ctxA.catalog.length, 2);

  const ctxResB = await app.inject({
    method: 'POST',
    url: '/api/v1/voice/tools/get_context',
    headers: { authorization: `Bearer ${sessionB.session_token}` },
    payload: {},
  });
  assert.equal(ctxResB.statusCode, 200);
  const ctxB = ctxResB.json().data;
  assert.equal(ctxB.business_id, businessB);
  assert.equal(ctxB.currency, 'USD');
  assert.equal(ctxB.catalog[0].id, productB);

  // 3. Propose Sales (Golden IDR batch: 10 Orange @ 15,000 + 6 Mango @ 18,000 = 258,000)
  const proposeRes = await app.inject({
    method: 'POST',
    url: '/api/v1/voice/tools/propose_sales',
    headers: { 'x-session-token': sessionA.session_token },
    payload: {
      lines: [
        { product_id: orangeProduct, quantity: '10', sale_date: saleDate },
        { product_id: mangoProduct, quantity: '6', sale_date: saleDate },
      ],
    },
  });
  assert.equal(proposeRes.statusCode, 200);
  const proposal = proposeRes.json().data;
  assert.ok(proposal.proposal_id);
  assert.ok(proposal.confirmation_token);
  assert.equal(proposal.total_quantity, '16');
  assert.equal(proposal.known_total_revenue, '258000');

  // Verify proposal stored in PostgreSQL
  const dbProp = await pool.query('SELECT status, base_ledger_revision FROM proposals WHERE id = $1', [proposal.proposal_id]);
  assert.equal(dbProp.rowCount, 1);
  assert.equal(dbProp.rows[0].status, 'awaiting_confirmation');

  // Cross-tenant commit rejected (Tenant B cannot commit Tenant A proposal)
  const crossCommit = await app.inject({
    method: 'POST',
    url: '/api/v1/voice/tools/commit_sales',
    headers: { 'x-session-token': sessionB.session_token },
    payload: {
      proposal_id: proposal.proposal_id,
      confirmation_token: proposal.confirmation_token,
      idempotency_key: 'cross-commit-key',
    },
  });
  assert.equal(crossCommit.statusCode, 404);

  // Invalid confirmation token rejected with 403
  const badTokenCommit = await app.inject({
    method: 'POST',
    url: '/api/v1/voice/tools/commit_sales',
    headers: { 'x-session-token': sessionA.session_token },
    payload: {
      proposal_id: proposal.proposal_id,
      confirmation_token: 'forged_token',
      idempotency_key: 'bad-token-key',
    },
  });
  assert.equal(badTokenCommit.statusCode, 403);

  // Valid commit succeeds atomically
  const commitRes = await app.inject({
    method: 'POST',
    url: '/api/v1/voice/tools/commit_sales',
    headers: { 'x-session-token': sessionA.session_token },
    payload: {
      proposal_id: proposal.proposal_id,
      confirmation_token: proposal.confirmation_token,
      idempotency_key: 'day23-golden-commit',
    },
  });
  assert.equal(commitRes.statusCode, 201);
  const commitReceipt = commitRes.json().data;
  assert.equal(commitReceipt.sales.length, 2);
  assert.equal(commitReceipt.totals.known_revenue, '258000');

  // Database verification of committed sales
  const salesInDb = await pool.query('SELECT id, product_id, quantity, unit_price, version FROM sales WHERE business_id = $1 ORDER BY unit_price ASC', [businessA]);
  assert.equal(salesInDb.rowCount, 2);
  const orangeSale = salesInDb.rows[0];
  assert.equal(orangeSale.product_id, orangeProduct);
  assert.equal(orangeSale.quantity, 10);
  assert.equal(orangeSale.version, '1');

  // 4. Propose and Commit Correction (Orange 10 -> 8; Total becomes 228,000)
  const propCorrRes = await app.inject({
    method: 'POST',
    url: '/api/v1/voice/tools/propose_correction',
    headers: { 'x-session-token': sessionA.session_token },
    payload: {
      sale_id: orangeSale.id,
      expected_version: '1',
      changes: { quantity: '8' },
      reason: 'Customer requested 8 orange juices',
    },
  });
  assert.equal(propCorrRes.statusCode, 200);
  const corrProposal = propCorrRes.json().data;
  assert.equal(corrProposal.before_values.quantity, '10');
  assert.equal(corrProposal.after_values.quantity, '8');

  // Commit correction
  const commitCorrRes = await app.inject({
    method: 'POST',
    url: '/api/v1/voice/tools/commit_correction',
    headers: { 'x-session-token': sessionA.session_token },
    payload: {
      proposal_id: corrProposal.proposal_id,
      confirmation_token: corrProposal.confirmation_token,
      idempotency_key: 'day23-corr-commit',
    },
  });
  assert.equal(commitCorrRes.statusCode, 200);
  const corrReceipt = commitCorrRes.json().data;
  assert.equal(corrReceipt.sales[0].version, '2');
  assert.equal(corrReceipt.sales[0].quantity, '8');
  assert.equal(corrReceipt.totals.known_revenue, '120000');

  // 5. Query Sales Tool (Deterministic analytics over all active sales in the day: 8 * 15,000 + 6 * 18,000 = 228,000)
  const queryRes = await app.inject({
    method: 'POST',
    url: '/api/v1/voice/tools/query_sales',
    headers: { 'x-session-token': sessionA.session_token },
    payload: {
      metric: 'revenue',
      dimension: 'none',
      date_from: saleDate,
      date_to: saleDate,
    },
  });
  assert.equal(queryRes.statusCode, 200);
  const queryData = queryRes.json().data;
  assert.equal(queryData.total, '228000');
  assert.equal(queryData.completeness, 'complete');

  // 6. Security & Invariant verification (TASK-23-03 & TASK-23-04)
  // Injection of business_id is blocked with 422
  const injectionRes = await app.inject({
    method: 'POST',
    url: '/api/v1/voice/tools/query_sales',
    headers: { 'x-session-token': sessionA.session_token },
    payload: {
      metric: 'revenue',
      business_id: businessB,
    },
  });
  assert.equal(injectionRes.statusCode, 422);

  // Missing token blocked with 401
  const noTokenRes = await app.inject({
    method: 'POST',
    url: '/api/v1/voice/tools/query_sales',
    payload: { metric: 'revenue' },
  });
  assert.equal(noTokenRes.statusCode, 401);
});
