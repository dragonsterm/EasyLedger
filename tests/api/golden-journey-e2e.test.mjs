import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { createApp } from '../../apps/api/app.ts';

const ownerUserId = '00000000-0000-4000-8000-000000000101';
const businessId = '00000000-0000-4000-8000-000000000001';
const orangeProductId = '00000000-0000-4000-8000-000000000011';
const mangoProductId = '00000000-0000-4000-8000-000000000012';

/**
 * Stateful database harness simulating PostgreSQL for Golden Journey E2E (Test T-01).
 * Supports businesses, products, operations, sales, day coverages, proposals, and analytics.
 */
function createGoldenJourneyPool() {
  let ledgerRevision = 0n;

  const business = {
    id: businessId,
    name: 'Juice Stall Demo',
    currency: 'IDR',
    timezone: 'Asia/Jakarta',
    owner_user_id: ownerUserId,
  };

  const products = new Map([
    [orangeProductId, { id: orangeProductId, business_id: businessId, name: 'Orange Juice', default_unit_price: '15000', active: true }],
    [mangoProductId, { id: mangoProductId, business_id: businessId, name: 'Mango Juice', default_unit_price: '18000', active: true }],
  ]);

  const sales = new Map();
  const operations = new Map();
  const dayCoverages = new Map();

  function buildClient() {
    return {
      async query(text, values = []) {
        try {
          const sql = String(text);
          const cleanSql = sql.replace(/\s+/g, ' ');

        if (sql.startsWith('BEGIN') || sql === 'COMMIT' || sql === 'ROLLBACK') {
          return { rows: [], rowCount: 0 };
        }

        // claimOperation: INSERT INTO operations
        if (cleanSql.includes('INSERT INTO operations')) {
          const [opId, bId, idemKey, payloadHash, actorId, undoOf] = values;
          if (operations.has(idemKey)) {
            return { rows: [], rowCount: 0 };
          }
          const op = {
            id: opId,
            business_id: bId,
            idempotency_key: idemKey,
            payload_hash: payloadHash,
            status: 'pending',
            actor_user_id: actorId,
            undo_of_operation_id: undoOf,
            result_receipt: null,
          };
          operations.set(idemKey, op);
          return { rows: [{ id: opId }], rowCount: 1 };
        }

        // claimOperation: existing check
        if (cleanSql.includes('FROM operations') && cleanSql.includes('idempotency_key = $2')) {
          const idemKey = values[1];
          const op = operations.get(idemKey);
          return { rows: op ? [op] : [], rowCount: op ? 1 : 0 };
        }

        // lockBusiness
        if (cleanSql.includes('FROM businesses') && cleanSql.includes('FOR UPDATE')) {
          return {
            rows: [{ id: business.id, currency: business.currency, ledger_revision: ledgerRevision.toString() }],
            rowCount: 1,
          };
        }

        // validateProducts
        if (cleanSql.includes('FROM products') && cleanSql.includes('id = ANY')) {
          const requestedIds = values[1] || [];
          const matched = requestedIds.map((id) => products.get(id)).filter(Boolean);
          return { rows: matched, rowCount: matched.length };
        }

        // reconcileDayCoverage: SELECT
        if (cleanSql.includes('FROM day_coverages') && cleanSql.includes('FOR UPDATE')) {
          const requestedDates = values[1] || [];
          const matched = requestedDates.map((d) => dayCoverages.get(`${businessId}:${d}`)).filter(Boolean);
          return { rows: matched, rowCount: matched.length };
        }

        // reconcileDayCoverage: INSERT
        if (cleanSql.includes('INSERT INTO day_coverages')) {
          const [, , dateVal, stateVal] = values;
          dayCoverages.set(`${businessId}:${dateVal}`, { local_date: dateVal, state: stateVal });
          return { rows: [], rowCount: 1 };
        }

        // commitSales: INSERT INTO sales
        if (cleanSql.includes('INSERT INTO sales')) {
          const [saleId, bId, pId, qty, unitPrice, sDate, ver, voided] = values;
          const rec = {
            id: saleId,
            business_id: bId,
            product_id: pId,
            product_name: products.get(pId)?.name || 'Unknown',
            quantity: String(qty),
            unit_price: unitPrice !== null ? String(unitPrice) : null,
            sale_date: sDate,
            version: String(ver || '1'),
            voided: Boolean(voided),
          };
          sales.set(saleId, rec);
          return { rows: [rec], rowCount: 1 };
        }

        // correctSale: SELECT sale FOR UPDATE
        if (cleanSql.includes('FROM sales') && cleanSql.includes('id = $2 FOR UPDATE')) {
          const sale = sales.get(values[1]);
          return { rows: sale ? [sale] : [], rowCount: sale ? 1 : 0 };
        }

        // correctSale: UPDATE sales
        if (cleanSql.includes('UPDATE sales') && cleanSql.includes('SET product_id = $3')) {
          const [, sId, nextPId, nextQty, nextPrice, nextDate] = values;
          const existing = sales.get(sId);
          if (existing) {
            existing.product_id = String(nextPId);
            existing.quantity = String(nextQty);
            existing.unit_price = nextPrice !== null ? String(nextPrice) : null;
            existing.sale_date = String(nextDate);
            existing.version = String(BigInt(existing.version) + 1n);
          }
          return { rows: existing ? [existing] : [], rowCount: existing ? 1 : 0 };
        }

        // insert revisions & audit_events
        if (cleanSql.includes('INSERT INTO sale_revisions') || cleanSql.includes('INSERT INTO coverage_revisions') || cleanSql.includes('INSERT INTO audit_events')) {
          return { rows: [], rowCount: 1 };
        }

        // incrementLedgerRevision
        if (cleanSql.includes('UPDATE businesses') && cleanSql.includes('ledger_revision = ledger_revision + 1')) {
          ledgerRevision += 1n;
          return { rows: [{ ledger_revision: ledgerRevision.toString() }], rowCount: 1 };
        }

        if (cleanSql.includes('UPDATE day_coverages')) {
          return { rows: [], rowCount: 1 };
        }

        // finishOperation
        if (cleanSql.includes('UPDATE operations') && cleanSql.includes('status = \'committed\'')) {
          const [opId, receiptJson] = values;
          for (const op of operations.values()) {
            if (op.id === opId) {
              op.status = 'committed';
              op.result_receipt = JSON.parse(receiptJson);
              break;
            }
          }
          return { rows: [], rowCount: 1 };
        }

        // querySourceTransactions
        if (cleanSql.includes('FROM businesses') && cleanSql.includes('LIMIT 1')) {
          return {
            rows: [{ currency: business.currency, ledger_revision: ledgerRevision.toString() }],
            rowCount: 1,
          };
        }

        if (cleanSql.includes('FROM sales s') && cleanSql.includes('JOIN products p')) {
          const activeSales = [...sales.values()].filter((s) => !s.voided);
          const mapped = activeSales.map((s) => ({
            id: s.id,
            product_id: s.product_id,
            product_name: s.product_name,
            quantity: s.quantity,
            unit_price: s.unit_price,
            sale_date: s.sale_date,
            version: s.version,
          }));
          return { rows: mapped, rowCount: mapped.length };
        }

        return { rows: [], rowCount: 0 };
        } catch (err) {
          console.error('CLIENT QUERY ERROR:', err);
          throw err;
        }
      },
      release() {},
    };
  }

  return {
    async connect() {
      return buildClient();
    },
    async query(text, values = []) {
      const sql = String(text);

      if (sql.includes('owner_user_id = $1')) {
        const found = values[0] === ownerUserId ? [business] : [];
        return { rows: found, rowCount: found.length };
      }
      if (sql.includes('businesses') && sql.includes('WHERE id = $1')) {
        const found = values[0] === businessId ? [{ ...business, ledger_revision: ledgerRevision.toString() }] : [];
        return { rows: found, rowCount: found.length };
      }
      if (sql.includes('FROM products') && sql.includes('id = $2')) {
        const found = products.get(values[1]);
        return { rows: found ? [found] : [], rowCount: found ? 1 : 0 };
      }
      if (sql.includes('FROM products') && sql.includes('active')) {
        const activeList = [...products.values()].filter((p) => p.active);
        return { rows: activeList, rowCount: activeList.length };
      }
      if (sql.includes('SELECT id, name, default_unit_price') || sql.includes('FROM products WHERE business_id = $1 AND id = $2')) {
        const found = products.get(values[1]);
        return { rows: found ? [found] : [], rowCount: found ? 1 : 0 };
      }
      if (sql.includes('FROM sales s') && sql.includes('s.id = $2')) {
        const found = sales.get(values[1]);
        return { rows: found ? [found] : [], rowCount: found ? 1 : 0 };
      }
      if (sql.includes('s.id AS sale_id')) {
        const all = [...sales.values()].filter((s) => s.business_id === values[0] && !s.voided);
        const mapped = all.map((s) => ({
          sale_id: s.id,
          product_id: s.product_id,
          product_name: s.product_name,
          quantity: s.quantity,
          unit_price: s.unit_price,
          sale_date: s.sale_date,
          version: s.version,
          voided: s.voided,
        }));
        return { rows: mapped, rowCount: mapped.length };
      }
      // Analytics aggregation query
      if (sql.includes('FROM sales s')) {
        const activeSales = [...sales.values()].filter((s) => !s.voided);
        let totalRevenue = 0n;
        let totalQuantity = 0n;
        for (const s of activeSales) {
          totalQuantity += BigInt(s.quantity);
          if (s.unit_price !== null) {
            totalRevenue += BigInt(s.quantity) * BigInt(s.unit_price);
          }
        }
        return {
          rows: [
            {
              row_key: 'total',
              row_label: 'Total',
              quantity_sum: totalQuantity.toString(),
              revenue_sum: totalRevenue.toString(),
              unknown_price_count: '0',
            },
          ],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    },
  };
}

test('TASK-27-01: End-to-End Golden Journey (Test T-01) across full voice, sales mutation, revision, and analytics lifecycle', async (t) => {
  const pool = createGoldenJourneyPool();
  const app = createApp({
    pool,
    authAdapter: () => ({ userId: ownerUserId }),
    assemblyTokenGenerator: () => 'mock_golden_provider_token',
  });
  t.after(() => app.close());

  // -------------------------------------------------------------
  // STEP 1: Voice Session Initialization
  // -------------------------------------------------------------
  const sessionRes = await app.inject({
    method: 'POST',
    url: '/api/v1/voice/sessions',
    payload: { ttl_seconds: 600 },
  });
  assert.equal(sessionRes.statusCode, 201);
  const sessionBody = sessionRes.json().data;
  const sessionToken = sessionBody.session_token;
  assert.ok(sessionToken.startsWith('easysess_'));
  assert.equal(sessionBody.provider_token, 'mock_golden_provider_token');

  // -------------------------------------------------------------
  // STEP 2: Voice Input / Propose Sales:
  // "10 Orange Juices at 15,000 + 6 Mango Juices at 18,000"
  // Expected: 2 lines, total quantity 16, total revenue 258,000 IDR
  // -------------------------------------------------------------
  const proposeRes = await app.inject({
    method: 'POST',
    url: '/api/v1/voice/tools/propose_sales',
    headers: { 'x-session-token': sessionToken },
    payload: {
      lines: [
        { product_id: orangeProductId, quantity: '10', sale_date: '2026-09-28' },
        { product_id: mangoProductId, quantity: '6', sale_date: '2026-09-28' },
      ],
    },
  });
  assert.equal(proposeRes.statusCode, 200);
  const proposal = proposeRes.json().data;
  assert.ok(proposal.proposal_id);
  assert.ok(proposal.confirmation_token);
  assert.equal(proposal.status, 'awaiting_confirmation');
  assert.equal(proposal.total_quantity, '16');
  assert.equal(proposal.known_total_revenue, '258000'); // 10*15000 + 6*18000 = 258000
  assert.equal(proposal.lines.length, 2);

  // -------------------------------------------------------------
  // STEP 3: Owner Confirms & Commits Sales:
  // Verifies atomic receipt, ledger_revision: '1', exactly 2 sales created
  // -------------------------------------------------------------
  const commitRes = await app.inject({
    method: 'POST',
    url: '/api/v1/voice/tools/commit_sales',
    headers: { 'x-session-token': sessionToken },
    payload: {
      proposal_id: proposal.proposal_id,
      confirmation_token: proposal.confirmation_token,
      idempotency_key: 'golden-journey-commit-01',
    },
  });
  if (commitRes.statusCode !== 201) {
    console.error('COMMIT RES ERROR:', commitRes.json());
  }
  assert.equal(commitRes.statusCode, 201);
  const commitReceipt = commitRes.json().data;
  assert.equal(commitReceipt.ledger_revision, '1');
  assert.equal(commitReceipt.totals.known_revenue, '258000');
  assert.equal(commitReceipt.sales.length, 2);

  const orangeSale = commitReceipt.sales.find((s) => s.product_id === orangeProductId);
  assert.ok(orangeSale);
  assert.equal(orangeSale.quantity, '10');
  assert.equal(orangeSale.version, '1');

  // Idempotency check: Replay commit returns identical receipt
  const replayCommit = await app.inject({
    method: 'POST',
    url: '/api/v1/voice/tools/commit_sales',
    headers: { 'x-session-token': sessionToken },
    payload: {
      proposal_id: proposal.proposal_id,
      confirmation_token: proposal.confirmation_token,
      idempotency_key: 'golden-journey-commit-01',
    },
  });
  assert.equal(replayCommit.statusCode, 201);
  assert.deepEqual(replayCommit.json().data, commitReceipt);

  // -------------------------------------------------------------
  // STEP 4: Voice Correction:
  // "Actually make that 8 Orange Juices instead of 10"
  // Expected new total: 8*15,000 + 6*18,000 = 228,000 IDR
  // -------------------------------------------------------------
  const corrProposalRes = await app.inject({
    method: 'POST',
    url: '/api/v1/voice/tools/propose_correction',
    headers: { 'x-session-token': sessionToken },
    payload: {
      sale_id: orangeSale.sale_id,
      expected_version: '1',
      changes: { quantity: '8' },
      reason: 'Customer updated orange juice quantity from 10 to 8',
    },
  });
  assert.equal(corrProposalRes.statusCode, 200);
  const corrProposal = corrProposalRes.json().data;
  assert.ok(corrProposal.proposal_id);
  assert.ok(corrProposal.confirmation_token);
  assert.equal(corrProposal.before_values.quantity, '10');
  assert.equal(corrProposal.after_values.quantity, '8');

  // -------------------------------------------------------------
  // STEP 5: Owner Confirms Correction:
  // Verifies append-only compensating mutation:
  // ledger_revision increments to '2', version becomes '2',
  // and new total revenue is exactly 228,000 IDR.
  // -------------------------------------------------------------
  const corrCommitRes = await app.inject({
    method: 'POST',
    url: '/api/v1/voice/tools/commit_correction',
    headers: { 'x-session-token': sessionToken },
    payload: {
      proposal_id: corrProposal.proposal_id,
      confirmation_token: corrProposal.confirmation_token,
      idempotency_key: 'golden-journey-correction-01',
    },
  });
  assert.equal(corrCommitRes.statusCode, 200);
  const corrReceipt = corrCommitRes.json().data;
  assert.equal(corrReceipt.ledger_revision, '2');
  assert.equal(corrReceipt.sales[0].sale_id, orangeSale.sale_id);
  assert.equal(corrReceipt.sales[0].quantity, '8');
  assert.equal(corrReceipt.sales[0].version, '2');

  // -------------------------------------------------------------
  // STEP 6: Sales Analytics Verification (Charts Update):
  // Verifies aggregated total revenue is 228,000 IDR and 14 total units.
  // -------------------------------------------------------------
  const analyticsRes = await app.inject({
    method: 'POST',
    url: '/api/v1/analytics/query',
    payload: {
      metric: 'revenue',
      dimension: 'none',
      date_from: '2026-09-01',
      date_to: '2026-09-30',
    },
  });
  assert.equal(analyticsRes.statusCode, 200);
  const analyticsData = analyticsRes.json().data;
  assert.equal(analyticsData.total, '228000'); // Exactly 228,000 IDR total revenue!
  assert.equal(analyticsData.rows[0].revenue, '228000');
  assert.equal(analyticsData.rows[0].quantity, '14'); // 8 orange + 6 mango = 14 total units!

  // -------------------------------------------------------------
  // STEP 7: Drill-Down Source Transactions Verification:
  // Query source transactions for the corrected Orange Juice point.
  // Verifies version: '2', quantity: '8', unit_price: '15000'.
  // -------------------------------------------------------------
  const sourceRes = await app.inject({
    method: 'POST',
    url: '/api/v1/analytics/source-transactions',
    payload: {
      dimension: 'product',
      datum_key: orangeProductId,
      ledger_revision: '2',
      date_from: '2026-09-01',
      date_to: '2026-09-30',
      product_ids: [orangeProductId],
      page_size: 10,
    },
  });
  assert.equal(sourceRes.statusCode, 200);
  const sourceData = sourceRes.json().data;
  assert.equal(sourceData.ledger_revision, '2');
  assert.ok(sourceData.items.length >= 1);
  const orangeTx = sourceData.items.find((item) => item.product_id === orangeProductId);
  assert.ok(orangeTx);
  assert.equal(orangeTx.quantity, '8');
  assert.equal(orangeTx.version, '2');
  assert.equal(orangeTx.unit_price, '15000');
});
