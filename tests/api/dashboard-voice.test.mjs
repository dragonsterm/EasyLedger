import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { createApp } from '../../apps/api/app.ts';

const owner = '00000000-0000-4000-8000-000000000101';
const business = '00000000-0000-4000-8000-000000000001';

function mockPool(dashboards = []) {
  const businesses = [
    {
      id: business,
      name: 'Juice Stall Demo',
      currency: 'IDR',
      timezone: 'Asia/Jakarta',
      ledger_revision: '5',
      owner_user_id: owner,
    },
  ];

  return {
    async query(text, values = []) {
      const sql = String(text);
      if (sql.includes('owner_user_id = $1')) {
        const found = businesses.filter((b) => b.owner_user_id === values[0]);
        return { rows: found, rowCount: found.length };
      }
      if (sql.includes('businesses') && sql.includes('WHERE id = $1')) {
        const found = businesses.filter((b) => b.id === values[0]);
        return { rows: found, rowCount: found.length };
      }
      if (sql.includes('FROM dashboards') && sql.includes('WHERE business_id = $1 AND id = $2')) {
        const found = dashboards.filter((d) => d.business_id === values[0] && d.id === values[1]);
        return { rows: found, rowCount: found.length };
      }
      return { rows: [], rowCount: 0 };
    },
    async connect() {
      throw new Error('mock pool mutation should not be called');
    },
  };
}

