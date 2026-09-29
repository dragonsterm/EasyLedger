import test from 'node:test';
import assert from 'node:assert/strict';

import { configureLocalDevelopmentEnvironment } from '../../apps/api/localDevelopmentEnvironment.mjs';

test('local development never installs an implicit demo identity', () => {
  const environment = configureLocalDevelopmentEnvironment({
    EASYLEDGER_LOCAL_DEMO_ENABLED: 'true',
    EASYLEDGER_LOCAL_DEMO_USER_ID: '00000000-0000-4000-8000-000000000101',
  });
  assert.equal(environment.NODE_ENV, 'development');
  assert.equal(environment.EASYLEDGER_LOCAL_DEMO_ENABLED, 'false');
  assert.equal(environment.EASYLEDGER_LOCAL_DEMO_USER_ID, undefined);
});

test('production and other environments do not inherit a local demo identity', () => {
  const production = configureLocalDevelopmentEnvironment({
    NODE_ENV: 'production',
    EASYLEDGER_LOCAL_DEMO_ENABLED: 'true',
    EASYLEDGER_LOCAL_DEMO_USER_ID: '00000000-0000-4000-8000-000000000101',
  });
  assert.equal(production.EASYLEDGER_LOCAL_DEMO_ENABLED, 'false');
  assert.equal(production.EASYLEDGER_LOCAL_DEMO_USER_ID, undefined);
});
