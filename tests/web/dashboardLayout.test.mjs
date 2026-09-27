import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canMoveDashboardLayoutItem,
  createDashboardWidget,
  createInitialDashboardLayout,
  dashboardWidgetKindForType,
  dashboardWidgetKindsForType,
  moveDashboardLayoutItem,
  reconfigureDashboardWidget,
  sanitizeDashboardWidgetTitle,
  updateDashboardLayoutForWidgetKind,
} from '../../apps/web/src/dashboardLayout.ts';

test('editing choices stay within supported dashboard query mappings', () => {
  assert.deepEqual(dashboardWidgetKindsForType('Line chart'), ['daily-revenue']);
  assert.deepEqual(dashboardWidgetKindsForType('Bar chart'), ['product-sales']);
  assert.deepEqual(dashboardWidgetKindsForType('KPI'), ['revenue-kpi', 'units-kpi', 'complete-days']);
  assert.equal(dashboardWidgetKindForType('Line chart', 'Revenue'), 'daily-revenue');
  assert.equal(dashboardWidgetKindForType('Bar chart', 'Units sold'), 'product-sales');
  assert.equal(dashboardWidgetKindForType('KPI', 'Units sold'), 'units-kpi');
  assert.equal(dashboardWidgetKindForType('KPI', 'Day completeness'), 'complete-days');
});

test('changing widget type keeps the unique ID, title, and selected card style', () => {
  const original = { ...createDashboardWidget('daily-revenue', 'daily-revenue'), title: 'Morning revenue', style: 'warm' };
  const updated = reconfigureDashboardWidget(original, 'product-sales');

  assert.equal(updated.id, 'daily-revenue');
  assert.equal(updated.title, 'Morning revenue');
  assert.equal(updated.style, 'warm');
  assert.equal(updated.type, 'Bar chart');
  assert.equal(updated.metric, 'Units sold');
  assert.equal(updated.dimension, 'Product');
});

test('changing widget kind updates a generated title and carries its duplicate ordinal', () => {
  const defaultWidget = createDashboardWidget('revenue-kpi', 'revenue-kpi');
  const defaultUpdated = reconfigureDashboardWidget(defaultWidget, 'daily-revenue');
  assert.equal(defaultUpdated.title, 'Daily revenue');

  const duplicateWidget = createDashboardWidget('revenue-kpi', 'revenue-kpi-2', 2);
  const duplicateUpdated = reconfigureDashboardWidget(duplicateWidget, 'units-kpi');
  assert.equal(duplicateUpdated.title, 'Units sold (2)');

  const customWidget = { ...defaultWidget, title: 'Monday revenue review' };
  assert.equal(reconfigureDashboardWidget(customWidget, 'units-kpi').title, 'Monday revenue review');
});

test('widget titles trim whitespace, restore an empty value, and cap the length', () => {
  assert.equal(sanitizeDashboardWidgetTitle('  Weekly revenue  ', 'Default'), 'Weekly revenue');
  assert.equal(sanitizeDashboardWidgetTitle('   ', 'Default'), 'Default');
  assert.equal(sanitizeDashboardWidgetTitle('x'.repeat(90), 'Default').length, 80);
});

test('position controls swap only an adjacent same-size widget and respect row edges', () => {
  const layout = [
    { i: 'a', x: 0, y: 0, w: 4, h: 5, minW: 3, minH: 5 },
    { i: 'b', x: 4, y: 0, w: 4, h: 5, minW: 3, minH: 5 },
    { i: 'c', x: 8, y: 0, w: 4, h: 5, minW: 3, minH: 5 },
    { i: 'd', x: 0, y: 5, w: 6, h: 10, minW: 5, minH: 10 },
  ];

  assert.equal(canMoveDashboardLayoutItem(layout, 'b', 'left'), true);
  assert.equal(canMoveDashboardLayoutItem(layout, 'b', 'right'), true);
  assert.equal(canMoveDashboardLayoutItem(layout, 'a', 'left'), false);
  assert.equal(canMoveDashboardLayoutItem(layout, 'd', 'right'), false);

  const moved = moveDashboardLayoutItem(layout, 'b', 'right');
  assert.deepEqual(moved.map(({ i, x }) => [i, x]), [['a', 0], ['b', 8], ['c', 4], ['d', 0]]);
  assert.deepEqual(moveDashboardLayoutItem(layout, 'a', 'left'), layout);
});

test('chart conversions grow to chart minimums and resolve collisions while preserving IDs and anchors', () => {
  const original = createInitialDashboardLayout();
  const toChart = updateDashboardLayoutForWidgetKind(original, 'total-revenue', 'revenue-kpi', 'daily-revenue');
  const chart = toChart.find((item) => item.i === 'total-revenue');

  assert.deepEqual(toChart.map((item) => item.i), original.map((item) => item.i));
  assert.ok(chart);
  assert.equal(chart.x, 0);
  assert.equal(chart.y, 0);
  assert.ok(chart.w >= 5);
  assert.ok(chart.h >= 10);
  assert.ok(chart.minW >= 5);
  assert.ok(chart.minH >= 10);
  assertNoOverlaps(toChart);

  const backToKpi = updateDashboardLayoutForWidgetKind(toChart, 'total-revenue', 'daily-revenue', 'revenue-kpi');
  const kpi = backToKpi.find((item) => item.i === 'total-revenue');
  assert.ok(kpi);
  assert.equal(kpi.x, 0);
  assert.equal(kpi.y, 0);
  assert.equal(kpi.w, 4);
  assert.equal(kpi.h, 5);
  assert.equal(kpi.minW, 3);
  assert.equal(kpi.minH, 5);
  assertNoOverlaps(backToKpi);
});

function assertNoOverlaps(layout) {
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
}
