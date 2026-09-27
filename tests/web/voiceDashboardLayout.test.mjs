import test from 'node:test';
import assert from 'node:assert/strict';

import { mapVoiceDashboardDraft } from '../../apps/web/src/dashboardLayout.ts';

test('server dashboard drafts map supported widgets, titles, removals, additions, movement and size into the canvas', () => {
  const first = mapVoiceDashboardDraft({
    widgets: [
      { id: 'revenue', type: 'kpi', metric: 'revenue', dimension: 'none', title: 'Revenue this week' },
      { id: 'daily', type: 'line', metric: 'revenue', dimension: 'date', title: 'Revenue by day' },
    ],
    layout: [
      { i: 'revenue', x: 0, y: 0, w: 4, h: 5 },
      { i: 'daily', x: 4, y: 1, w: 8, h: 11 },
    ],
  });
  assert.deepEqual(first.widgets.map(({ id, kind, title }) => ({ id, kind, title })), [
    { id: 'revenue', kind: 'revenue-kpi', title: 'Revenue this week' },
    { id: 'daily', kind: 'daily-revenue', title: 'Revenue by day' },
  ]);
  assert.deepEqual(first.layout.map(({ i, x, y, w, h }) => ({ i, x, y, w, h })), [
    { i: 'revenue', x: 0, y: 0, w: 4, h: 5 },
    { i: 'daily', x: 4, y: 1, w: 8, h: 11 },
  ]);

  const changed = mapVoiceDashboardDraft({
    widgets: [
      { id: 'daily', type: 'line', metric: 'revenue', dimension: 'date', title: 'Daily revenue revised' },
      { id: 'products', type: 'bar', metric: 'units', dimension: 'product', title: 'Units by product' },
    ],
    layout: [
      { i: 'daily', x: 0, y: 2, w: 12, h: 12 },
      { i: 'products', x: 0, y: 14, w: 8, h: 10 },
      { i: 'removed', x: 8, y: 14, w: 4, h: 5 },
    ],
  });
  assert.deepEqual(changed.widgets.map(({ id, kind }) => ({ id, kind })), [
    { id: 'daily', kind: 'daily-revenue' },
    { id: 'products', kind: 'product-sales' },
  ]);
  assert.deepEqual(changed.layout.map(({ i, x, y, w, h }) => ({ i, x, y, w, h })), [
    { i: 'daily', x: 0, y: 2, w: 12, h: 12 },
    { i: 'products', x: 0, y: 14, w: 8, h: 10 },
  ]);
});

test('unsupported server query shapes are reported instead of rendered with misleading metrics', () => {
  const mapped = mapVoiceDashboardDraft({
    widgets: [
      { id: 'table', type: 'table', metric: 'units', dimension: 'product', title: 'Top sellers table' },
      { id: 'other-line', type: 'line', metric: 'units', dimension: 'date', title: 'Units by day' },
      { id: 'filtered-line', type: 'line', metric: 'revenue', dimension: 'date', title: 'Filtered revenue', filters: { date_from: '2026-09-01' } },
      { id: 'supported-kpi', type: 'kpi', metric: 'units', title: 'Units sold' },
    ],
    layout: [
      { i: 'table', x: 0, y: 0, w: 12, h: 8 },
      { i: 'other-line', x: 0, y: 8, w: 12, h: 8 },
      { i: 'filtered-line', x: 0, y: 8, w: 12, h: 8 },
      { i: 'supported-kpi', x: 0, y: 16, w: 4, h: 5 },
    ],
  });

  assert.deepEqual(mapped.widgets.map(({ id }) => id), ['supported-kpi']);
  assert.deepEqual(mapped.layout.map(({ i }) => i), ['supported-kpi']);
  assert.deepEqual(mapped.unsupportedWidgets.map(({ id }) => id), ['table', 'other-line', 'filtered-line']);
});
