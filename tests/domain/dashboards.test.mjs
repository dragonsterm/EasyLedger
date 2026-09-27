import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDefaultLayoutItems,
  createDefaultWidgetSpecs,
  DashboardService,
} from '../../packages/domain/dashboards.ts';
import { OperationError } from '../../packages/domain/mutations.ts';

function createMockPool() {
  return {
    async query() {
      return { rows: [], rowCount: 0 };
    },
    async connect() {
      throw new Error('connect not implemented in mock');
    },
  };
}

const businessA = '00000000-0000-4000-8000-000000000001';
const businessB = '00000000-0000-4000-8000-000000000002';

test('createDefaultWidgetSpecs and createDefaultLayoutItems return standard initial layout', () => {
  const specs = createDefaultWidgetSpecs();
  const layout = createDefaultLayoutItems();

  assert.equal(specs.length, 5);
  assert.equal(layout.length, 5);
  assert.equal(specs[0].id, 'total-revenue');
  assert.equal(specs[0].type, 'kpi');
  assert.equal(specs[3].id, 'daily-revenue');
  assert.equal(specs[3].type, 'line');
  assert.equal(specs[4].id, 'sales-by-product');
  assert.equal(specs[4].type, 'bar');
});

test('TASK-26-03 domain: updateDashboardDraft supports add, edit, move, resize, remove, select', async () => {
  const service = new DashboardService(createMockPool());

  // 1. Initial draft starts from defaults
  const draft1 = await service.updateDashboardDraft({
    business_id: businessA,
    operations: [
      {
        type: 'add',
        widget: {
          id: 'custom-pie',
          type: 'bar',
          title: 'Custom Category Bar',
          metric: 'units',
        },
      },
    ],
  });

  assert.equal(draft1.is_draft, true);
  assert.equal(draft1.widgets.length, 6);
  assert.equal(draft1.layout.length, 6);
  assert.equal(draft1.selected_widget_id, 'custom-pie');
  const addedWidget = draft1.widgets.find((w) => w.id === 'custom-pie');
  assert.equal(addedWidget?.title, 'Custom Category Bar');

  // 2. Edit widget updates title and dimension
  const draft2 = await service.updateDashboardDraft({
    business_id: businessA,
    operations: [
      {
        type: 'edit',
        widget_id: 'custom-pie',
        changes: {
          title: 'Renamed Category Bar',
          metric: 'revenue',
        },
      },
    ],
  });

  assert.equal(draft2.widgets.length, 6);
  const editedWidget = draft2.widgets.find((w) => w.id === 'custom-pie');
  assert.equal(editedWidget?.title, 'Renamed Category Bar');
  assert.equal(editedWidget?.metric, 'revenue');

  // 3. Move widget to top
  const draft3 = await service.updateDashboardDraft({
    business_id: businessA,
    operations: [
      {
        type: 'move',
        widget_id: 'custom-pie',
        position: 'top',
      },
    ],
  });

  const movedItem = draft3.layout.find((l) => l.i === 'custom-pie');
  assert.equal(movedItem?.y, 0);

  // 4. Resize widget
  const draft4 = await service.updateDashboardDraft({
    business_id: businessA,
    operations: [
      {
        type: 'resize',
        widget_id: 'custom-pie',
        w: 12,
        h: 8,
      },
    ],
  });

  const resizedItem = draft4.layout.find((l) => l.i === 'custom-pie');
  assert.equal(resizedItem?.w, 12);
  assert.equal(resizedItem?.h, 8);

  // 5. Select widget
  const draft5 = await service.updateDashboardDraft({
    business_id: businessA,
    operations: [
      {
        type: 'select',
        widget_id: 'total-units',
      },
    ],
  });

  assert.equal(draft5.selected_widget_id, 'total-units');

  // 6. Remove widget
  const draft6 = await service.updateDashboardDraft({
    business_id: businessA,
    operations: [
      {
        type: 'remove',
        widget_id: 'custom-pie',
      },
    ],
  });

  assert.equal(draft6.widgets.length, 5);
  assert.equal(draft6.layout.length, 5);
  assert.equal(draft6.widgets.some((w) => w.id === 'custom-pie'), false);
  assert.equal(draft6.layout.some((l) => l.i === 'custom-pie'), false);
});

