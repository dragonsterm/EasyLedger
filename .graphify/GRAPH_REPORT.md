# Extraction audit

Generated from canonical EasyLedger planning notes. EXTRACTED means an explicit heading, requirement row or link, not implemented behavior. No inferred relationships or external LLM calls. Token counts below apply only to this deterministic extraction, not to authoring the notes. Cross-community connections are structural, not novel research findings.

# Graph Report - .  (2026-09-20)

## Corpus Check
- 20 files · ~11,047 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 127 nodes · 265 edges · 12 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output
- Edge kinds: references: 125 · specifies: 59 · contains: 48 · verifies: 33

## God Nodes (most connected - your core abstractions)
1. `Software requirements specification` - 42 edges
2. `Use cases and acceptance journeys` - 41 edges
3. `Verification and traceability` - 29 edges
4. `Architecture decisions and stack` - 23 edges
5. `EasyLedger documentation home` - 20 edges
6. `Delivery plan and risk register` - 18 edges
7. `AssemblyAI Voice Agent Hackathon rules, requirements, and judging` - 16 edges
8. `Security and operations plan` - 14 edges
9. `Data model and calculation rules` - 13 edges
10. `Agent workflow and API contracts` - 13 edges

## Surprising Connections (you probably didn't know these)
- `EasyLedger agent guide` --references--> `Software requirements specification`  [EXTRACTED]
  AGENTS.md → docs/02-SRS.md
- `EasyLedger agent guide` --references--> `Architecture decisions and stack`  [EXTRACTED]
  AGENTS.md → docs/04-Decisions.md
- `EasyLedger agent guide` --references--> `Knowledge system maintenance`  [EXTRACTED]
  AGENTS.md → docs/12-Knowledge-System.md
- `EasyLedger agent guide` --references--> `EasyLedger documentation home`  [EXTRACTED]
  AGENTS.md → docs/00-Home.md
- `EasyLedger agent guide` --references--> `System architecture`  [EXTRACTED]
  AGENTS.md → docs/03-Architecture.md

## Communities

### Community 0 - "Data model and calculation rules"
Cohesion: 0.11
Nodes (23): Product brief, Golden journey, Scope and success, Source reconciliation, Data model and calculation rules, Exact calculations, Implemented Day 20 foundation, Time and completeness (+15 more)

### Community 1 - "Authorization and tool safety"
Cohesion: 0.14
Nodes (14): FR-01 Owner can authenticate and access one business and catalog; another owner's IDs disclose no records., FR-16 Synthetic fixtures display a demo label, are isolated from real records, and can be reset only in the owner's demo workspace., NFR-02 Tool response p95 below 1 second for local business queries; visible refresh p95 below 2 seconds after commit, NFR-03 Voice turn completion to visible result p95 below 5 seconds, NFR-04 Authorized, bounded tools; no credentials in browser bundles, NFR-06 Reproducible docs and portable knowledge outputs, NFR-07 Recoverable acknowledged data, Verification and traceability (+6 more)

### Community 2 - "System architecture"
Cohesion: 0.18
Nodes (13): EasyLedger agent guide, Mandatory ad-hoc verification passes, Working rules, EasyLedger documentation home, Reading the plan, System architecture, Responsibilities, State and refresh (+5 more)

### Community 3 - "Architecture decisions and stack"
Cohesion: 0.15
Nodes (13): Architecture decisions and stack, ADR-001 React + TypeScript + Vite for the whole frontend, ADR-002 Node.js + TypeScript + Fastify API with JSON Schema contracts, ADR-003 PostgreSQL with parameterized SQL and explicit migrations, ADR-004 Apache ECharts plus React Grid Layout, ADR-005 AssemblyAI Voice Agent API with one agent and bounded tools, ADR-006 Exact application/database calculations, versioned ledger and idempotency, ADR-007 Repository-root Obsidian vault; canonical docs generate Graphify and canvases (+5 more)

### Community 4 - "Corrections and undo"
Cohesion: 0.26
Nodes (12): FR-02 User can explicitly start/stop microphone capture and see connection/listening/processing/error states; denied permission leaves manual entry usable., FR-05 Correct a selected sale with its current version; stale edits return conflict instead of overwriting. A correction replaces the intended value, never inse, FR-06 Undo a committed operation by a compensating revision, retaining audit history; fail safely when intervening edits make reversal ambiguous., FR-17 Cancel a pending proposal or disconnect safely without losing an acknowledged commit; reconnect refreshes authoritative state before another change., FR-18 Owner can create, rename and deactivate catalog products and set an optional default price through manual controls. Deactivation preserves historical sale, FR-19 Owner explicitly confirms or reopens a business day's completeness. Show its date and consequences before applying; the action is authorized, idempotent a, T-04 Correction/undo, T-08 Voice failure (+4 more)

