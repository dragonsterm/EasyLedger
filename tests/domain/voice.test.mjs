import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import {
  VoiceSessionService,
  ProposalService,
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
