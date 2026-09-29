import pg from 'pg';
import { createApp } from './app.ts';
import { createLocalDemoAuthAdapter } from './localDemoAuth.ts';
import { SessionAuthService } from './sessionAuth.ts';

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';
const databaseUrl = process.env.DATABASE_URL || 'postgresql://postgres:***@localhost:5432/easyledger';

const pool = new pg.Pool({ connectionString: databaseUrl });
const sessionAuth = new SessionAuthService();
const localDemoAuth = createLocalDemoAuthAdapter({
  environment: process.env.NODE_ENV,
  enabled: process.env.EASYLEDGER_LOCAL_DEMO_ENABLED === 'true',
  userId: process.env.EASYLEDGER_LOCAL_DEMO_USER_ID,
});
const authAdapter = sessionAuth.createAuthenticationAdapter(localDemoAuth);

const app = createApp({
  pool,
  authAdapter,
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