### Community 5 - "Manual access and accessibility"
Cohesion: 0.23
Nodes (12): Software requirements specification, FR-07 Transaction history supports pagination, date/product filtering, manual entry and editing with the same backend rules as voice., FR-09 Create line, bar, and KPI widgets from validated metric/dimension/filter choices; neither raw SQL nor executable chart code is accepted from the model., FR-12 Voice and manual actions add, edit, move, resize and remove widgets; an ambiguous “that chart” asks for a target. Ledger records never change from layout , FR-13 Named dashboards persist versioned configuration and responsive layout; reopening recomputes current data and shows its revision and refresh time., NFR-05 Keyboard/manual alternatives, visible focus, text equivalents for charts, readable errors, Functional requirements, Nonfunctional requirements (+4 more)

### Community 6 - "Implementation handoff and runbook"
Cohesion: 0.18
Nodes (12): Hackathon and license, License decision and evidence limit, Submission checklist, Implementation handoff and runbook, Documentation setup, Implemented foundation and proposed structure, Integration spike exit checklist, Deployment and recovery sequence (future) (+4 more)

### Community 7 - "Delivery plan and risk register"
Cohesion: 0.22
Nodes (9): Delivery plan and risk register, P0 Plan, P1 De-risk, P2 Data first, P3 Agent, P4 Builder, P5 Validate, P6 Submit (+1 more)

### Community 8 - "Analytics and missing data"
Cohesion: 0.33
Nodes (6): FR-04 Unknown products, unclear dates, additional-versus-total sales, and ambiguous references trigger clarification before mutation; no guessed price., FR-08 Quantity and known-price revenue are calculated by application/database code. Unknown-price sales remain visible and flagged; totals label incomplete reve, FR-10 Date/product filters and explicit prior-period comparison affect queries; missing dates are gaps, while explicitly confirmed zero-sales dates are zero., FR-11 Tapping a chart datum opens authorized source transactions using exactly the same query predicates and revision., T-02 Clarification, T-05 Analytics truth

### Community 9 - "Verification and release readiness"
Cohesion: 0.40
Nodes (5): FR-03 Agent proposes one or multiple sales with product, positive whole quantity, business date and optional known price; confirmation commits all valid lines a, FR-20 Each business uses either IDR or USD. IDR prices are exact whole rupiah; USD prices are exact cents. Inputs are normalized without floating point, every r, NFR-01 Exact IDR/USD minor-unit arithmetic and consistent totals, T-01 Golden ledger, T-15 Currency exactness

### Community 10 - "Knowledge system maintenance"
Cohesion: 0.40
Nodes (5): Knowledge system maintenance, Synchronization contract, Maintainer workflow, Repository preparation, Glossary

### Community 11 - "Atomic sales and retries"
Cohesion: 0.67
Nodes (3): FR-14 Every ledger mutation uses server-enforced idempotency; concurrent/retried identical requests yield one logical commit and the same receipt. Reuse with di, FR-15 Confirmed mutations return a receipt, updated revision, affected IDs and undo availability. Failed tools never produce success confirmations., T-03 Retry/concurrency

## Knowledge Gaps
- **65 isolated node(s):** `Working rules`, `Mandatory ad-hoc verification passes`, `Reading the plan`, `Golden journey`, `Scope and success` (+60 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Software requirements specification` connect `Manual access and accessibility` to `System architecture`, `Data model and calculation rules`, `Authorization and tool safety`, `Corrections and undo`, `Verification and release readiness`, `Analytics and missing data`, `Atomic sales and retries`, `Delivery plan and risk register`, `Architecture decisions and stack`, `Knowledge system maintenance`?**
  _High betweenness centrality (0.332) - this node is a cross-community bridge._
- **Why does `Architecture decisions and stack` connect `Architecture decisions and stack` to `System architecture`, `Manual access and accessibility`, `Delivery plan and risk register`, `Implementation handoff and runbook`, `Data model and calculation rules`, `Knowledge system maintenance`?**
  _High betweenness centrality (0.205) - this node is a cross-community bridge._
- **Why does `Verification and traceability` connect `Authorization and tool safety` to `System architecture`, `Data model and calculation rules`, `Manual access and accessibility`, `Verification and release readiness`, `Analytics and missing data`, `Atomic sales and retries`, `Corrections and undo`, `Delivery plan and risk register`, `Implementation handoff and runbook`, `Knowledge system maintenance`?**
  _High betweenness centrality (0.182) - this node is a cross-community bridge._
- **What connects `Working rules`, `Mandatory ad-hoc verification passes`, `Reading the plan` to the rest of the system?**
  _65 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Data model and calculation rules` be split into smaller, more focused modules?**
  _Cohesion score 0.1067193675889328 - nodes in this community are weakly interconnected._
- **Should `Authorization and tool safety` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._