test('TASK-26-03: Voice tool update_dashboard updates layout drafts without altering ledger records (FR-12)', async (t) => {
  const pool = mockPool();
  const app = createApp({
    pool,
    authAdapter: () => ({ userId: owner }),
    assemblyTokenGenerator: () => 'mock_token_dash',
  });
  t.after(() => app.close());

  // 1. Unauthenticated call to update_dashboard returns 401
  const unauthRes = await app.inject({
    method: 'POST',
    url: '/api/v1/voice/tools/update_dashboard',
    payload: {
      operations: [{ type: 'add', widget: { title: 'Test Widget', type: 'kpi', metric: 'units' } }],
    },
  });
  assert.equal(unauthRes.statusCode, 401);

  // 2. Create voice session to get ephemeral session token
  const sessionRes = await app.inject({
    method: 'POST',
    url: '/api/v1/voice/sessions',
    payload: {},
  });
  assert.equal(sessionRes.statusCode, 201);
  const sessionToken = sessionRes.json().data.session_token;

  // A first voice read previews the exact default dashboard used by the first
  // update, without creating the REST-visible in-memory draft.
  const initialDraftRes = await app.inject({
    method: 'POST',
    url: '/api/v1/voice/tools/get_dashboard_draft',
    headers: { 'x-session-token': sessionToken },
    payload: {},
  });
  assert.equal(initialDraftRes.statusCode, 200);
  const initialDraft = initialDraftRes.json().data;
  assert.equal(initialDraft.is_draft, true);
  assert.equal(initialDraft.id, 'default');
  assert.deepEqual(initialDraft.widgets.map((widget) => widget.id), [
    'total-revenue', 'total-units', 'complete-days', 'daily-revenue', 'sales-by-product',
  ]);
  assert.deepEqual(initialDraft.layout.map((item) => [item.i, item.x, item.y, item.w, item.h]), [
    ['total-revenue', 0, 0, 4, 5],
    ['total-units', 4, 0, 4, 5],
    ['complete-days', 8, 0, 4, 5],
    ['daily-revenue', 0, 5, 6, 10],
    ['sales-by-product', 6, 5, 6, 10],
  ]);
  assert.equal(initialDraftRes.json().ledger_revision, '5');
  const restDraftBeforeUpdate = await app.inject({ method: 'GET', url: '/api/v1/dashboards/draft' });
  assert.equal(restDraftBeforeUpdate.statusCode, 404);

  // 3. Client-supplied or model-supplied business_id is strictly rejected (422)
  const spoofRes = await app.inject({
    method: 'POST',
    url: '/api/v1/voice/tools/update_dashboard',
    headers: { 'x-session-token': sessionToken },
    payload: {
      business_id: randomUUID(),
      operations: [{ type: 'add', widget: { title: 'Spoofed Widget', type: 'kpi', metric: 'units' } }],
    },
  });
  assert.equal(spoofRes.statusCode, 422);
  assert.equal(spoofRes.json().code, 'VALIDATION_ERROR');

  // 4. Empty operations array is rejected (422)
  const emptyRes = await app.inject({
    method: 'POST',
    url: '/api/v1/voice/tools/update_dashboard',
    headers: { 'x-session-token': sessionToken },
    payload: {
      operations: [],
    },
  });
  assert.equal(emptyRes.statusCode, 422);
  assert.equal(emptyRes.json().code, 'VALIDATION_ERROR');

  // 5. Add a widget via update_dashboard
  const addRes = await app.inject({
    method: 'POST',
    url: '/api/v1/voice/tools/update_dashboard',
    headers: { 'x-session-token': sessionToken },
    payload: {
      operations: [
        {
          type: 'add',
          widget: {
            id: 'widget-profit-kpi',
            type: 'kpi',
            title: 'Profit KPI',
            metric: 'revenue',
          },
        },
      ],
    },
  });
  assert.equal(addRes.statusCode, 200);
  const addBody = addRes.json();
  assert.equal(addBody.status, 'ok');
  assert.equal(addBody.ledger_revision, '5'); // UNCHANGED
  assert.equal(addBody.data.is_draft, true);
  assert.equal(addBody.data.widgets.length, 6);
  assert.deepEqual(addBody.data.widgets.slice(0, 5).map((widget) => widget.id), initialDraft.widgets.map((widget) => widget.id));
  assert.deepEqual(
    addBody.data.layout.slice(0, 5).map((item) => [item.i, item.x, item.y, item.w, item.h]),
    initialDraft.layout.map((item) => [item.i, item.x, item.y, item.w, item.h]),
  );
  assert.equal(addBody.data.selected_widget_id, 'widget-profit-kpi');

  // 6. Edit the widget via dynamic tool route /api/voice/tools/:tool
  const editRes = await app.inject({
    method: 'POST',
    url: '/api/voice/tools/update_dashboard',
    headers: { 'x-session-token': sessionToken },
    payload: {
      operations: [
        {
          type: 'edit',
          widget_id: 'widget-profit-kpi',
          changes: {
            title: 'Updated Gross Profit',
          },
        },
      ],
    },
  });
  assert.equal(editRes.statusCode, 200);
  const editBody = editRes.json();
  assert.equal(editBody.ledger_revision, '5'); // UNCHANGED
  const updatedWidget = editBody.data.widgets.find((w) => w.id === 'widget-profit-kpi');
  assert.equal(updatedWidget.title, 'Updated Gross Profit');

  const getDraftRes = await app.inject({
    method: 'POST',
    url: '/api/v1/voice/tools/get_dashboard_draft',
    headers: { authorization: `Bearer ${sessionToken}` },
    payload: {},
  });
  assert.equal(getDraftRes.statusCode, 200);
  assert.equal(getDraftRes.json().data.widgets.find((w) => w.id === 'widget-profit-kpi').title, 'Updated Gross Profit');

  // 7. Move and Resize via single operation object or operations array
  const moveResizeRes = await app.inject({
    method: 'POST',
    url: '/api/v1/voice/tools/update_dashboard',
    headers: { 'x-session-token': sessionToken },
    payload: {
      operations: [
        { type: 'move', widget_id: 'widget-profit-kpi', position: 'top' },
        { type: 'resize', widget_id: 'widget-profit-kpi', w: 12, h: 6 },
      ],
    },
  });
  assert.equal(moveResizeRes.statusCode, 200);
  const mrBody = moveResizeRes.json();
  assert.equal(mrBody.ledger_revision, '5'); // UNCHANGED
  const mrLayoutItem = mrBody.data.layout.find((l) => l.i === 'widget-profit-kpi');
  assert.equal(mrLayoutItem.y, 0);
  assert.equal(mrLayoutItem.w, 12);
  assert.equal(mrLayoutItem.h, 6);

  // 8. Select widget
  const selectRes = await app.inject({
    method: 'POST',
    url: '/api/v1/voice/tools/update_dashboard',
    headers: { 'x-session-token': sessionToken },
    payload: {
      operation: { type: 'select', widget_id: 'total-units' },
    },
  });
  assert.equal(selectRes.statusCode, 200);
  assert.equal(selectRes.json().data.selected_widget_id, 'total-units');

  // 9. Remove widget
  const removeRes = await app.inject({
    method: 'POST',
    url: '/api/v1/voice/tools/update_dashboard',
    headers: { 'x-session-token': sessionToken },
    payload: {
      operations: [{ type: 'remove', widget_id: 'widget-profit-kpi' }],
    },
  });
  assert.equal(removeRes.statusCode, 200);
  const remBody = removeRes.json();
  assert.equal(remBody.ledger_revision, '5'); // UNCHANGED
  assert.equal(remBody.data.widgets.length, 5);
  assert.equal(remBody.data.widgets.some((w) => w.id === 'widget-profit-kpi'), false);

  // 10. Ambiguity resolution: "that chart" asks for target (FR-12)
  const ambigRes = await app.inject({
    method: 'POST',
    url: '/api/v1/voice/tools/update_dashboard',
    headers: { 'x-session-token': sessionToken },
    payload: {
      operations: [{ type: 'edit', widget_id: 'that chart', changes: { title: 'Ambiguous title' } }],
    },
  });
  assert.equal(ambigRes.statusCode, 422);
  const ambigBody = ambigRes.json();
  assert.equal(ambigBody.code, 'NEEDS_CLARIFICATION');
  assert.equal(ambigBody.field_errors.widget_id, 'ambiguous_target');

  // 11. Ambiguity resolution: omitted target with multiple widgets asks for target
  const noTargetRes = await app.inject({
    method: 'POST',
    url: '/api/v1/voice/tools/update_dashboard',
    headers: { 'x-session-token': sessionToken },
    payload: {
      selected_widget_id: null,
      operations: [{ type: 'resize', w: 8, h: 5 }],
    },
  });
  assert.equal(noTargetRes.statusCode, 422);
  assert.equal(noTargetRes.json().code, 'NEEDS_CLARIFICATION');

  // 12. REST draft endpoint GET /api/v1/dashboards/draft returns the updated draft
  const draftGetRes = await app.inject({
    method: 'GET',
    url: '/api/v1/dashboards/draft',
  });
  assert.equal(draftGetRes.statusCode, 200);
  assert.equal(draftGetRes.json().data.is_draft, true);

  // 13. LEDGER INTEGRITY INVARIANT:
  // Ledger revision remains exactly 5 throughout all layout draft updates
  const finalContextRes = await app.inject({
    method: 'POST',
    url: '/api/v1/voice/tools/get_context',
    headers: { 'x-session-token': sessionToken },
    payload: {},
  });
  assert.equal(finalContextRes.statusCode, 200);
  assert.equal(finalContextRes.json().data.ledger_revision, '5');
});

