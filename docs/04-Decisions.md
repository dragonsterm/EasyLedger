---
title: Architecture decisions and stack
status: proposed-baseline
tags: [easyledger, architecture, decisions]
---
# Architecture decisions and stack

Decisions dated 2026-09-17 are planning recommendations. Pin compatible package versions and verify licenses during implementation; only documentation tooling is installed now. Official references are catalogued in [[docs/13-Sources]].

| ADR | Decision | Rationale and tradeoff |
| --- | --- | --- |
| ADR-001 | React + TypeScript + Vite for the whole frontend | Component reuse and a flexible interactive builder; a static client is sufficient. Next.js remains an option if server rendering or public SEO becomes important. |
| ADR-002 | Node.js + TypeScript + Fastify API with JSON Schema contracts | Shares types and keeps tools, browser and validation understandable. Runtime validation remains mandatory; compile-time types alone are insufficient. |
| ADR-003 | PostgreSQL with parameterized SQL and explicit migrations | Transactions, uniqueness and exact integer/numeric storage fit ledger correctness. Choose a thin query layer during the spike; do not couple rules to an ORM. |
| ADR-004 | Apache ECharts plus React Grid Layout | Broad chart capability with React-managed controls and persisted layouts. Build a constrained semantic widget schema rather than exposing arbitrary ECharts options. Keyboard layout controls require application work. |
| ADR-005 | AssemblyAI Voice Agent API with one agent and bounded tools | Satisfies the intended voice-agent workflow with less orchestration. Account access, secure HTTP-tool session binding and language support are launch gates. |
| ADR-006 | Exact application/database calculations, versioned ledger and idempotency | Trust and reproducibility outrank model flexibility. More backend work, but corrections and retries remain explainable. |
| ADR-007 | Repository-root Obsidian vault; canonical docs generate Graphify and canvases | One editable knowledge source avoids conflicting copies. Generated outputs are one-way projections; changes must be made in the notes. |
| ADR-008 | Simple functional UI; theme deferred | Prioritize backend and complete journeys. Basic focus, responsive controls and readable states are required now; branding and polish follow usability testing. |
| ADR-009 | MIT license for original project work | Permissive open-source baseline aligned with published lablab precedent. This event's complete license clause is not verified; see [[docs/11-Hackathon-and-License]]. |

## Alternatives considered

Python/FastAPI plus pandas is useful for complex transformations, statistics or machine learning. It adds a second language and service without improving the initial grouped queries. Streamlit/Dash could accelerate an analysis demo, but a custom mobile-friendly agentic editor favors React. Embedding a full BI product adds integration and permission complexity and does not by itself implement merchant entry/corrections. Revisit only after the MVP workflow is validated.

## Open decisions with owners and gates

| Question | Responsible role | Resolve by |
| --- | --- | --- |
| Voice API account access, token lifetime, HTTP-tool session identity and cancellation | Backend owner | First integration spike |
| Auth provider and secure demo login | Backend owner | Before any public data access |
| Hosting provider, region, budget cap, retention | Project owner | Before deployment |
| React/chart/grid version compatibility and keyboard behavior | Frontend owner | Builder spike |
| Indonesian voice, fractional quantities, currencies beyond IDR | Product owner | Post-MVP scope review |
| Theme, brand and detailed design system | Product/design owner | After functional acceptance |
| Event-specific license and final submission cutoff timezone | Project owner | Before publication/submission |

Roles are responsibilities, not assigned people. Record future changes as dated ADR entries with reason and consequences; update [[docs/02-SRS]], [[docs/03-Architecture]] and [[docs/10-Delivery-Plan]] when scope changes.
