---
title: Verification and traceability
status: planned-not-executed
tags: [easyledger, verification]
---
# Verification and traceability

This remains the application acceptance plan. Day 20 domain and PostgreSQL checks, Day 21 mutation checks, and the Day 22 manual API, catalog, coverage and tenant-isolation checks have run. Voice, browser, performance and recovery scenarios remain planned. Documentation-tool checks are separate and reported in [[docs/12-Knowledge-System]]. Every Must requirement in [[docs/02-SRS]] maps to a scenario below.

| Test | Requirements | Scenario and pass condition |
| --- | --- | --- |
| T-01 Golden ledger | FR-03, FR-08, FR-15; NFR-01 | Confirm 10 orange at 15,000 + 6 mango at 18,000. Exactly two sales, one atomic receipt, total 258,000. Correct orange to 8; total 228,000. |
| T-02 Clarification | FR-04, FR-08 | Unknown price, ambiguous “today's total,” unknown product and “fix that” with multiple targets cause no ledger write until resolved. Units remain available without price. |
| T-03 Retry/concurrency | FR-14, FR-15 | Send same key concurrently 20 times and retry after lost response; one commit and identical receipts. Changed payload under same key conflicts. |
| T-04 Correction/undo | FR-05, FR-06 | Stale expected version conflicts; undo writes a compensating revision. Intervening edits prevent blind reversal. No historical revision disappears. |
| T-05 Analytics truth | FR-08, FR-09, FR-10, FR-11 | Compare known/unknown price, open/complete no-sale dates, zero prior period, midnight local dates and week boundaries. Totals and drilldown agree at a shared revision. |
| T-06 Builder | FR-09, FR-12, FR-13 | Voice and manual changes produce equivalent widget specs; save/reopen retains layout/filters while new sales refresh data. Dashboard changes never alter ledger rows. |
| T-07 Isolation/tools | FR-01; NFR-04 | Second owner cannot read or mutate first owner's IDs; reject expired tool credentials, injection/extra fields, arbitrary SQL/URLs, oversized queries and secret exposure. |
| T-08 Voice failure | FR-02, FR-17 | Deny microphone, interrupt response, lose network before/after commit and disconnect provider. Manual access works; no fabricated confirmation or duplicate write. |
| T-09 Manual accessibility | FR-07, FR-12; NFR-05 | Finish entry, filtering, correction, drilldown and layout changes with keyboard/text controls at 390px and 1280px widths. Errors and focus remain visible. |
| T-10 Demo/restore | FR-16; NFR-07 | Demo is visibly labeled and isolated; demo reset cannot affect real workspace. Restore backup and reconcile sale/revision counts and receipts. |
| T-11 Performance | NFR-02, NFR-03 | Run stated SRS workloads; record p50/p95 and failure rate with network/hosting details. No inferred latency from vendor marketing. |
| T-12 Knowledge | NFR-06 | Sync, link/canvas checks, freshness and portable graph checks pass; a changed note causes check failure until regenerated. |
| T-13 Catalog | FR-18 | Create a product, change its default price, rename and deactivate it. Old sales retain price snapshots and product identity; inactive products cannot receive new sales without reactivation. |
| T-14 Day coverage | FR-19 | Confirm a no-sale day as complete: gap becomes zero. Reopen it: zero becomes unknown. Duplicate calls create one audited change; another owner cannot change coverage. |
| T-15 Currency exactness | FR-20; NFR-01 | Create separate IDR and USD businesses. Parse whole rupiah and dollar/cents inputs to exact minor units, reject fractional IDR and excess USD decimals, reject mixed currencies and currency changes, and display the correct currency without conversion. |

## Test layers and fixtures

Unit tests cover arithmetic, currency parsing, date ranges, completeness, validation and chart-spec conversion. Database integration tests use real PostgreSQL constraints/transactions for retries, rollback, ownership and version conflicts. Browser end-to-end tests cover the golden journey, responsive/manual controls and dashboard persistence. Contract tests mock tool failures and delays; one real AssemblyAI smoke session verifies the actual integration.

Fixtures include two business owners, orange/mango catalog entries, known and missing prices, explicitly free sales, open/complete days, dates around local midnight, and concurrent dashboard edits. Fixtures are synthetic and labeled. Record actual tool calls and resulting IDs for demo evidence without recording secrets.

## Human validation

Recruit a small initial group of merchants with consent (target five, exploratory rather than statistically conclusive). Ask each to record three sales, correct one, build two widgets, save, and explain a chart's source records. Compare with their current method; record task duration, errors, clarification count and comprehension. Report observed results and sample limits rather than unsupported business claims.

Release gate: all Must scenarios pass, no known unauthorized access or arithmetic/data-loss issue, performance measured with any shortfall disclosed, real provider smoke test completed, and [[docs/11-Hackathon-and-License]] checklist reviewed. Implementation order: [[docs/10-Delivery-Plan]].
