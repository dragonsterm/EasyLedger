import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import {
  VoiceSessionService,
  ProposalService,
  SalesQueryService,
  fetchAssemblyAiToken,
  hashToken,
} from '../../packages/domain/voice.ts';

function stubPool() {
  return {
    async query() { return { rows: [], rowCount: 0 }; },
    async connect() { throw new Error('stubPool should not connect in unit tests'); },
  };
}

const businessA = '00000000-0000-4000-8000-000000000001';
const userA = '00000000-0000-4000-8000-000000000101';

test('VoiceSessionService creates and validates ephemeral tokens', async () => {
  const service = new VoiceSessionService(stubPool());
  const session = await service.createSession({
    business_id: businessA,
    actor_user_id: userA,
    ttl_seconds: 600,
  });

  assert.ok(session.session_id);
  assert.ok(session.session_token.startsWith('easysess_'));
  assert.equal(session.expires_in_seconds, 600);

  // Raw token validates correctly
  const validated = await service.validateSessionToken(session.session_token);
  assert.ok(validated);
  assert.equal(validated.id, session.session_id);
  assert.equal(validated.business_id, businessA);
  assert.equal(validated.actor_user_id, userA);

  // Invalid or expired token returns null
  assert.equal(await service.validateSessionToken('invalid_token'), null);
  assert.equal(await service.validateSessionToken(''), null);
});

test('VoiceSessionService enforces token expiration', async () => {
  const service = new VoiceSessionService(stubPool());
  // Create an expired session with 0s TTL
  const session = await service.createSession({
    business_id: businessA,
    actor_user_id: userA,
    ttl_seconds: -1,
  });

  const validated = await service.validateSessionToken(session.session_token);
  assert.equal(validated, null);
});

test('ProposalService enforces two-phase confirmation tokens and payload hashing', async () => {
  const service = new ProposalService(stubPool());
  const payload = {
    lines: [
      { product_id: randomUUID(), quantity: '5', unit_price: '15000', sale_date: '2026-09-23' },
    ],
  };

  const proposal = await service.createProposal({
    business_id: businessA,
    type: 'sale_batch',
    payload,
    base_ledger_revision: '3',
    ttl_seconds: 300,
  });

  assert.ok(proposal.proposal_id);
  assert.ok(proposal.confirmation_token.startsWith('easyconf_'));
  assert.ok(proposal.payload_hash);
  assert.equal(proposal.base_ledger_revision, '3');

  // Wrong confirmation token rejected with 403
  await assert.rejects(
    async () => {
      await service.verifyAndConsumeConfirmation({
        business_id: businessA,
        proposal_id: proposal.proposal_id,
        confirmation_token: 'wrong_token',
      });
    },
    (err) => err.code === 'FORBIDDEN' && err.httpStatus === 403,
  );

  // Correct confirmation token succeeds
  const verified = await service.verifyAndConsumeConfirmation({
    business_id: businessA,
    proposal_id: proposal.proposal_id,
    confirmation_token: proposal.confirmation_token,
  });
  assert.equal(verified.id, proposal.proposal_id);
  assert.equal(verified.status, 'committed');

  // Proposal for another tenant returns 404
  const otherBusiness = randomUUID();
  await assert.rejects(
    async () => {
      await service.verifyAndConsumeConfirmation({
        business_id: otherBusiness,
        proposal_id: proposal.proposal_id,
        confirmation_token: proposal.confirmation_token,
      });
    },
    (err) => err.code === 'NOT_FOUND' && err.httpStatus === 404,
  );
});

test('fetchAssemblyAiToken validates API key and handles errors safely', async () => {
  await assert.rejects(
    async () => {
      await fetchAssemblyAiToken('');
    },
    (err) => err.code === 'PROVIDER_UNAVAILABLE' && err.httpStatus === 503,
  );

  await assert.rejects(
    async () => {
      await fetchAssemblyAiToken('invalid_key_12345');
    },
    (err) => err.code === 'PROVIDER_UNAVAILABLE' && err.httpStatus === 503,
  );
});

