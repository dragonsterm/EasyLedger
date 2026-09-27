import test from 'node:test';
import assert from 'node:assert/strict';
import { runBackupRestoreRehearsal, generateSqlDump, parseAndRestoreSqlDump, reconcileLedgerStates } from '../../scripts/backup-restore-rehearsal.mjs';

test('TASK-28-03: PostgreSQL backup and restore rehearsal verifies 100% data and audit survival (NFR-07, Test T-10)', async () => {
  const result = await runBackupRestoreRehearsal();

  assert.equal(result.success, true);
  assert.equal(result.revenueMatched, true);
  assert.equal(result.preRevenue, '228000');
  assert.equal(result.postRevenue, '228000');
  assert.equal(result.discrepancies.length, 0);
  assert.ok(result.totalRecords >= 10);
  assert.ok(result.checkedTables.includes('businesses'));
  assert.ok(result.checkedTables.includes('sales'));
  assert.ok(result.checkedTables.includes('sale_revisions'));
  assert.ok(result.checkedTables.includes('operations'));
  assert.ok(result.checkedTables.includes('day_coverages'));
});

test('TASK-28-03: SQL dump generator and parser preserve atomic transaction boundaries and JSONB structures', () => {
  const mockSnapshot = {
    tables: {
      operations: [
        {
          id: '00000000-0000-4000-8000-000000000001',
          idempotency_key: 'test-key',
          status: 'committed',
          result_receipt: {
            status: 'committed',
            ledger_revision: '1',
            totals: { known_revenue: '258000' },
          },
        },
      ],
    },
  };

  const dump = generateSqlDump(mockSnapshot);
  assert.ok(dump.includes('BEGIN;'));
  assert.ok(dump.includes('COMMIT;'));
  assert.ok(dump.includes("::jsonb"));

  const restored = parseAndRestoreSqlDump(dump);
  assert.equal(restored.operations.length, 1);
  assert.equal(restored.operations[0].id, mockSnapshot.tables.operations[0].id);
  assert.deepEqual(restored.operations[0].result_receipt, mockSnapshot.tables.operations[0].result_receipt);

  const reconciliation = reconcileLedgerStates(mockSnapshot, restored);
  assert.equal(reconciliation.reconciled, true);
  assert.equal(reconciliation.discrepancies.length, 0);
});

test('TASK-28-03: reconciliation detects corrupted or missing audit records post-restore', () => {
  const original = {
    tables: {
      sales: [
        { id: 'sale-1', quantity: '8', unit_price: '15000' },
      ],
    },
  };

  const corrupted = {
    sales: [
      { id: 'sale-1', quantity: '7', unit_price: '15000' }, // Quantity altered
    ],
  };

  const recCorrupt = reconcileLedgerStates(original, corrupted);
  assert.equal(recCorrupt.reconciled, false);
  assert.ok(recCorrupt.discrepancies.length > 0);
  assert.match(recCorrupt.discrepancies[0], /content mismatch/);

  const missing = { sales: [] };
  const recMissing = reconcileLedgerStates(original, missing);
  assert.equal(recMissing.reconciled, false);
  assert.match(recMissing.discrepancies[0], /count mismatch/);
});
