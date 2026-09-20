import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const migration = await readFile(path.join(root, 'db/migrations/001_initial_schema.sql'), 'utf8');
const seed = await readFile(path.join(root, 'db/seed/001_demo_catalog.sql'), 'utf8');

test('migration defines every Day 20 logical relation with tenant ownership', () => {
  for (const table of [
    'businesses',
    'products',
    'sales',
    'sale_revisions',
    'day_coverages',
    'coverage_revisions',
    'operations',
    'proposals',
    'dashboards',
  ]) {
    assert.match(migration, new RegExp(`CREATE TABLE ${table}\\b`));
  }

  for (const table of [
    'products',
    'sales',
    'sale_revisions',
    'day_coverages',
    'coverage_revisions',
    'operations',
    'proposals',
    'dashboards',
  ]) {
    const tableStart = migration.indexOf(`CREATE TABLE ${table}`);
    const nextTable = migration.indexOf('CREATE TABLE ', tableStart + 1);
    const definition = migration.slice(tableStart, nextTable === -1 ? undefined : nextTable);
    assert.match(definition, /business_id UUID NOT NULL/);
  }
});

test('migration enforces exact money, quantity, ownership, and append-only invariants', () => {
  assert.match(migration, /unit_price BIGINT/);
  assert.match(migration, /quantity INTEGER NOT NULL CHECK \(quantity > 0 AND quantity <= 1000000\)/);
  assert.match(migration, /unit_price IS NULL OR \(unit_price >= 0 AND unit_price <= 1000000000\)/);
  assert.match(migration, /UNIQUE \(business_id, name_normalized\)/);
  assert.match(migration, /FOREIGN KEY \(product_id, business_id\)[\s\S]+REFERENCES products \(id, business_id\)/);
  assert.match(migration, /FOREIGN KEY \(sale_id, business_id\)[\s\S]+REFERENCES sales \(id, business_id\)/);
  assert.match(migration, /FOREIGN KEY \(operation_id, business_id\)[\s\S]+REFERENCES operations \(id, business_id\)/);
  assert.match(migration, /currency TEXT NOT NULL DEFAULT 'IDR' CHECK \(currency IN \('IDR', 'USD'\)\)/);
  assert.match(migration, /owner_user_id TEXT NOT NULL/);
  assert.match(migration, /regexp_replace\(btrim\(name\), '\\s\+', ' ', 'g'\)/);
  assert.match(migration, /UNIQUE \(business_id, name_normalized\)/);
  assert.doesNotMatch(migration, /UNIQUE \(name_normalized\)/);
  assert.match(migration, /state TEXT NOT NULL DEFAULT 'open' CHECK \(state IN \('open', 'complete'\)\)/);
  assert.match(migration, /businesses_currency_immutable/);
  assert.match(migration, /ON DELETE RESTRICT/);
  assert.match(migration, /prevent_revision_mutation/);
  assert.doesNotMatch(migration, /DOUBLE PRECISION|REAL|FLOAT|IF NOT EXISTS/);
});

test('demo seed is synthetic, labeled, and idempotent', () => {
  assert.match(seed, /is_demo\s*\)\s*VALUES[\s\S]+TRUE/i);
  assert.match(seed, /Orange Juice/);
  assert.match(seed, /Mango Juice/);
  assert.match(seed, /15000/);
  assert.match(seed, /18000/);
  assert.match(seed, /ON CONFLICT/);
});
