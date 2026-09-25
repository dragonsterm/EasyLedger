# Extraction audit

Generated from canonical EasyLedger planning notes. EXTRACTED means an explicit heading, requirement row or link, not implemented behavior. No inferred relationships or external LLM calls. Token counts below apply only to this deterministic extraction, not to authoring the notes. Cross-community connections are structural, not novel research findings.

# Graph Report - .  (2026-09-25)

## Corpus Check
- 20 files · ~13,331 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 136 nodes · 275 edges · 17 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output
- Edge kinds: references: 126 · specifies: 60 · contains: 56 · verifies: 33

## God Nodes (most connected - your core abstractions)
1. `Software requirements specification` - 42 edges
2. `Use cases and acceptance journeys` - 41 edges
3. `Verification and traceability` - 29 edges
4. `Architecture decisions and stack` - 24 edges
5. `EasyLedger documentation home` - 20 edges
6. `Implementation handoff and runbook` - 19 edges
7. `Delivery plan and risk register` - 18 edges
8. `AssemblyAI Voice Agent Hackathon rules, requirements, and judging` - 16 edges
9. `Security and operations plan` - 14 edges
10. `Data model and calculation rules` - 13 edges

## Surprising Connections (you probably didn't know these)
- `EasyLedger agent guide` --references--> `EasyLedger documentation home`  [EXTRACTED]
  AGENTS.md → docs/00-Home.md
- `EasyLedger agent guide` --references--> `Software requirements specification`  [EXTRACTED]
  AGENTS.md → docs/02-SRS.md
- `EasyLedger agent guide` --references--> `Architecture decisions and stack`  [EXTRACTED]
  AGENTS.md → docs/04-Decisions.md
- `EasyLedger agent guide` --references--> `System architecture`  [EXTRACTED]
  AGENTS.md → docs/03-Architecture.md
- `EasyLedger documentation home` --references--> `Product brief`  [EXTRACTED]
  docs/00-Home.md → docs/01-Product-Brief.md

## Communities

### Community 0 - "Authorization and tool safety"
Cohesion: 0.15
Nodes (13): FR-16 Synthetic fixtures display a demo label, are isolated from real records, and can be reset only in the owner's demo workspace., NFR-02 Tool response p95 below 1 second for local business queries; visible refresh p95 below 2 seconds after commit, NFR-03 Voice turn completion to visible result p95 below 5 seconds, NFR-04 Authorized, bounded tools; no credentials in browser bundles, NFR-06 Reproducible docs and portable knowledge outputs, NFR-07 Recoverable acknowledged data, Verification and traceability, T-07 Isolation/tools (+5 more)

### Community 1 - "Manual access and accessibility"
Cohesion: 0.21
Nodes (13): Software requirements specification, FR-01 Owner can authenticate and access one business and catalog; another owner's IDs disclose no records., FR-07 Transaction history supports pagination, date/product filtering, manual entry and editing with the same backend rules as voice., FR-09 Create line, bar, and KPI widgets from validated metric/dimension/filter choices; neither raw SQL nor executable chart code is accepted from the model., FR-12 Voice and manual actions add, edit, move, resize and remove widgets; an ambiguous “that chart” asks for a target. Ledger records never change from layout , FR-13 Named dashboards persist versioned configuration and responsive layout; reopening recomputes current data and shows its revision and refresh time., NFR-05 Keyboard/manual alternatives, visible focus, text equivalents for charts, readable errors, Functional requirements (+5 more)

### Community 2 - "Architecture decisions and stack"
Cohesion: 0.15
Nodes (13): Architecture decisions and stack, ADR-001 React + TypeScript + Vite for the whole frontend, ADR-002 Node.js + TypeScript + Fastify API with JSON Schema contracts, ADR-003 PostgreSQL with parameterized SQL and explicit migrations, ADR-004 Apache ECharts plus React Grid Layout, ADR-005 AssemblyAI Voice Agent API with one agent and bounded tools, ADR-006 Exact application/database calculations, versioned ledger and idempotency, ADR-007 Repository-root Obsidian vault; canonical docs generate Graphify and canvases (+5 more)

### Community 3 - "Corrections and undo"
Cohesion: 0.26
Nodes (12): FR-02 User can explicitly start/stop microphone capture and see connection/listening/processing/error states; denied permission leaves manual entry usable., FR-05 Correct a selected sale with its current version; stale edits return conflict instead of overwriting. A correction replaces the intended value, never inse, FR-06 Undo a committed operation by a compensating revision, retaining audit history; fail safely when intervening edits make reversal ambiguous., FR-17 Cancel a pending proposal or disconnect safely without losing an acknowledged commit; reconnect refreshes authoritative state before another change., FR-18 Owner can create, rename and deactivate catalog products and set an optional default price through manual controls. Deactivation preserves historical sale, FR-19 Owner explicitly confirms or reopens a business day's completeness. Show its date and consequences before applying; the action is authorized, idempotent a, T-04 Correction/undo, T-08 Voice failure (+4 more)

### Community 4 - "Implementation handoff and runbook"
Cohesion: 0.17
Nodes (12): Implementation handoff and runbook, Documentation setup, Implemented foundation and proposed structure, Implemented Day 21 mutation pipeline, Implemented Day 22 manual API, Implemented Day 23 voice gateway, Implemented TASK-25-03 dashboard renderers, Implemented TASK-25-04 missing-versus-zero dates (+4 more)

