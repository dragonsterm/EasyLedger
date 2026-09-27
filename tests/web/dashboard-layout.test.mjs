import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createAppendedDashboardLayoutItem,
  createDashboardWidget,
  createInitialDashboardLayout,
  createInitialDashboardWidgets,
  createUniqueDashboardWidgetId,
  dashboardWidgetOptions,
  normalizeDashboardLayout,
  removeDashboardLayoutItem,
} from '../../apps/web/src/dashboardLayout.ts';

test('the five add choices create the expected widget definitions', () => {
  assert.equal(dashboardWidgetOptions.length, 5);
  assert.equal(new Set(dashboardWidgetOptions.map((option) => option.kind)).size, 5);
  assert.deepEqual(createInitialDashboardWidgets().map((widget) => widget.kind), [
    'revenue-kpi', 'units-kpi', 'complete-days', 'daily-revenue', 'product-sales',
  ]);

  const duplicate = createDashboardWidget('daily-revenue', 'added-widget-2', 2);
  assert.equal(duplicate.title, 'Daily revenue (2)');
  assert.equal(duplicate.type, 'Line chart');
  assert.equal(duplicate.metric, 'Revenue');
});

test('widget IDs skip any existing values and advance the local sequence', () => {
  assert.deepEqual(createUniqueDashboardWidgetId(['added-widget-1', 'added-widget-2'], 1), {
    id: 'added-widget-3',
    nextSequence: 4,
  });
  assert.throws(() => createUniqueDashboardWidgetId([], 0), /positive integer/);
  assert.throws(() => createUniqueDashboardWidgetId([], Number.MAX_SAFE_INTEGER), /sequence is exhausted/);
});

test('the initial desktop layout fits twelve columns without overlapping widgets', () => {
  const widgets = createInitialDashboardWidgets();
  const layout = createInitialDashboardLayout();
  assert.deepEqual(layout.map((item) => item.i), widgets.map((widget) => widget.id));
  for (const item of layout) {
    assert.ok(item.x >= 0 && item.y >= 0);
    assert.ok(item.w > 0 && item.h > 0);
    assert.ok(item.x + item.w <= 12);
  }
  for (let leftIndex = 0; leftIndex < layout.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < layout.length; rightIndex += 1) {
      const left = layout[leftIndex];
      const right = layout[rightIndex];
      const overlaps = left.x < right.x + right.w
        && left.x + left.w > right.x
        && left.y < right.y + right.h
        && left.y + left.h > right.y;
      assert.equal(overlaps, false, `${left.i} overlaps ${right.i}`);
    }
  }
});

test('the last widget can be removed and a widget can be added to the empty draft', () => {
  const initial = createInitialDashboardLayout();
  const empty = initial.reduce((remaining, item) => removeDashboardLayoutItem(remaining, item.i), initial);
  assert.deepEqual(empty, []);

  const addedWidget = createDashboardWidget('product-sales', 'added-widget-1');
  const restored = createAppendedDashboardLayoutItem(empty, addedWidget);
  assert.deepEqual(restored, { i: 'added-widget-1', x: 0, y: 0, w: 6, h: 10, minW: 5, minH: 10 });
});

test('layout normalization clamps invalid bounds and removes stale or duplicate entries', () => {
  const normalized = normalizeDashboardLayout([
    { i: 'kept', x: 10, y: -2, w: 6, h: 0, minW: 4, minH: 2 },
    { i: 'removed', x: 0, y: 0, w: 4, h: 5 },
    { i: 'kept', x: 1, y: 1, w: 3, h: 3 },
  ], ['kept', 'missing']);

  assert.equal(normalized.length, 1);
  assert.deepEqual(
    { id: normalized[0].i, x: normalized[0].x, y: normalized[0].y, w: normalized[0].w, h: normalized[0].h },
    { id: 'kept', x: 6, y: 0, w: 6, h: 2 },
  );
  assert.throws(() => normalizeDashboardLayout([], [], 0), /positive integer/);
});
