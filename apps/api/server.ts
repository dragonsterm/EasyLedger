import pg from 'pg';
import { createApp } from './app.ts';
import { SessionAuthService } from './sessionAuth.ts';

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required. Copy .env.example to .env and set your local PostgreSQL URL.');

const pool = new pg.Pool({ connectionString: databaseUrl });
const sessionAuth = new SessionAuthService(pool);

const app = createApp({
  pool,
  sessionAuth,
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
