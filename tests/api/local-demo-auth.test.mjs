import test from 'node:test';
import assert from 'node:assert/strict';

import { createLocalDemoAuthAdapter } from '../../apps/api/localDemoAuth.ts';

const demoOwner = '00000000-0000-4000-8000-000000000101';

function request(remoteAddress, host = 'localhost:3000') {
  return {
    raw: { socket: { remoteAddress } },
    headers: { host },
  };
}

test('local demo auth is opt-in, development-only, and restricted to loopback requests', () => {
  assert.equal(createLocalDemoAuthAdapter({ environment: 'development', enabled: false, userId: demoOwner }), undefined);
  assert.equal(createLocalDemoAuthAdapter({ environment: 'production', enabled: true, userId: demoOwner }), undefined);
  assert.equal(createLocalDemoAuthAdapter({ environment: 'development', enabled: true, userId: 'not-a-user-id' }), undefined);

  const auth = createLocalDemoAuthAdapter({ environment: 'development', enabled: true, userId: demoOwner });
  assert.ok(auth);
  assert.deepEqual(auth(request('127.0.0.1')), { userId: demoOwner });
  assert.deepEqual(auth(request('::1', '[::1]:3000')), { userId: demoOwner });
  assert.equal(auth(request('192.168.1.20')), null);
  assert.equal(auth(request('127.0.0.1', 'ledger.example.com')), null);
});
