---
title: Implementation handoff and runbook
status: implementation-started
tags: [easyledger, operations, delivery]
---
# Implementation handoff and runbook

## What exists today

Planning notes, the existing Obsidian vault, Graphify artifacts and documentation maintenance scripts exist alongside the implemented Day 20 data foundation, Day 21 mutation service and Day 22 manual ledger API. The repository now contains the initial PostgreSQL migration, product version migration, synthetic catalog seed, exact IDR/USD money module, transactional sale creation, correction and compensating undo, tenant-scoped catalog and sales routes, audited day coverage, plus domain, contract and PostgreSQL checks. The voice provider session, user interface and deployment remain planned. `npm run graph:serve` opens documentation visualization, not EasyLedger.

## Documentation setup

Use Node.js 24 (the verification environment is 24.19.0) and npm. From the repository root, run `npm ci`, `npm run docs:sync`, then `npm run docs:check`. Open the repository folder as an Obsidian vault and select [[docs/00-Home]] or `docs/EasyLedger-Overview.canvas`. Graphify is pinned to 0.18.0 in package/lock files. No API key is needed for deterministic documentation generation.

For the browser graph, run `npm run graph:serve`, then open `http://127.0.0.1:4173`. Stop with Ctrl+C. If the port is occupied, stop the previous graph server or choose a different local port in the maintenance script. `npm run docs:watch` regenerates after canonical note changes while running. If checking reports stale artifacts, regenerate; if links are broken, fix canonical paths first. Do not edit generated graph JSON to conceal a failing check.

## Implemented foundation and proposed structure

- `apps/web`: React frontend, ledger/history, dashboard builder, microphone/session adapter.
- `apps/api`: verified Fastify manual ledger routes with an injected authentication adapter; the authenticated tool gateway, dashboard and analytics services remain planned.
- `packages/domain`: implemented exact money parsing, validation and aggregation plus PostgreSQL-backed sale, catalog and coverage services; `packages/contracts` remains proposed for shared API/widget schemas.
- `db/migrations` and `db/seed`: implemented initial PostgreSQL schema, product version migration and labeled synthetic catalog.
- `tests/domain`, `tests/api` and `tests/database`: implemented Day 20 checks, Day 21 validation and PostgreSQL mutation/concurrency coverage, and Day 22 contract/API/tenant/coverage coverage; voice and browser checks remain planned in [[docs/09-Verification]].

Choose final package manager layout and compatible versions during P1. Do not install the entire application stack merely because it appears here. Frontend and backend can remain in one repository without microservices.

## Implemented Day 21 mutation pipeline

`packages/domain/mutations.ts` exposes a database-backed `OperationService` for normalized ledger mutations. It hashes canonical semantic payloads, claims each business/idempotency key inside the transaction, returns the stored receipt for identical retries and rejects changed payloads. A business row lock serializes ledger revisions; successful batches, corrections and undos increment the revision exactly once and persist the receipt in the same commit.

Batch creation validates all products before writing and records one append-only revision per sale. Corrections update the selected sale only when its expected version is current. Undo creates a new operation and compensating revisions, voiding newly created sales or restoring prior values while always advancing versions. A current snapshot mismatch or prior undo prevents reversal. Mutations also reopen affected completed dates and append coverage revisions atomically.

`npm test` covers deterministic validation, hashing and API contracts. `npm run test:database:day21` uses `EASYLEDGER_TEST_DATABASE_URL` and a disposable schema to exercise PostgreSQL behavior, including 20 simultaneous identical calls, altered-payload conflicts, rollback, correction, undo, intervening edits, null-versus-zero prices and day-coverage reopening. The Day 22 API adds injected authentication and HTTP status mapping; `OperationError` carries stable codes, retryability and intended status values for that adapter. The verified runs used PostgreSQL 17-alpine.

## Implemented Day 22 manual API

`apps/api/app.ts` exposes versioned API v1 sales, product and day-coverage routes through an injected authentication adapter and PostgreSQL pool. The adapter resolves a single owner business server-side. JSON schemas reject extra fields and client-supplied tenant or actor IDs; missing authentication is 401, an authenticated user without a business is 403, and tenant-owned missing IDs are 404. Sales are paginated with a bounded opaque cursor, current product names, voided status, filters and the business ledger revision. Catalog writes and coverage transitions claim idempotency keys transactionally and use product/coverage versions for stale-write conflicts. Coverage receipts distinguish a confirmed zero day from an open gap, and sale mutations automatically reopen completed dates.

The verified Day 22 run used Fastify 5.12.5 and PostgreSQL 17-alpine. `npm test`, the repository Day 20 SQL check, `npm run test:database:day21`, `npm run test:database:day22`, syntax checks and `git diff --check` passed against a disposable schema/container. The temporary PostgreSQL container was removed after the final verification.

## Integration spike exit checklist

- Authenticate a demo owner and bind business identity on the server.
- Create a real AssemblyAI session without exposing a long-lived provider credential.
- Execute a bounded tool with secure per-session authorization and an invalid-token rejection.
- Prove the confirmation state transition cannot be bypassed by model arguments.
- Measure one round trip and disconnect/reconnect behavior; record supported audio format and token expiry from current vendor docs.
- Render one typed chart and one draggable/resizable widget with keyboard alternatives.
- Check dependency licenses and lock exact compatible versions before committing application scaffolding.

## Deployment and recovery sequence (future)

Deploy to Render as decided in [[docs/04-Decisions]] (ADR-011): provision a Render Managed PostgreSQL instance, configure the Fastify Web Service (`apps/api`) with database connection and AssemblyAI credentials, and deploy the React/Vite Static Site (`apps/web`) with rewrite rules for SPA routing. Provision separate demo credentials and database schemas. Review/apply migrations; seed only labeled synthetic data. Configure HTTPS, cookies, provider credentials and allowed origins server-side. Run authorization, arithmetic, voice and builder smoke checks. Confirm backup restoration before sharing a public URL.

On incident: stop new unsafe mutations, preserve receipts/audit IDs, identify whether the provider, API or database failed, and expose an honest status to users. Recover the database from a verified backup only with an explicit recovery plan; reconcile operations since that backup before reopening writes. Roll back a failed application release with schema compatibility checked. Rehearse these steps before real merchant data is accepted.

Secrets/config names are a future design choice; do not add guessed working credentials. Record an environment-variable template with names/descriptions once integration selects the actual SDK/API. Delivery owners and gates: [[docs/10-Delivery-Plan]]. Safety boundaries: [[docs/08-Security-and-Operations]]. Submission requirements: [[docs/11-Hackathon-and-License]].
