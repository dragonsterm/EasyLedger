import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');
const projectRoot = resolve(__dirname, '../..');

test('TASK-29-01: render.yaml contains valid three-tier deployment configuration (ADR-011)', async () => {
  const yamlContent = await readFile(join(projectRoot, 'render.yaml'), 'utf8');

  // Verify database tier
  assert.match(yamlContent, /name:\s*easyledger-postgres/);
  assert.match(yamlContent, /region:\s*singapore/);

  // Verify API web service tier
  assert.match(yamlContent, /name:\s*easyledger-api/);
  assert.match(yamlContent, /healthCheckPath:\s*\/health/);
  assert.match(yamlContent, /buildCommand:\s*npm ci && node scripts\/migrate-db\.mjs/);
  assert.match(yamlContent, /startCommand:\s*node apps\/api\/server\.ts/);
  assert.match(yamlContent, /DATABASE_URL/);
  assert.match(yamlContent, /ASSEMBLYAI_API_KEY/);

  // Verify web static site tier
  assert.match(yamlContent, /name:\s*easyledger-web/);
  assert.match(yamlContent, /rootDir:\s*apps\/web/);
  assert.match(yamlContent, /buildCommand:\s*npm ci && npm run build/);
  assert.match(yamlContent, /staticPublishPath:\s*dist/);
  assert.match(yamlContent, /destination:\s*\/index\.html/); // SPA routing rewrite
  assert.match(yamlContent, /microphone=\(self\)/); // Audio microphone permission policy
});

test('TASK-29-01: Dockerfile builds multi-stage non-root container with healthcheck probe', async () => {
  const dockerContent = await readFile(join(projectRoot, 'Dockerfile'), 'utf8');

  assert.match(dockerContent, /FROM node:22-alpine AS builder/);
  assert.match(dockerContent, /FROM node:22-alpine AS runner/);
  assert.match(dockerContent, /USER node/);
  assert.match(dockerContent, /HEALTHCHECK/);
  assert.match(dockerContent, /CMD \["node", "apps\/api\/server\.ts"\]/);
});

test('TASK-29-01: migration script runner applies schema and idempotent demo seed in atomic transaction', async () => {
  const { runDatabaseMigrations } = await import('../../scripts/migrate-db.mjs');
  assert.equal(typeof runDatabaseMigrations, 'function');

  // Mock pool testing migration runner
  const queries = [];
  const mockClient = {
    async query(sql, params) {
      queries.push({ sql: String(sql), params });
      if (sql.includes('SELECT version FROM _schema_migrations')) {
        return { rows: [] };
      }
      if (sql.includes("SELECT id FROM businesses WHERE id = '00000000-0000-4000-8000-000000000001'")) {
        return { rows: [] }; // trigger seed
      }
      return { rows: [], rowCount: 1 };
    },
    release() {},
  };

  const mockPool = {
    async connect() {
      return mockClient;
    },
  };

  const res = await runDatabaseMigrations(mockPool);
  assert.equal(res.success, true);
  assert.ok(res.appliedCount >= 3);

  const sqlStrings = queries.map((q) => q.sql);
  assert.ok(sqlStrings.includes('BEGIN'));
  assert.ok(sqlStrings.includes('COMMIT'));
  assert.ok(sqlStrings.some((s) => s.includes('CREATE TABLE IF NOT EXISTS _schema_migrations')));
  assert.ok(sqlStrings.some((s) => s.includes('INSERT INTO _schema_migrations')));
  assert.ok(sqlStrings.some((s) => s.includes('INSERT INTO businesses')));
});
