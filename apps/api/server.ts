import pg from 'pg';
import { createApp } from './app.ts';

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';
const databaseUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/easyledger';

const pool = new pg.Pool({ connectionString: databaseUrl });

const app = createApp({
  pool,
  assemblyApiKey: process.env.ASSEMBLYAI_API_KEY,
  logger: true,
});

try {
  await app.listen({ port, host });
  console.log(`EasyLedger API server listening on http://${host}:${port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
