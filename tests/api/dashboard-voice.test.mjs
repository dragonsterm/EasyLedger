import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { createApp } from '../../apps/api/app.ts';

const owner = '00000000-0000-4000-8000-000000000101';
const business = '00000000-0000-4000-8000-000000000001';

function mockPool() {
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
