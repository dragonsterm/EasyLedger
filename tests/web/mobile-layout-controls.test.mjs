import test from 'node:test';
import assert from 'node:assert/strict';

import {
  moveDashboardLayoutItem,
  canMoveDashboardLayoutItem,
  applyLayoutSizePreset,
  createInitialDashboardLayout,
  createInitialDashboardWidgets,
} from '../../apps/web/src/dashboardLayout.ts';

test('TASK-26-02: vertical layout reordering (Move Up / Move Down) swaps positions in draft', () => {
  const layout = createInitialDashboardLayout();
  assert.ok(layout.length >= 3);

  const top = layout[0]; // total-revenue at y=0
  assert.equal(top.y, 0);

  // Can move down from top
  const canDown = canMoveDashboardLayoutItem(layout, top.i, 'down');
  assert.equal(canDown, true);

  // Move down to next row
  const movedDown = moveDashboardLayoutItem(layout, top.i, 'down');
  const updatedTop = movedDown.find((item) => item.i === top.i);
  assert.ok(updatedTop.y > 0);

  // Move back up to top row
  const movedUp = moveDashboardLayoutItem(movedDown, top.i, 'up');
  const restoredTop = movedUp.find((item) => item.i === top.i);
  assert.equal(restoredTop.y, 0);
});

test('TASK-26-02: vertical boundary checks prevent moving up at top or down at bottom', () => {
  const layout = createInitialDashboardLayout();
  const sorted = [...layout].sort((a, b) => a.y - b.y || a.x - b.x);
  const topWidget = sorted[0];
  const bottomWidget = sorted[sorted.length - 1];

  assert.equal(canMoveDashboardLayoutItem(layout, topWidget.i, 'up'), false);
  assert.equal(canMoveDashboardLayoutItem(layout, bottomWidget.i, 'down'), false);
});

test('TASK-26-02: size presets (compact, standard, expanded) apply appropriate dimensions for touch/mobile', () => {
  const layout = createInitialDashboardLayout();

  // Test KPI card preset application
  const kpiItem = layout.find((item) => item.i === 'total-revenue');
  assert.ok(kpiItem);

  const compactKpi = applyLayoutSizePreset(layout, kpiItem.i, 'compact', 12);
  const updatedCompactKpi = compactKpi.find((item) => item.i === kpiItem.i);
  assert.equal(updatedCompactKpi.w, 3);
  assert.equal(updatedCompactKpi.h, 4);

  const expandedKpi = applyLayoutSizePreset(layout, kpiItem.i, 'expanded', 12);
  const updatedExpandedKpi = expandedKpi.find((item) => item.i === kpiItem.i);
  assert.equal(updatedExpandedKpi.w, 6);
  assert.equal(updatedExpandedKpi.h, 6);

  // Test Chart card preset application
  const chartItem = layout.find((item) => item.i === 'daily-revenue');
  assert.ok(chartItem);

  const expandedChart = applyLayoutSizePreset(layout, chartItem.i, 'expanded', 12);
  const updatedExpandedChart = expandedChart.find((item) => item.i === chartItem.i);
  assert.equal(updatedExpandedChart.w, 12); // Full width
  assert.equal(updatedExpandedChart.h, 14);

  const compactChart = applyLayoutSizePreset(layout, chartItem.i, 'compact', 12);
  const updatedCompactChart = compactChart.find((item) => item.i === chartItem.i);
  assert.equal(updatedCompactChart.w, 6);
  assert.equal(updatedCompactChart.h, 8);
});
