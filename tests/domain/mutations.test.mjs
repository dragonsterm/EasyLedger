import test from 'node:test';
import assert from 'node:assert/strict';

import {
  OperationError,
  OperationService,
  canonicalPayload,
  hashPayload,
} from '../../packages/domain/mutations.ts';

const noDatabase = {
  async connect() {
    throw new Error('validation should finish before opening a database transaction');
  },
};

test('canonical payload hashing sorts objects but preserves array order and missing versus null', () => {
  assert.equal(canonicalPayload({ b: 2, a: 1 }), canonicalPayload({ a: 1, b: 2 }));
  assert.equal(hashPayload({ value: 12n }), hashPayload({ value: 12n }));
  assert.notEqual(hashPayload({ values: [1, 2] }), hashPayload({ values: [2, 1] }));
  assert.notEqual(hashPayload({ value: undefined }), hashPayload({ value: null }));
  assert.notEqual(hashPayload({}), hashPayload({ value: null }));
});

test('batch validation requires bounded lines and explicit unknown prices', async () => {
  const service = new OperationService(noDatabase);
  const base = {
    business_id: '00000000-0000-4000-8000-000000000001',
    actor_user_id: 'test-owner',
    idempotency_key: 'validation',
  };

  await assert.rejects(
    service.commitSales({ ...base, lines: [] }),
    (error) => error instanceof OperationError && error.code === 'VALIDATION_ERROR' && error.httpStatus === 422,
  );
  await assert.rejects(
    service.commitSales({
      ...base,
      lines: [{
        product_id: '00000000-0000-4000-8000-000000000011',
        quantity: 1,
        sale_date: '2026-09-21',
      }],
    }),
    /unit_price must be explicit/,
  );
  await assert.rejects(
    service.commitSales({
      ...base,
      lines: [{
        product_id: '00000000-0000-4000-8000-000000000011',
        quantity: 1,
        unit_price: 1,
        sale_date: '2026-02-31',
      }],
    }),
    /ISO local date/,
  );
});

test('correction validation rejects empty and unsupported patches before claiming a key', async () => {
  const service = new OperationService(noDatabase);
  const base = {
    business_id: '00000000-0000-4000-8000-000000000001',
    actor_user_id: 'test-owner',
    idempotency_key: 'correction-validation',
    sale_id: '00000000-0000-4000-8000-000000000021',
    expected_version: 1,
    reason: 'test correction',
  };

  await assert.rejects(service.correctSale({ ...base, changes: {} }), /at least one field/);
  await assert.rejects(service.correctSale({ ...base, changes: { voided: true } }), /unsupported field/);
});