### Community 5 - "Delivery plan and risk register"
Cohesion: 0.22
Nodes (9): Delivery plan and risk register, P0 Plan, P1 De-risk, P2 Data first, P3 Agent, P4 Builder, P5 Validate, P6 Submit (+1 more)

### Community 6 - "System architecture"
Cohesion: 0.25
Nodes (8): EasyLedger agent guide, Mandatory ad-hoc verification passes, Working rules, System architecture, Responsibilities, State and refresh, Deployment shape, ADR-011 Render deployment for web, API, and managed PostgreSQL

### Community 7 - "Data model and calculation rules"
Cohesion: 0.29
Nodes (8): EasyLedger documentation home, Reading the plan, Data model and calculation rules, Exact calculations, Implemented Day 20 foundation, Time and completeness, Implemented mutation transaction, Glossary

### Community 8 - "Documentation verification record"
Cohesion: 0.25
Nodes (8): Hackathon and license, License decision and evidence limit, Submission checklist, Documentation verification record, Limits and unresolved evidence, Day 20 implementation verification — 2026-09-20, Day 21 mutation verification — 2026-09-21, Day 22 API verification — 2026-09-21

### Community 9 - "Product brief"
Cohesion: 0.29
Nodes (7): Product brief, Golden journey, Scope and success, Source reconciliation, Dashboard builder and UX, First usable interface, Behavioral rules

### Community 10 - "Analytics and missing data"
Cohesion: 0.33
Nodes (6): FR-04 Unknown products, unclear dates, additional-versus-total sales, and ambiguous references trigger clarification before mutation; no guessed price., FR-08 Quantity and known-price revenue are calculated by application/database code. Unknown-price sales remain visible and flagged; totals label incomplete reve, FR-10 Date/product filters and explicit prior-period comparison affect queries; missing dates are gaps, while explicitly confirmed zero-sales dates are zero., FR-11 Tapping a chart datum opens authorized source transactions using exactly the same query predicates and revision., T-02 Clarification, T-05 Analytics truth

### Community 11 - "Verification and release readiness"
Cohesion: 0.40
Nodes (5): FR-03 Agent proposes one or multiple sales with product, positive whole quantity, business date and optional known price; confirmation commits all valid lines a, FR-20 Each business uses either IDR or USD. IDR prices are exact whole rupiah; USD prices are exact cents. Inputs are normalized without floating point, every r, NFR-01 Exact IDR/USD minor-unit arithmetic and consistent totals, T-01 Golden ledger, T-15 Currency exactness

### Community 12 - "Agent workflow and API contracts"
Cohesion: 0.40
Nodes (5): Agent workflow and API contracts, State machine, Tool catalog, Common response envelope, Authentication and failures

### Community 13 - "Knowledge system maintenance"
Cohesion: 0.40
Nodes (5): Knowledge system maintenance, Synchronization contract, Maintainer workflow, Repository preparation, Source register and evidence

### Community 14 - "AssemblyAI Voice Agent Hackathon rules,"
Cohesion: 0.40
Nodes (5): AssemblyAI Voice Agent Hackathon rules, requirements, and judging, Event overview, Judging criteria, Submission requirements, Hackathon rules & compliance checklist

### Community 15 - "Security and operations plan"
Cohesion: 0.50
Nodes (4): Security and operations plan, Privacy and retention, Operational plan, Trust boundaries

### Community 16 - "Atomic sales and retries"
Cohesion: 0.67
Nodes (3): FR-14 Every ledger mutation uses server-enforced idempotency; concurrent/retried identical requests yield one logical commit and the same receipt. Reuse with di, FR-15 Confirmed mutations return a receipt, updated revision, affected IDs and undo availability. Failed tools never produce success confirmations., T-03 Retry/concurrency

## Knowledge Gaps
- **73 isolated node(s):** `Working rules`, `Mandatory ad-hoc verification passes`, `Reading the plan`, `Golden journey`, `Scope and success` (+68 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Software requirements specification` connect `Manual access and accessibility` to `System architecture`, `Data model and calculation rules`, `Product brief`, `Corrections and undo`, `Verification and release readiness`, `Analytics and missing data`, `Atomic sales and retries`, `Authorization and tool safety`, `Delivery plan and risk register`, `Architecture decisions and stack`, `Knowledge system maintenance`, `AssemblyAI Voice Agent Hackathon rules,`?**
  _High betweenness centrality (0.311) - this node is a cross-community bridge._
- **Why does `Architecture decisions and stack` connect `Architecture decisions and stack` to `System architecture`, `Data model and calculation rules`, `Manual access and accessibility`, `Delivery plan and risk register`, `Documentation verification record`, `Knowledge system maintenance`, `Security and operations plan`, `Implementation handoff and runbook`?**
  _High betweenness centrality (0.203) - this node is a cross-community bridge._
- **Why does `Verification and traceability` connect `Authorization and tool safety` to `Data model and calculation rules`, `Product brief`, `Manual access and accessibility`, `Agent workflow and API contracts`, `Security and operations plan`, `Verification and release readiness`, `Analytics and missing data`, `Atomic sales and retries`, `Corrections and undo`, `Delivery plan and risk register`, `Documentation verification record`, `Knowledge system maintenance`, `Implementation handoff and runbook`?**
  _High betweenness centrality (0.189) - this node is a cross-community bridge._
- **What connects `Working rules`, `Mandatory ad-hoc verification passes`, `Reading the plan` to the rest of the system?**
  _73 weakly-connected nodes found - possible documentation gaps or missing edges._