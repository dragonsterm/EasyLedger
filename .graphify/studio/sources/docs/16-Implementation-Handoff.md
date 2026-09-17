---
title: Implementation handoff and runbook
status: planning-only
tags: [easyledger, operations, delivery]
---
# Implementation handoff and runbook

## What exists today

Only planning notes, the existing Obsidian vault, Graphify artifacts, and documentation maintenance scripts exist. No application server, migrations, authentication, provider session, user interface or deployment exists. `npm run graph:serve` opens documentation visualization, not EasyLedger. App implementation needs a subsequent user request.

## Documentation setup

Use Node.js 24 (the verification environment is 24.19.0) and npm. From the repository root, run `npm ci`, `npm run docs:sync`, then `npm run docs:check`. Open the repository folder as an Obsidian vault and select [[docs/00-Home]] or `docs/EasyLedger-Overview.canvas`. Graphify is pinned to 0.18.0 in package/lock files. No API key is needed for deterministic documentation generation.

For the browser graph, run `npm run graph:serve`, then open `http://127.0.0.1:4173`. Stop with Ctrl+C. If the port is occupied, stop the previous graph server or choose a different local port in the maintenance script. `npm run docs:watch` regenerates after canonical note changes while running. If checking reports stale artifacts, regenerate; if links are broken, fix canonical paths first. Do not edit generated graph JSON to conceal a failing check.

## Proposed application structure (not scaffolded)

- `apps/web`: React frontend, ledger/history, dashboard builder, microphone/session adapter.
- `apps/api`: Fastify routes, authenticated tool gateway, ledger/dashboard/query services.
- `packages/contracts`: validated request/response and widget specifications shared with browser code.
- `db/migrations`: reviewed PostgreSQL schema changes and synthetic development fixtures.
- `tests`: domain/integration/browser checks appropriate to [[docs/09-Verification]].

Choose final package manager layout and compatible versions during P1. Do not install the entire application stack merely because it appears here. Frontend and backend can remain in one repository without microservices.

## Integration spike exit checklist

- Authenticate a demo owner and bind business identity on the server.
- Create a real AssemblyAI session without exposing a long-lived provider credential.
- Execute a bounded tool with secure per-session authorization and an invalid-token rejection.
- Prove the confirmation state transition cannot be bypassed by model arguments.
- Measure one round trip and disconnect/reconnect behavior; record supported audio format and token expiry from current vendor docs.
- Render one typed chart and one draggable/resizable widget with keyboard alternatives.
- Check dependency licenses and lock exact compatible versions before committing application scaffolding.

## Deployment and recovery sequence (future)

Select host/region/auth provider and retention policy using [[docs/04-Decisions]]. Provision separate demo credentials and PostgreSQL. Review/apply migrations; seed only labeled synthetic data. Configure HTTPS, cookies, provider credentials and allowed origins server-side. Run authorization, arithmetic, voice and builder smoke checks. Confirm backup restoration before sharing a public URL.

On incident: stop new unsafe mutations, preserve receipts/audit IDs, identify whether the provider, API or database failed, and expose an honest status to users. Recover the database from a verified backup only with an explicit recovery plan; reconcile operations since that backup before reopening writes. Roll back a failed application release with schema compatibility checked. Rehearse these steps before real merchant data is accepted.

Secrets/config names are a future design choice; do not add guessed working credentials. Record an environment-variable template with names/descriptions once integration selects the actual SDK/API. Delivery owners and gates: [[docs/10-Delivery-Plan]]. Safety boundaries: [[docs/08-Security-and-Operations]]. Submission requirements: [[docs/11-Hackathon-and-License]].