test('SalesQueryService fills bounded date rows and keeps gaps, confirmed zeroes, and unknown prices distinct', async () => {
  const product = '00000000-0000-4000-8000-000000000201';
  const calls = [];
  const pool = {
    async query(sql, values) {
      calls.push({ sql, values });
      return {
        rows: [
          { row_key: '2026-09-01', row_label: '2026-09-01', quantity_sum: '2', revenue_sum: null, unknown_price_count: '1', coverage_state: 'open', data_state: 'unknown-price' },
          { row_key: '2026-09-02', row_label: '2026-09-02', quantity_sum: null, revenue_sum: null, unknown_price_count: '0', coverage_state: 'open', data_state: 'gap' },
          { row_key: '2026-09-03', row_label: '2026-09-03', quantity_sum: '0', revenue_sum: '0', unknown_price_count: '0', coverage_state: 'complete', data_state: 'confirmed-zero' },
          { row_key: '2026-09-04', row_label: '2026-09-04', quantity_sum: '1', revenue_sum: '125', unknown_price_count: '0', coverage_state: 'complete', data_state: 'sales' },
        ],
        rowCount: 4,
      };
    },
    async connect() { throw new Error('not used'); },
  };

  const response = await new SalesQueryService(pool).querySales({
    business_id: businessA,
    currency: 'IDR',
    ledger_revision: '9',
    metric: 'revenue',
    dimension: 'date',
    date_from: '2026-09-01',
    date_to: '2026-09-04',
    product_ids: [product],
  });

  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /generate_series\(\$2::date::timestamp, \$3::date::timestamp/);
  assert.match(calls[0].sql, /LEFT JOIN day_coverages/);
  assert.match(calls[0].sql, /s\.business_id = \$1/);
  assert.match(calls[0].sql, /s\.sale_date >= \$2/);
  assert.match(calls[0].sql, /s\.sale_date <= \$3/);
  assert.match(calls[0].sql, /s\.product_id = ANY\(\$4::uuid\[\]\)/);
  assert.deepEqual(calls[0].values, [businessA, '2026-09-01', '2026-09-04', [product]]);
  assert.equal(response.total, '125');
  assert.equal(response.has_unknown_prices, true);
  assert.equal(response.completeness, 'incomplete');
  assert.deepEqual(response.rows.map(({ quantity, revenue, data_state, coverage_state }) => ({ quantity, revenue, data_state, coverage_state })), [
    { quantity: '2', revenue: null, data_state: 'unknown-price', coverage_state: 'open' },
    { quantity: null, revenue: null, data_state: 'gap', coverage_state: 'open' },
    { quantity: '0', revenue: '0', data_state: 'confirmed-zero', coverage_state: 'complete' },
    { quantity: '1', revenue: '125', data_state: 'sales', coverage_state: 'complete' },
  ]);
  assert.deepEqual(response.filters, {
    date_from: '2026-09-01',
    date_to: '2026-09-04',
    product_ids: [product],
  });
});

test('SalesQueryService rejects an oversized date spine and propagates database failures', async () => {
  let queryCount = 0;
  const pool = {
    async query() {
      queryCount += 1;
      throw new Error('database connection failed');
    },
    async connect() { throw new Error('not used'); },
  };
  const service = new SalesQueryService(pool);
  const common = {
    business_id: businessA,
    currency: 'IDR',
    ledger_revision: '9',
    metric: 'units',
    dimension: 'date',
  };

  await assert.rejects(
    service.querySales({ ...common, date_from: '2026-01-01', date_to: '2027-01-02' }),
    (error) => error.code === 'VALIDATION_ERROR' && error.httpStatus === 422,
  );
  assert.equal(queryCount, 0);
  await assert.rejects(
    service.querySales({ ...common, date_from: '2026-09-01', date_to: '2026-09-01' }),
    (error) => error.message === 'database connection failed',
  );
  assert.equal(queryCount, 1);
});