test('TASK-26-03 domain: ambiguity detection triggers NEEDS_CLARIFICATION (FR-12)', async () => {
  const service = new DashboardService(createMockPool());

  // 1. Explicit ambiguous reference "that chart" asks for target
  await assert.rejects(
    async () => {
      await service.updateDashboardDraft({
        business_id: businessA,
        operations: [
          {
            type: 'edit',
            widget_id: 'that chart',
            changes: { title: 'New Title' },
          },
        ],
      });
    },
    (err) => {
      assert.ok(err instanceof OperationError);
      assert.equal(err.code, 'NEEDS_CLARIFICATION');
      assert.equal(err.fieldErrors?.widget_id, 'ambiguous_target');
      return true;
    },
  );

  // 2. Unknown widget ID asks for clarification
  await assert.rejects(
    async () => {
      await service.updateDashboardDraft({
        business_id: businessA,
        operations: [
          {
            type: 'move',
            widget_id: 'non-existent-widget-xyz',
            position: 'top',
          },
        ],
      });
    },
    (err) => {
      assert.ok(err instanceof OperationError);
      assert.equal(err.code, 'NEEDS_CLARIFICATION');
      assert.equal(err.fieldErrors?.widget_id, 'ambiguous_target');
      return true;
    },
  );

  // 3. Omitted widget target with multiple widgets and no selection asks for clarification
  await assert.rejects(
    async () => {
      await service.updateDashboardDraft({
        business_id: businessA,
        selected_widget_id: null,
        operations: [
          {
            type: 'resize',
            w: 8,
            h: 6,
          },
        ],
      });
    },
    (err) => {
      assert.ok(err instanceof OperationError);
      assert.equal(err.code, 'NEEDS_CLARIFICATION');
      assert.equal(err.fieldErrors?.widget_id, 'ambiguous_target');
      return true;
    },
  );
});

test('TASK-26-03 domain: max 20 widgets rule is strictly enforced', async () => {
  const service = new DashboardService(createMockPool());

  // Initial has 5 widgets, add 15 more -> 20 widgets
  const addOps = Array.from({ length: 15 }, (_, i) => ({
    type: 'add',
    widget: {
      id: `w-${i}`,
      type: 'kpi',
      title: `KPI ${i}`,
      metric: 'units',
    },
  }));

  const draft = await service.updateDashboardDraft({
    business_id: businessA,
    operations: addOps,
  });
  assert.equal(draft.widgets.length, 20);

  // 21st widget must be rejected with VALIDATION_ERROR
  await assert.rejects(
    async () => {
      await service.updateDashboardDraft({
        business_id: businessA,
        operations: [
          {
            type: 'add',
            widget: {
              id: 'w-too-many',
              type: 'kpi',
              title: 'Excess KPI',
              metric: 'revenue',
            },
          },
        ],
      });
    },
    (err) => {
      assert.ok(err instanceof OperationError);
      assert.equal(err.code, 'VALIDATION_ERROR');
      assert.equal(err.fieldErrors?.widgets, 'max 20 widgets');
      return true;
    },
  );
});

test('TASK-26-03 domain: tenant isolation prevents cross-business draft leakage', async () => {
  const service = new DashboardService(createMockPool());

  await service.updateDashboardDraft({
    business_id: businessA,
    operations: [
      {
        type: 'add',
        widget: { id: 'tenant-a-widget', type: 'kpi', title: 'Tenant A Secret', metric: 'revenue' },
      },
    ],
  });

  const draftA = await service.getDashboardDraft(businessA);
  const draftB = await service.getDashboardDraft(businessB);

  assert.ok(draftA);
  assert.equal(draftA.widgets.some((w) => w.id === 'tenant-a-widget'), true);
  assert.equal(draftB, null);
});
