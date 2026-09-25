---
title: Implementation handoff and runbook
status: implementation-started
tags: [easyledger, operations, delivery]
---
# Implementation handoff and runbook

## What exists today

Planning notes, the existing Obsidian vault, Graphify artifacts and documentation maintenance scripts exist alongside the implemented Day 20 data foundation, Day 21 mutation service, Day 22 manual ledger API, Day 23 voice session bootstrap and tool gateway, Day 25 analytics endpoint, and a browser dashboard preview with ECharts renderers. The repository now contains the initial PostgreSQL migration, product version migration, voice sessions migration, synthetic catalog seed, exact IDR/USD money module, transactional sale creation, correction and compensating undo, tenant-scoped catalog and sales routes, audited day coverage, ephemeral AssemblyAI session token generation, Fastify voice tool gateway (`get_context`, `propose_sales`, `commit_sales`, `propose_correction`, `commit_correction`, `query_sales`), plus domain, contract and PostgreSQL checks. The browser preview uses local sample data; authenticated live queries, voice interaction in the browser, complete builder behavior and Render deployment remain planned. `npm run graph:serve` opens documentation visualization, not EasyLedger.

## Documentation setup

Use Node.js 24 (the verification environment is 24.19.0) and npm. From the repository root, run `npm ci`, `npm run docs:sync`, then `npm run docs:check`. Open the repository folder as an Obsidian vault and select [[docs/00-Home]] or `docs/EasyLedger-Overview.canvas`. Graphify is pinned to 0.18.0 in package/lock files. No API key is needed for deterministic documentation generation.

For the browser graph, run `npm run graph:serve`, then open `http://127.0.0.1:4173`. Stop with Ctrl+C. If the port is occupied, stop the previous graph server or choose a different local port in the maintenance script. `npm run docs:watch` regenerates after canonical note changes while running. If checking reports stale artifacts, regenerate; if links are broken, fix canonical paths first. Do not edit generated graph JSON to conceal a failing check.

## Implemented foundation and proposed structure

- `apps/web`: implemented React/Vite dashboard preview with ECharts line and bar charts, Total revenue and Units sold KPI cards, and click/keyboard-selected widget properties; ledger/history, live query binding, builder persistence controls and microphone/session adapter remain planned.
- `apps/api`: implemented Fastify manual ledger routes, voice tool gateway, dashboard service and `POST /api/v1/analytics/query` with an injected authentication adapter; the browser still needs an authenticated session integration.
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

## Implemented Day 23 voice gateway

`POST /api/v1/voice/sessions` (and alias `/api/voice/sessions`) authenticates the merchant through the configured authentication adapter, resolves the single tenant business server-side, and issues an ephemeral session token alongside an AssemblyAI ephemeral token (`/v3/token`). Long-lived API keys are never returned to clients or logged. The ephemeral session is stored in PostgreSQL `voice_sessions` (`db/migrations/003_voice_sessions.sql`) with a SHA-256 token hash and configurable TTL.

The Fastify HTTP tool gateway (`apps/api/app.ts`) registers endpoints for `get_context`, `propose_sales`, `commit_sales`, `propose_correction`, `commit_correction`, and `query_sales` under `/api/v1/voice/tools/*` and `/api/voice/tools/*`. The gateway authenticates incoming requests via the ephemeral session token, resolves tenant identity server-side, and strictly rejects any client-supplied or model-supplied `business_id` or `actor_user_id` with 422 `VALIDATION_ERROR`. Two-phase mutation proposals are stored with SHA-256 hashed confirmation tokens and payload hashes in the `proposals` table, requiring explicit confirmation before calling the underlying `OperationService`. Deterministic sales queries calculate exact revenue and unit totals while flagging incomplete revenue from unknown prices.

The verified Day 23 run used Fastify 5.12.5 and PostgreSQL 17-alpine. `npm test` (15 domain + 9 API tests), `npm run test:database:day21`, `npm run test:database:day22`, `npm run test:database:day23`, and live AssemblyAI token generation passed against disposable schemas and containers.

## Implemented TASK-25-03 dashboard renderers

`apps/web/src/analytics.ts` defines the analytics response shape, validates success envelopes, maps exact minor-unit row values to ECharts only when they fit JavaScript's safe integer range, and formats IDR/USD totals without floating-point money arithmetic. `apps/web/src/EChart.tsx` registers the ECharts line, bar, grid, tooltip and SVG modules, resizes charts with their container and disposes instances on unmount. The Daily revenue line, Sales by product horizontal bar, Total revenue and Units sold cards use those typed sample responses. A separate Complete days card remains an illustrative sample; date analytics rows now carry coverage state, but that card is not calculated from the API response.

Every visible chart or KPI opens a selected-widget properties panel through mouse or keyboard activation. The panel reports the selected widget's title, type, metric, grouping and sample status. Its styled SVG close button dismisses the panel and returns focus to the selected card. Tooltip labels are HTML-escaped, and chart tables retain text alternatives. The preview labels sample values and unavailable actions explicitly; it does not claim an authorized live ledger connection, saved dashboard or source-row drilldown. Those integrations remain in the numbered Day 25–26 tasks.

Verification on 2026-09-25: `npm --prefix apps/web run build`, `git diff --check`, focused mapper checks for valid values, empty/null/zero/overflow and exact USD formatting, HTML tooltip escaping, and the seven existing API contract cases passed. Browser review at a 1280px viewport showed both ECharts SVGs, no horizontal overflow, the existing desktop card styling, correct inspector selection for chart and KPI cards, and close-button focus restoration. The Vite build reported a JavaScript chunk over 500 kB; production loading performance was not measured.

## Implemented TASK-25-04 missing-versus-zero dates

For a bounded date query, `SalesQueryService` now returns one row per requested local date. It combines tenant-filtered, non-voided sales with the business's day-coverage state. An open date with no matching sale has null quantity and revenue and is rendered as a disconnected line gap. A complete date with no matching sale has exact `0` quantity and revenue. A date with recorded sales and unknown prices has a separate `unknown-price` state; known-price revenue and units retain their previous calculation rules. The response carries effective filters and the ledger revision. Database query errors propagate rather than becoming empty charts.

The typed web mapper and the sample ECharts line preserve these states. The sample table and tooltip distinguish an open no-sale gap, a confirmed zero and unknown-price sales in text. The preview remains sample-only; authenticated live analytics binding is still pending. The existing chart options and stylesheet palette were retained.

Verification on 2026-09-25: `npm test` passed 17 domain and 13 API cases, `node --test tests/web/*.test.mjs` passed two chart-mapping and malformed-response cases, and `node --test tests/database/day25_coverage_integration.mjs` passed against a disposable PostgreSQL 17-alpine container. The database test covered open gaps, confirmed zeroes, unknown-price sales, zero-price sales, voided rows, product filters and tenant isolation. `npm --prefix apps/web run build` and `git diff --check` passed. Browser inspection at the desktop reference width showed the 20 Sep gap and 21 Sep zero, readable text alternatives, and no change to the existing card layout and palette. The production build still warns about a JavaScript chunk over 500 kB; load time was not measured.

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
