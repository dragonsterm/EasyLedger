---
title: Delivery plan and risk register
status: proposed
tags: [easyledger, delivery]
---
# Delivery plan and risk register

Planning baseline: 2026-09-17. The event advertises September 1–30, 2026; exact submission cutoff/timezone must be confirmed. Suggested dates below are estimates, not commitments. Day 20 schema, seed and exact-money work is complete; the rest of P2 and all later application phases remain pending.

| Phase | Suggested window | Deliverable and exit gate | Dependency |
| --- | --- | --- | --- |
| P0 Plan | Sep 17 | Linked requirements, stack, data/tool contracts, graph and canvases | Current task |
| P1 De-risk | Sep 18–19 | Real AssemblyAI browser session, secure tool call, compatible chart/grid spike, auth decision | P0 |
| P2 Data first | Sep 20–22 | Migrations, catalog, manual ledger, atomic corrections/undo, idempotency, owner isolation | P1 |
| P3 Agent | Sep 23–24 | Proposal/confirm/commit flow, clarification, truthful receipts, retry recovery | P2 |
| P4 Builder | Sep 25–26 | Line/bar/KPI, filter/drilldown, voice/manual edit, save/reopen | P2 query contracts; P3 for voice |
| P5 Validate | Sep 27–28 | Acceptance scenarios, accessibility, latency measurement, restore and user walkthroughs | P3 + P4 |
| P6 Submit | Sep 29, buffer Sep 30 | Online demo deployed on Render, video/deck, public repo review and organizer checklist | P5 |

Protect the central record → correct → visualize → arrange → save journey. If schedule slips, reduce later chart types/connectors/templates, not arithmetic, authorization, confirmation or duplicate prevention. A failed secure voice spike requires a documented fallback decision before building around unsupported capabilities.

## Risks

| Risk | Impact | Mitigation / trigger | Owner role |
| --- | --- | --- | --- |
| Provider access/session authentication fails | Blocks live demo | Prove P1; use supported client-function route if secure; otherwise revise integration plan | Backend |
| Indonesian voice expectation | Wrong language promise | Explicit English MVP; research separate Indonesian path before commitment | Product |
| “Complete BI” exceeds time | Incomplete central workflow | Three widget MVP, explicit later backlog | Product |
| Ambiguous sale correction | Corrupted business data | Identified target, version checks, proposal and audit | Backend |
| Missing data misread as zero | Misleading decisions | Coverage status, gaps and completeness labels | Data/frontend |
| Vendor quotas/cost | Demo interruption | Short sessions, alerts, backup manual flow, measured budget | Project owner |
| Unknown final rules/license clause | Submission mismatch | Recheck official event/form, preserve provenance | Project owner |

Post-MVP milestones: usability refinement and theme selection; richer charts/tables/templates; validated CSV import and export; connectors and reusable metrics; collaboration/sharing; multilingual support. Each needs its own requirements and security review, with [[docs/07-Dashboard-and-UX]] as the capability map.

Acceptance is defined in [[docs/09-Verification]], architectural uncertainties in [[docs/04-Decisions]], and submission evidence in [[docs/11-Hackathon-and-License]].
