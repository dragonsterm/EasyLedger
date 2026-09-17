---
title: Security and operations plan
status: proposed
tags: [easyledger, security, operations]
---
# Security and operations plan

## Trust boundaries

All browser input, transcript text, tool arguments and model output are untrusted. Authenticate the merchant on session creation and each API request. Resolve business identity server-side. For provider HTTP tools, validate a scoped expiring credential and its bound session; deny missing/expired credentials. Verify ownership on every lookup, including chart drilldown, dashboard save, operation lookup and undo. A single-business UI does not remove the authorization requirement.

| Threat | Required control | Verification |
| --- | --- | --- |
| Prompt asks for SQL, another tenant, or arbitrary URLs | Allowlisted schemas, parameterized queries, owner checks, no arbitrary executor | T-07 |
| Replayed or concurrent calls duplicate sales | Unique operation key, payload hash, atomic receipt | T-03 |
| Voice correction overwrites manual edit | Version precondition and clear conflict | T-04 |
| Provider secret exposed | Server-side secret storage, short-lived browser voice access | T-07 |
| Sensitive recordings/logs leak | Audio off by default for storage, redacted diagnostics, retention decision | T-10 |
| Browser request forgery or script injection | Secure session cookies, CSRF protection where needed, restricted CORS, escaped labels, content security policy | T-07 |

## Privacy and retention

Explain microphone use before capture and stop sending audio when stopped. Do not collect customer names/payment details for the MVP. Use synthetic data in public demonstrations. Proposed defaults: no EasyLedger raw-audio retention; transient transcript context only; structured audit receipts retained with ledger history. Provider-side audio/transcript storage must be checked and configured separately—local deletion does not prove vendor deletion. Project owner must set retention periods and deletion procedure before a real-user pilot.

## Operational plan

Keep provider and database credentials in deployment secret storage. Separate development/demo/production environments and datasets. Rate-limit session creation and tools by user/session; bound query windows, widget counts and operation sizes. Set account spend alerts and a session-duration cap after verifying provider billing. Do not promise a cost estimate until session usage is measured.

Log request/operation IDs, tool name, duration, result code and ledger revision, with redacted argument summaries. Track tool success, duplicate suppression, conflicts, voice disconnects, query latency and daily spend. Health checks distinguish process liveness from database readiness. A voice-provider outage should leave manual ledger/dashboard access available.

Before public demo: apply reviewed migrations, back up PostgreSQL, run a restore rehearsal, verify a second user's isolation, and test a provider outage. Rollback application releases independently of schema changes; prefer additive migrations until a tested migration/rollback process exists. Never reset real records as part of a demo reset.

Architecture: [[docs/03-Architecture]]. Contract enforcement: [[docs/06-Agent-and-API]]. Test gates: [[docs/09-Verification]]. Unresolved deployment choices: [[docs/04-Decisions]].
