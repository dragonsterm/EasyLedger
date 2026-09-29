import { readFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');
const projectRoot = resolve(__dirname, '..');

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

    for (const sqlFile of sqlFiles) {
      if (appliedSet.has(sqlFile)) {
        console.log(`[db:migrate] Skipping already applied: ${sqlFile}`);
        continue;
      }

      console.log(`[db:migrate] Applying: ${sqlFile}...`);
      const sqlContent = await readFile(join(migrationsDir, sqlFile), 'utf8');
      await client.query(sqlContent);
      await client.query('INSERT INTO _schema_migrations (version) VALUES ($1)', [sqlFile]);
      console.log(`[db:migrate] Successfully applied: ${sqlFile}`);
    }

    // Seed demo catalog if businesses table is empty or demo business missing
    const { rows: demoRows } = await client.query(
      "SELECT id FROM businesses WHERE id = '00000000-0000-4000-8000-000000000001' LIMIT 1"
    );

    if (demoRows.length === 0) {
      console.log('[db:migrate] Seeding initial demo catalog and business...');
      const seedContent = await readFile(join(seedDir, '001_demo_catalog.sql'), 'utf8');
      await client.query(seedContent);
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
