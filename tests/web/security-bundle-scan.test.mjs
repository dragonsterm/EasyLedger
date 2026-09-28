import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve, join } from 'node:path';
import { scanBundleSecurity, SUSPICIOUS_PATTERNS, FORBIDDEN_CLIENT_IMPORTS } from '../../scripts/scan-bundle-security.mjs';

const projectRoot = resolve(import.meta.dirname, '../..');
const distDir = join(projectRoot, 'apps', 'web', 'dist');
const srcDir = join(projectRoot, 'apps', 'web', 'src');

test('TASK-28-04: production web bundle contains zero credentials, tokens, or private keys', async () => {
  const result = await scanBundleSecurity({ distDir, srcDir });
  assert.equal(result.success, true, `Found security violations: ${JSON.stringify(result.violations, null, 2)}`);
  assert.equal(result.violations.length, 0);
  assert.ok(result.scannedFileCount > 0, 'Expected at least 1 file to be scanned');
});

test('TASK-28-04: scanner correctly detects injected secret leak patterns', () => {
  const fakeAssemblyAiLeak = 'const config = { ASSEMBLYAI_API_KEY: "0123456789abcdef0123456789abcdef" };';
  const fakePostgresUri = 'const uri = "postgresql://merchant_owner:supersecretpass@db.internal:5432/easyledger";';
  const fakePrivateKey = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0...';
  const fakeGenericSecret = 'const env = { DATABASE_URL: "postgres://..." };';

  const aaiRule = SUSPICIOUS_PATTERNS.find((r) => r.id === 'assemblyai_api_key_literal');
  const pgRule = SUSPICIOUS_PATTERNS.find((r) => r.id === 'postgres_connection_uri');
  const keyRule = SUSPICIOUS_PATTERNS.find((r) => r.id === 'private_key_header');
  const secretRule = SUSPICIOUS_PATTERNS.find((r) => r.id === 'generic_api_secret_assignment');

  assert.ok(aaiRule.pattern.test(fakeAssemblyAiLeak));
  assert.ok(pgRule.pattern.test(fakePostgresUri));
  assert.ok(keyRule.pattern.test(fakePrivateKey));
  assert.ok(secretRule.pattern.test(fakeGenericSecret));
});

test('TASK-28-04: client package.json contains zero server database or framework dependencies', async () => {
  const webPkg = JSON.parse(await import('node:fs/promises').then((fs) => fs.readFile(join(projectRoot, 'apps', 'web', 'package.json'), 'utf8')));
  const deps = { ...webPkg.dependencies, ...webPkg.devDependencies };

  for (const forbidden of FORBIDDEN_CLIENT_IMPORTS) {
    assert.equal(forbidden in deps, false, `Client package.json must not depend on server package: ${forbidden}`);
  }
});
