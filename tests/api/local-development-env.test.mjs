import test from 'node:test';
import assert from 'node:assert/strict';

import { configureLocalDevelopmentEnvironment } from '../../apps/api/localDevelopmentEnvironment.mjs';
import { createLocalDemoAuthAdapter } from '../../apps/api/localDemoAuth.ts';

const demoOwner = '00000000-0000-4000-8000-000000000101';

test('the explicit development entry point defaults to the seeded loopback demo owner', () => {
  const environment = configureLocalDevelopmentEnvironment({ EASYLEDGER_LOCAL_DEMO_ENABLED: 'false' });
  assert.equal(environment.NODE_ENV, 'development');
  assert.equal(environment.EASYLEDGER_LOCAL_DEMO_ENABLED, 'true');
  assert.equal(environment.EASYLEDGER_LOCAL_DEMO_USER_ID, demoOwner);

  const auth = createLocalDemoAuthAdapter({
    environment: environment.NODE_ENV,
    enabled: environment.EASYLEDGER_LOCAL_DEMO_ENABLED === 'true',
    userId: environment.EASYLEDGER_LOCAL_DEMO_USER_ID,
  });
  assert.ok(auth);
  assert.deepEqual(auth({ raw: { socket: { remoteAddress: '127.0.0.1' } }, headers: { host: 'localhost:5173' } }), { userId: demoOwner });
});

test('development demo can be explicitly disabled and production never inherits it', () => {
  const disabled = configureLocalDevelopmentEnvironment({
    NODE_ENV: 'development',
    EASYLEDGER_LOCAL_DEMO_DISABLED: 'true',
  });
  assert.equal(disabled.EASYLEDGER_LOCAL_DEMO_ENABLED, 'false');

  const production = configureLocalDevelopmentEnvironment({
    NODE_ENV: 'production',
    EASYLEDGER_LOCAL_DEMO_ENABLED: 'true',
    EASYLEDGER_LOCAL_DEMO_USER_ID: demoOwner,
  });
  assert.equal(production.EASYLEDGER_LOCAL_DEMO_ENABLED, 'false');
  assert.equal(createLocalDemoAuthAdapter({
    environment: production.NODE_ENV,
    enabled: production.EASYLEDGER_LOCAL_DEMO_ENABLED === 'true',
    userId: production.EASYLEDGER_LOCAL_DEMO_USER_ID,
  }), undefined);
});
