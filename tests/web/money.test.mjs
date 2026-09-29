import assert from 'node:assert/strict';
import test from 'node:test';

import { formatLedgerAmount, formatMoneyInput, parseMoneyInput } from '../../apps/web/src/money.ts';

test('USD ledger formatting preserves the cents boundary around ten dollars', () => {
  assert.equal(formatLedgerAmount(999, 'USD'), '$9.99');
  assert.equal(formatLedgerAmount(1000, 'USD'), '$10.00');
  assert.equal(formatLedgerAmount(1001, 'USD'), '$10.01');
});

test('money input conversion remains exact in minor units', () => {
  assert.equal(parseMoneyInput('9.99', 'USD'), '999');
  assert.equal(formatMoneyInput('1000', 'USD'), '10.00');
  assert.equal(formatLedgerAmount('12000', 'IDR'), 'Rp 12.000');
});