test('voice get_dashboard_draft previews a tenant-scoped saved dashboard and rejects unavailable IDs', async (t) => {
  const savedId = '00000000-0000-4000-8000-000000000201';
  const foreignId = '00000000-0000-4000-8000-000000000202';
  const foreignBusiness = '00000000-0000-4000-8000-000000000002';
  const savedDashboard = {
    id: savedId,
    business_id: business,
    name: 'Owner dashboard',
    schema_version: 1,
    version: '7',
    widgets: [{ id: 'saved-revenue', type: 'kpi', title: 'Revenue', metric: 'revenue', dimension: 'none' }],
    layout: [{ i: 'saved-revenue', x: 0, y: 0, w: 12, h: 5 }],
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-02-01T00:00:00.000Z',
  };
  const foreignDashboard = { ...savedDashboard, id: foreignId, business_id: foreignBusiness };
  const app = createApp({
    pool: mockPool([savedDashboard, foreignDashboard]),
    authAdapter: () => ({ userId: owner }),
    assemblyTokenGenerator: () => 'mock_token_saved_dashboard',
  });
  t.after(() => app.close());

  const sessionRes = await app.inject({ method: 'POST', url: '/api/v1/voice/sessions', payload: {} });
  assert.equal(sessionRes.statusCode, 201);
  const sessionToken = sessionRes.json().data.session_token;
  const read = (dashboardId) => app.inject({
    method: 'POST',
    url: '/api/v1/voice/tools/get_dashboard_draft',
    headers: { 'x-session-token': sessionToken },
    payload: { dashboard_id: dashboardId },
  });

  const savedRes = await read(savedId);
  assert.equal(savedRes.statusCode, 200);
  assert.deepEqual(savedRes.json().data, {
    ...savedDashboard,
    is_draft: true,
    selected_widget_id: null,
  });
  const restSavedDraft = await app.inject({ method: 'GET', url: `/api/v1/dashboards/${savedId}/draft` });
  assert.equal(restSavedDraft.statusCode, 404);

  const missingRes = await read('00000000-0000-4000-8000-000000000299');
  assert.equal(missingRes.statusCode, 404);
  const crossTenantRes = await read(foreignId);
  assert.equal(crossTenantRes.statusCode, 404);
  const malformedRes = await read('not-a-dashboard-id');
  assert.equal(malformedRes.statusCode, 422);

  const unauthenticatedRes = await app.inject({
    method: 'POST',
    url: '/api/v1/voice/tools/get_dashboard_draft',
    payload: { dashboard_id: savedId },
  });
  assert.equal(unauthenticatedRes.statusCode, 401);
});
