import { readFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');
const projectRoot = resolve(__dirname, '..');

const migrationObjects = {
  '001_initial_schema.sql': {
    columns: {
      businesses: ['id', 'owner_user_id', 'name', 'currency', 'timezone', 'is_demo', 'ledger_revision', 'created_at'],
      products: ['id', 'business_id', 'name', 'name_normalized', 'aliases', 'active', 'default_unit_price', 'created_at', 'updated_at'],
      operations: ['id', 'business_id', 'idempotency_key', 'payload_hash', 'status', 'result_receipt', 'actor_user_id', 'undo_of_operation_id', 'created_at', 'completed_at'],
      sales: ['id', 'business_id', 'product_id', 'quantity', 'unit_price', 'sale_date', 'version', 'voided', 'created_at', 'updated_at'],
      sale_revisions: ['id', 'business_id', 'sale_id', 'operation_id', 'before_values', 'after_values', 'actor_user_id', 'reason', 'created_at'],
      day_coverages: ['business_id', 'local_date', 'state', 'version', 'updated_at'],
      coverage_revisions: ['id', 'business_id', 'local_date', 'operation_id', 'before_state', 'after_state', 'actor_user_id', 'created_at'],
      proposals: ['id', 'business_id', 'session_id', 'normalized_payload', 'payload_hash', 'status', 'expires_at', 'base_ledger_revision', 'confirmation_token_hash', 'created_at'],
      dashboards: ['id', 'business_id', 'name', 'schema_version', 'version', 'widgets', 'layout', 'created_at', 'updated_at'],
    },
    indexes: ['sales_business_date_idx', 'sales_business_product_date_idx', 'sale_revisions_sale_created_idx', 'coverage_revisions_day_created_idx', 'operations_business_created_idx', 'proposals_business_status_idx', 'dashboards_business_version_idx'],
    functions: ['prevent_revision_mutation', 'prevent_business_currency_change'],
    triggers: ['businesses_currency_immutable', 'sale_revisions_append_only', 'coverage_revisions_append_only'],
  },
  '002_product_versions.sql': { columns: { products: ['version'] } },
  '003_voice_sessions.sql': {
    columns: { voice_sessions: ['id', 'business_id', 'actor_user_id', 'session_token_hash', 'provider_session_id', 'selected_dashboard_id', 'expires_at', 'created_at'] },
    indexes: ['voice_sessions_business_token_idx'],
  },
  '004_users_and_accounts.sql': {
    columns: { users: ['id', 'email', 'name', 'role', 'created_at', 'updated_at'] },
    demoUser: '00000000-0000-4000-8000-000000000101',
  },
  '005_password_sessions.sql': {
    columns: {
      users: ['username', 'password_hash'],
      auth_sessions: ['token_hash', 'user_id', 'business_id', 'created_at', 'expires_at'],
    },
    indexes: ['users_username_lower_unique', 'users_email_lower_unique', 'auth_sessions_user_expiry_idx'],
    constraints: ['users_username_not_blank', 'users_password_hash_shape'],
  },
};

async function schemaSnapshot(client) {
  const [columnResult, indexResult, routineResult, triggerResult, constraintResult] = await Promise.all([
    client.query("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = current_schema()"),
    client.query("SELECT indexname FROM pg_indexes WHERE schemaname = current_schema()"),
    client.query("SELECT routine_name FROM information_schema.routines WHERE routine_schema = current_schema() AND routine_type = 'FUNCTION'"),
    client.query("SELECT trigger_name FROM information_schema.triggers WHERE trigger_schema = current_schema()"),
    client.query("SELECT constraint_name FROM information_schema.table_constraints WHERE constraint_schema = current_schema()"),
  ]);
  const columns = new Map();
  for (const row of columnResult.rows) {
    if (!columns.has(row.table_name)) columns.set(row.table_name, new Set());
    columns.get(row.table_name).add(row.column_name);
  }
  return {
    columns,
    indexes: new Set(indexResult.rows.map((row) => row.indexname)),
    functions: new Set(routineResult.rows.map((row) => row.routine_name)),
    triggers: new Set(triggerResult.rows.map((row) => row.trigger_name)),
    constraints: new Set(constraintResult.rows.map((row) => row.constraint_name)),
  };
}

function migrationSchemaSatisfied(version, snapshot) {
  const expected = migrationObjects[version];
  if (!expected) return false;
  for (const [table, columnNames] of Object.entries(expected.columns ?? {})) {
    const actual = snapshot.columns.get(table);
    if (!actual || columnNames.some((name) => !actual.has(name))) return false;
  }
  for (const name of expected.indexes ?? []) if (!snapshot.indexes.has(name)) return false;
  for (const name of expected.functions ?? []) if (!snapshot.functions.has(name)) return false;
  for (const name of expected.triggers ?? []) if (!snapshot.triggers.has(name)) return false;
  for (const name of expected.constraints ?? []) if (!snapshot.constraints.has(name)) return false;
  return true;
}

function migrationHasPartialObjects(version, snapshot) {
  const expected = migrationObjects[version];
  if (!expected) return false;
  if (version === '002_product_versions.sql') return false;
  if (version === '005_password_sessions.sql') {
    return Boolean(snapshot.columns.get('users')?.has('username')
      || snapshot.columns.get('users')?.has('password_hash')
      || snapshot.columns.has('auth_sessions')
      || (expected.indexes ?? []).some((name) => snapshot.indexes.has(name))
      || (expected.constraints ?? []).some((name) => snapshot.constraints.has(name)));
  }
  return Object.keys(expected.columns ?? {}).some((table) => snapshot.columns.has(table))
    || [...(expected.indexes ?? []), ...(expected.functions ?? []), ...(expected.triggers ?? []), ...(expected.constraints ?? [])]
      .some((name) => snapshot.indexes.has(name) || snapshot.functions.has(name) || snapshot.triggers.has(name) || snapshot.constraints.has(name));
}

async function recordMigration(client, version) {
  await client.query('INSERT INTO _schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING', [version]);
}

function stripTransactionWrapper(sql) {
  return sql
    .replace(/^\s*BEGIN\s*;\s*/i, '')
    .replace(/\s*COMMIT\s*;\s*$/i, '');
}

/**
 * EasyLedger Automated Database Migration & Seeder Runner
 * Designed for Render cloud deployment lifecycle:
 * - Sequentially executes all db/migrations/*.sql inside an atomic transaction
 * - Seeds demo merchant catalog (db/seed/001_demo_catalog.sql) if empty
 * - Verifies database connectivity and essential table existence
 */

export async function runDatabaseMigrations(pool) {
  const migrationsDir = join(projectRoot, 'db', 'migrations');
  const seedDir = join(projectRoot, 'db', 'seed');

  const files = await readdir(migrationsDir);
  const sqlFiles = files.filter((f) => f.endsWith('.sql')).sort();

  console.log(`[db:migrate] Found ${sqlFiles.length} migration files in ${migrationsDir}`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create migrations tracker table if not exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS _schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const { rows: appliedRows } = await client.query('SELECT version FROM _schema_migrations');
    const appliedSet = new Set(appliedRows.map((r) => r.version));

    // Some earlier local setups created migrations 001–003 directly without
    // the migration ledger. Baseline only a schema that satisfies every
    // required object and column; a partial schema is left untouched and
    // fails with an actionable error instead of rerunning CREATE TABLE.
    const legacySnapshot = await schemaSnapshot(client);
    if (legacySnapshot.columns.has('businesses') && !appliedSet.has('001_initial_schema.sql')) {
      if (!migrationSchemaSatisfied('001_initial_schema.sql', legacySnapshot)) {
        throw new Error('Untracked EasyLedger schema is incomplete for 001_initial_schema.sql; refusing to alter existing tables.');
      }
      await recordMigration(client, '001_initial_schema.sql');
      appliedSet.add('001_initial_schema.sql');
      console.log('[db:migrate] Verified and recorded existing schema for 001_initial_schema.sql.');
    } else if (!legacySnapshot.columns.has('businesses') && migrationHasPartialObjects('001_initial_schema.sql', legacySnapshot)) {
      throw new Error('Partial untracked EasyLedger schema found; refusing to apply 001_initial_schema.sql.');
    }
    for (const version of ['002_product_versions.sql', '003_voice_sessions.sql']) {
      if (appliedSet.has(version) || !migrationSchemaSatisfied(version, legacySnapshot)) continue;
      await recordMigration(client, version);
      appliedSet.add(version);
      console.log(`[db:migrate] Verified and recorded existing schema for ${version}.`);
    }
    if (migrationHasPartialObjects('003_voice_sessions.sql', legacySnapshot)
      && !migrationSchemaSatisfied('003_voice_sessions.sql', legacySnapshot)
      && !appliedSet.has('003_voice_sessions.sql')) {
      throw new Error('Untracked voice_sessions schema is incomplete for 003_voice_sessions.sql; refusing to alter it.');
    }

    for (const sqlFile of sqlFiles) {
      if (appliedSet.has(sqlFile)) {
        console.log(`[db:migrate] Skipping already applied: ${sqlFile}`);
        continue;
      }

      let snapshot = await schemaSnapshot(client);
      let alreadySatisfied = migrationSchemaSatisfied(sqlFile, snapshot);
      if (sqlFile === '004_users_and_accounts.sql' && alreadySatisfied) {
        const demoUser = await client.query('SELECT 1 FROM users WHERE id = $1', [migrationObjects[sqlFile].demoUser]);
        alreadySatisfied = demoUser.rowCount > 0;
      }
      if (alreadySatisfied) {
        await recordMigration(client, sqlFile);
        appliedSet.add(sqlFile);
        console.log(`[db:migrate] Verified and recorded existing schema for ${sqlFile}.`);
        continue;
      }
      if (migrationHasPartialObjects(sqlFile, snapshot)) {
        throw new Error(`Existing schema is incomplete for ${sqlFile}; refusing to rerun it over existing objects.`);
      }

      console.log(`[db:migrate] Applying: ${sqlFile}...`);
      const sqlContent = await readFile(join(migrationsDir, sqlFile), 'utf8');
      await client.query(stripTransactionWrapper(sqlContent));
      await client.query('INSERT INTO _schema_migrations (version) VALUES ($1)', [sqlFile]);
      appliedSet.add(sqlFile);
      console.log(`[db:migrate] Successfully applied: ${sqlFile}`);
    }

    // Seed demo catalog if businesses table is empty or demo business missing
    const { rows: demoRows } = await client.query(
      "SELECT id FROM businesses WHERE id = '00000000-0000-4000-8000-000000000001' LIMIT 1"
    );

    if (demoRows.length === 0) {
      console.log('[db:migrate] Seeding initial demo catalog and business...');
      const seedContent = await readFile(join(seedDir, '001_demo_catalog.sql'), 'utf8');
      await client.query(stripTransactionWrapper(seedContent));
      console.log('[db:migrate] Demo catalog seed completed successfully.');
    } else {
      console.log('[db:migrate] Demo catalog already present.');
    }

    await client.query('COMMIT');
    console.log('[db:migrate] All migrations and seeding successfully committed.');
    return { success: true, appliedCount: sqlFiles.length };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[db:migrate] Migration failed, transaction rolled back:', err);
    throw err;
  } finally {
    client.release();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const databaseUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/easyledger';
  console.log('[db:migrate] Connecting to database...');
  const pool = new pg.Pool({ connectionString: databaseUrl });

  runDatabaseMigrations(pool)
    .then(() => {
      console.log('[db:migrate] Migration process finished cleanly.');
      return pool.end();
    })
    .catch((err) => {
      console.error('[db:migrate] Migration runner encountered error:', err.message);
      pool.end().finally(() => process.exit(1));
    });
}
