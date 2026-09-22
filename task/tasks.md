# EasyLedger · Daily Task Plan & Execution Tracker

> **Project:** EasyLedger — Voice-first sales ledger and interactive dashboard builder for small merchants.  
> **Event:** [AssemblyAI - Voice Agent Hackathon on lablab.ai](https://lablab.ai/ai-hackathons/assemblyai-voice-agent-hackathon) (Sep 1–30, 2026)  
> **Repository Rules:** See [`AGENTS.md`](file:///C:/Project/EasyLedger/AGENTS.md) and [`docs/00-Home.md`](file:///C:/Project/EasyLedger/docs/00-Home.md).  
> **Status Conventions:** `[ ]` Pending · `[/]` In Progress · `[x]` Completed · `[!]` Blocked

---

## Guide for Humans and AI Agents

### For AI Agents
1. **Read-First Principle:** Before executing any task for a day, read the cited canonical documents under `docs/` and review the relevant test scenario in [`docs/09-Verification.md`](file:///C:/Project/EasyLedger/docs/09-Verification.md).
2. **Deterministic Arithmetic:** Never compute or clamp financial sums using an LLM. Money calculations must execute in deterministic application or database code using exact minor units: whole rupiah for IDR and cents for USD ([[docs/05-Data-Model]]).
3. **Workspace Tooling Rules:**
   - Use `write_to_file` to create new files (NEVER pass `ArtifactMetadata` for workspace files).
   - Use `replace_file_content` to edit existing files.
   - Do NOT use terminal write commands (`Set-Content`, `Out-File`, `echo`, `cat`) to generate code files.
4. **Documentation Sync:** After modifying files in `docs/` or maintenance scripts, always run `npm run docs:sync` then `npm run docs:check`.
5. **Ad-Hoc Verification:** Before marking any task `[x]`, execute a proportionate verification pass and inspect the actual state.

### For Human Developers & Reviewers
- Check the **Human Verification Checkpoint** at the end of each day's plan.
- Run `npm run docs:check` to ensure knowledge graph freshness.
- Check git diffs before approving commits or releases.

---

## Daily Schedule & Roadmap Overview

| Day | Date | Phase | Focus / Milestone | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Day 1–17** | Sep 01–17 | **P0 Plan** | Problem brief, SRS, Architecture, ADRs, Data Model, Graphify setup | `[x] Completed` |
| **Day 18** | Sep 18 | **P1 De-risk** | AssemblyAI Voice Agent API research, tool contract design, spike planning | `[x] Completed` |
| **Day 19** | Sep 19 (Today) | **P1 Exit** | Hackathon rules alignment, daily task tracking system, spike prep | `[x] Completed` |
| **Day 20** | Sep 20 | **P2 Data First** | PostgreSQL schema, migrations, product catalog & exact IDR/USD arithmetic | `[x] Completed` |
| **Day 21** | Sep 21 | **P2 Data First** | Idempotency engine, two-phase mutation transactions & revision tracking | `[x] Completed` |
| **Day 22** | Sep 22 | **P2 Data First** | Manual ledger API (Fastify), tenant isolation & day-coverage semantics | `[x] Completed` |
| **Day 23** | Sep 23 | **P3 Voice Agent** | AssemblyAI session bootstrap, authenticated HTTP tool gateway | `[x] Completed` |
| **Day 24** | Sep 24 | **P3 Voice Agent** | Two-phase proposal state machine, ambiguity clarification & receipts | `[x] Completed` |
| **Day 25** | Sep 25 | **P4 Builder** | React/Vite workspace initialized, ECharts widget renderer, deterministic query engine (line/bar/KPI) | `[/] In Progress` |
| **Day 26** | Sep 26 | **P4 Builder** | Responsive grid layout, voice/manual layout editing, dashboard persistence | `[ ] Pending` |
| **Day 27** | Sep 27 | **P5 Validate** | End-to-end golden journey test, accessibility (390px/1280px), latency checks | `[ ] Pending` |
| **Day 28** | Sep 28 | **P5 Validate** | Labeled synthetic demo fixtures, demo reset isolation & backup restore drill | `[ ] Pending` |
| **Day 29** | Sep 29 | **P6 Submit** | Production deployment, video walkthrough (max 5 min), pitch deck (PDF) | `[ ] Pending` |
| **Day 30** | Sep 30 | **P6 Submit** | Final submission on lablab.ai, public repo verification & buffer | `[ ] Pending` |

---

## Detailed Daily Task Breakdown

### Day 1–17 · Sep 01–17, 2026: Phase P0 — System Architecture & Knowledge Graph
- **Role:** System Architect & Domain Modeler
- **Status:** `[x] Completed`
- **What was done:**
  - Established canonical documentation structure (18 notes under `docs/`).
  - Extracted 117 nodes and 239 relationships with Graphify into `docs/EasyLedger-Overview.canvas` and `docs/EasyLedger-Knowledge.canvas`.
  - Defined 19 Functional Requirements (`FR-01`–`FR-19`) and 7 Nonfunctional Requirements (`NFR-01`–`NFR-07`).
  - Recorded 9 Architectural Decision Records (`ADR-001`–`ADR-009`).

---

### Day 18 · Sep 18, 2026: Phase P1 — De-risking & Protocol Research
- **Role:** Backend & AI Integration Lead
- **Status:** `[x] Completed`
- **What was done:**
  - Researched AssemblyAI Voice Agent API tool calling capabilities (HTTP server tools vs client functions).
  - Designed bounded tool catalog (`get_context`, `propose_sales`, `commit_sales`, `propose_correction`, `query_sales`, etc.).
  - Specified two-phase mutation contract to prevent unreviewed model writes.

---

### Day 19 · Sep 19, 2026 (Today): Phase P1 Exit — Hackathon Alignment & Task Tracking
- **Role:** Project Owner & Agent Orchestrator
- **Status:** `[x] Completed`
- **What to Do:**
  - Align project documentation with official AssemblyAI Voice Agent Hackathon rules on lablab.ai.
  - Create day-by-day task planning system in `task/tasks.md` for seamless human and agent execution.
  - Update documentation navigation index and verify knowledge graph integrity.
- **Tasks to Do:**
  - [x] **TASK-19-01**: Create [`docs/18-Hackathon-Rules.md`](file:///C:/Project/EasyLedger/docs/18-Hackathon-Rules.md) detailing rules, requirements, judging criteria, and submission checklist.
  - [x] **TASK-19-02**: Create [`task/tasks.md`](file:///C:/Project/EasyLedger/task/tasks.md) providing structured daily execution steps for humans and agents.
  - [x] **TASK-19-03**: Update [`docs/00-Home.md`](file:///C:/Project/EasyLedger/docs/00-Home.md), [`docs/11-Hackathon-and-License.md`](file:///C:/Project/EasyLedger/docs/11-Hackathon-and-License.md), and [`docs/13-Sources.md`](file:///C:/Project/EasyLedger/docs/13-Sources.md) to cross-reference the new hackathon rules note.
  - [x] **TASK-19-04**: Run `npm run docs:sync` and `npm run docs:check` to regenerate canvases and verify zero broken links.
  - [x] **TASK-19-05**: Review git status and push changes to `origin/main` with descriptive commit message.
- **Agent Execution Guidance:**
  - Ensure all wikilinks use the `[[docs/XX-Name]]` format.
  - Never add `ArtifactMetadata` when writing workspace files.
- **Human Verification Checkpoint:**
  - Verify that `npm run docs:check` passes with 0 errors.

---

### Day 20 · Sep 20, 2026: Phase P2 — Data First: Schema, Migrations & Arithmetic
- **Role:** Database Engineer
- **Status:** `[x] Completed`
- **What to Do:**
  - Set up PostgreSQL schema with strict tenant isolation (`business_id`) on all tables.
  - Implement exact IDR/USD integer arithmetic (whole rupiah or cents, BIGINT) with zero floating-point calculations.
  - Create database migrations and seed scripts for demonstration catalog (Orange Juice, Mango Juice).
- **Tasks to Do:**
  - [x] **TASK-20-01**: Initialize `db/migrations` with table definitions: `businesses`, `products`, `sales`, `sale_revisions`, `day_coverages`, `coverage_revisions`, `operations`, `proposals`, `dashboards`.
  - [x] **TASK-20-02**: Implement database constraint checks: positive quantities (`quantity > 0`), non-negative prices, tenant-safe foreign keys, append-only revisions, and unique normalized product names per business.
  - [x] **TASK-20-03**: Implement exact calculation functions, handling `null` prices as unknown revenue and zero as known/free.
  - [x] **TASK-20-04**: Write unit tests for golden arithmetic: 10 orange juices @ 15,000 + 6 mango juices @ 18,000 = IDR 258,000; correcting orange to 8 yields IDR 228,000 (Test `T-01`).
  - [x] **TASK-20-05**: Add per-business IDR/USD currency selection, exact dollar-to-cent parsing, mixed-currency rejection and immutable ledger currency (Test `T-15`).
- **Agent Execution Guidance:**
  - Refer to [`docs/05-Data-Model.md`](file:///C:/Project/EasyLedger/docs/05-Data-Model.md) for table schemas and bounds (max 100 lines/request, quantity ≤ 1,000,000, price ≤ 1,000,000,000 minor units).
- **Human Verification Checkpoint:**
  - Completed on PostgreSQL 17: migration, repeatable seed and database constraint script passed. Domain inputs reject fractional IDR, excess USD decimal places, unsafe numbers and out-of-bound values before persistence.
- **Verification Evidence:**
  - `npm test` passed all Day 20 domain and schema checks.
  - PostgreSQL accepted null and zero as distinct prices and rejected cross-tenant references, invalid bounds, duplicate normalized products, invalid coverage, and currency changes.
  - `npm run docs:sync`, `npm run docs:check`, Graphify portability, and the final diff review passed before commit.

---

### Day 21 · Sep 21, 2026: Phase P2 — Data First: Idempotency & Mutations
- **Role:** Backend Engineer
- **Status:** `[x] Completed`
- **What to Do:**
  - Implement the atomic mutation transaction pipeline with server-enforced idempotency.
  - Build sale correction and undo mechanics using compensating revisions (never deleting historical records).
- **Tasks to Do:**
  - [x] **TASK-21-01**: Implement `OperationService`: stores `(business_id, idempotency_key, payload_hash, status, receipt)`. Ensure duplicate requests return the cached receipt.
  - [x] **TASK-21-02**: Implement atomic sale commit logic: increments `business.ledger_revision` in the same database transaction.
  - [x] **TASK-21-03**: Implement sale correction handler: verifies `expected_version`; rejects stale edits with `CONFLICT (409)`.
  - [x] **TASK-21-04**: Implement undo handler: generates compensating revisions linked to the original operation ID (Test `T-04`).
  - [x] **TASK-21-05**: Implement concurrency tests: simulate 20 concurrent identical requests and verify single logical commit (Test `T-03`).
- **Agent Execution Guidance:**
  - Review [`docs/05-Data-Model.md#mutation-transaction`](file:///C:/Project/EasyLedger/docs/05-Data-Model.md) and [`docs/02-SRS.md`](file:///C:/Project/EasyLedger/docs/02-SRS.md) FR-05, FR-06, FR-14, FR-15.
- **Human Verification Checkpoint:**
  - Verified on PostgreSQL 17-alpine: identical sequential and 20-way concurrent retries returned the exact stored receipt; altered payload reuse returned `IDEMPOTENCY_CONFLICT` (409 semantics).
- **Verification Evidence:**
  - `npm test` passed 11 domain and schema tests, including canonical payload hashing, missing-versus-null handling, validation bounds and impossible-date rejection.
  - `npm run test:database:day21` passed against a disposable PostgreSQL 17-alpine database. It verified one logical commit under 20 concurrent calls, atomic invalid-batch rollback, exact cached receipts, stale correction rejection, compensating undo, intervening-edit protection, append-only revisions, null-versus-zero prices and completed-day reopening.
  - Syntax checks and `git diff --check` passed. The test schema was isolated and removed after the run.

---

### Day 22 · Sep 22, 2026: Phase P2 — Data First: Manual Ledger API & Isolation
- **Role:** Backend Engineer
- **Status:** `[x] Completed`
- **What to Do:**
  - Build Fastify REST API routes for manual ledger management (sales history, pagination, filtering, catalog management).
  - Implement day-coverage semantics (open = gap/null, complete = confirmed zero).
  - Enforce tenant authorization boundaries across all endpoints.
- **Tasks to Do:**
  - [x] **TASK-22-01**: Build Fastify API shell (`apps/api`) with JSON Schema validation and error envelope (`docs/06-Agent-and-API`).
  - [x] **TASK-22-02**: Implement manual sales routes under the `api/v1` prefix: `GET/POST /sales` and `PUT /sales/:id` (paginated/filterable history, manual entry and edit).
  - [x] **TASK-22-03**: Implement catalog routes under the `api/v1` prefix: `GET/POST /products` and `PATCH /products/:id` (rename, deactivate, update default price), with product version migration and idempotency.
  - [x] **TASK-22-04**: Implement day-coverage route under the `api/v1` prefix: `POST /days/:date/coverage` (confirm complete or reopen), with audited idempotent transitions and automatic sales reopening.
  - [x] **TASK-22-05**: Implement multi-tenant isolation tests: verify User B cannot read or mutate User A's records (Test `T-07`).
- **Agent Execution Guidance:**
  - Route schemas must reject extra properties and enforce `Asia/Jakarta` timezone handling.
- **Human Verification Checkpoint:**
  - Verified that cross-tenant access returns 404 with zero data leaked; missing authentication returns 401 and an authenticated user without a business returns 403.

- **Verification Evidence:**
  - `npm test` passed 11 domain/schema tests and 5 Fastify contract tests, including a malformed-JSON 400 boundary check.
  - The Day 20 SQL check, `npm run test:database:day21`, and `npm run test:database:day22` passed against disposable PostgreSQL 17-alpine. Day 22 covered extra-property rejection, decimal-string money/BIGINT fields, tenant isolation, successful and stale manual corrections, product rename/default-price/deactivation and stale versions, normalized-name conflicts, idempotency same/different payloads, historical price preservation, unknown versus zero prices, bounded date filtering, cursor pagination, no-sale complete/reopen semantics, and automatic coverage reopening after sales.
  - `node --check apps/api/app.ts`, `node --check packages/domain/catalog.ts`, and `git diff --check` passed. The temporary PostgreSQL container and test schemas were removed after verification.

---

### Day 23 · Sep 23, 2026: Phase P3 — Voice Agent: AssemblyAI Session & Gateway
- **Role:** AI & Integration Engineer
- **Status:** `[x] Completed`
- **What to Do:**
  - Integrate AssemblyAI Voice Agent API.
  - Implement authenticated session bootstrap endpoint that issues ephemeral credentials without leaking long-lived secrets.
  - Register Fastify HTTP tool gateway endpoints accessible by the AssemblyAI Voice Agent.
- **Tasks to Do:**
  - [x] **TASK-23-01**: Implement `POST /api/voice/sessions`: authenticates merchant, initializes AssemblyAI voice agent session, and returns ephemeral client token.
  - [x] **TASK-23-02**: Implement HTTP tool gateway in Fastify: register endpoints for `get_context`, `propose_sales`, `commit_sales`, `propose_correction`, `commit_correction`, `query_sales`.
  - [x] **TASK-23-03**: Bind tool calls to server-held session identity; reject any client-supplied or model-supplied `business_id`.
  - [x] **TASK-23-04**: Write integration tests mocking AssemblyAI webhook tool invocations with valid and expired session tokens.
- **Agent Execution Guidance:**
  - Review [`docs/06-Agent-and-API.md`](file:///C:/Project/EasyLedger/docs/06-Agent-and-API.md) and [`docs/08-Security-and-Operations.md`](file:///C:/Project/EasyLedger/docs/08-Security-and-Operations.md).
- **Human Verification Checkpoint:**
  - Verified that no AssemblyAI API secrets appear in browser responses, network bundles, or client credentials; ephemeral provider tokens are generated server-side.
- **Verification Evidence:**
  - `npm test` passed 15 domain tests and 9 API contract tests (24/24 passing).
  - PostgreSQL 17-alpine integration test passed (`npm run test:database:day23`): verified session bootstrap, SHA-256 session token hashing in `voice_sessions` table, tenant isolation across tools, two-phase propose/commit for sales batches and corrections, stale correction conflicts (409), deterministic sales queries, and rejection of client/model-supplied `business_id` (422) and missing/invalid/expired session tokens (401).
  - Live ad-hoc verification against AssemblyAI Streaming API confirmed HTTP 201 session creation, generating a 2,466-byte ephemeral client token with 0 long-lived secret exposure.

---

### Day 24 · Sep 24, 2026: Phase P3 — Voice Agent: Proposals & Clarification
- **Role:** AI & Integration Engineer
- **Status:** `[x] Completed`
- **What to Do:**
  - Implement two-phase proposal state machine (`propose_*` → review → `commit_*`).
  - Implement clarification flow for unknown products, ambiguous dates, or missing prices.
  - Connect voice transcripts to client UI state and receipts.
- **Tasks to Do:**
  - [x] **TASK-24-01**: Implement proposal store: generates unique `proposal_id`, payload hash, and short-lived confirmation token.
  - [x] **TASK-24-02**: Implement ambiguity detection: ask clarification if a product is unknown, price is omitted without a catalog default, or date reference is ambiguous (Test `T-02`).
  - [x] **TASK-24-03**: Build proposal confirmation gate: verify `confirmation_token` cannot be forged or repeated by the LLM without user confirmation.
  - [x] **TASK-24-04**: Implement voice disconnect/cancellation handling: ensure interrupted turns leave the database unmutated (Test `T-08`).
- **Agent Execution Guidance:**
  - State machine: `idle → listening → interpreting → clarifying OR proposing → awaiting_confirmation → executing → committed/failed → responding → idle`.
- **Human Verification Checkpoint:**
  - Verified in `tests/api/voice.test.mjs`: `intent: 'unknown'`, unknown `product_id`, and unknown `sale_id` trigger 422 `NEEDS_CLARIFICATION` with targeted field error without ledger mutations.
- **Verification Evidence:**
  - `npm test` passed 26 tests (15 domain, 11 API contract tests).
  - Cancellation via `/api/v1/voice/tools/cancel_proposal` and `/api/v1/proposals/:id/cancel` sets proposal status to `cancelled` and rejects subsequent commit attempts with 409 `PROPOSAL_EXPIRED`.

---

### Day 25 · Sep 25, 2026: Phase P4 — Dashboard Builder: Widgets & Query Engine
- **Role:** Frontend & Analytics Engineer
- **Status:** `[/] In Progress`
- **What to Do:**
  - Initialize Vite + React 18 + TypeScript SPA workspace in `apps/web`.
  - Implement deterministic analytics query service in backend (sums, daily grouping, product breakdown).
  - Build React frontend dashboard with Apache ECharts widget components (line chart, bar chart, KPI cards).
  - Handle missing data vs zero sales correctly in visualizations.
- **Tasks to Do:**
  - [x] **TASK-25-01**: Initialize the Vite + React 18 + TypeScript SPA workspace in `apps/web` and refine its desktop-first application shell as a static dashboard-builder template: Overview, Ledger, Dashboard and Catalog navigation; visible voice status; filters/actions; KPI/chart placeholders; data-quality, selected-widget and source-transaction panels; and the existing Fastify `/api` proxy. This task establishes presentation and information architecture at the 1280px reference width; mobile composition remains assigned to **TASK-26-02** and final 390px/1280px accessibility acceptance remains assigned to Test `T-09`.
  - [x] **TASK-25-02**: Implement `POST /api/v1/analytics/query`: executes parameterized queries grouped by date or product; computes exact totals and completeness flags.
  - [ ] **TASK-25-03**: Implement ECharts renderers: Daily Revenue Line Chart, Product Sales Bar Chart, Total Revenue & Quantity KPI cards.
  - [ ] **TASK-25-04**: Implement missing-versus-zero visualization: open days with no records render as gaps; complete zero-sale days render as 0.
  - [ ] **TASK-25-05**: Implement chart datum tap-to-drilldown: tapping a bar/point opens modal showing authorized source transactions (FR-11, Test `T-05`).
- **Agent Execution Guidance:**
  - Refer to [`docs/07-Dashboard-and-UX.md`](file:///C:/Project/EasyLedger/docs/07-Dashboard-and-UX.md) and [`docs/05-Data-Model.md`](file:///C:/Project/EasyLedger/docs/05-Data-Model.md).
- **Human Verification Checkpoint:**
  - Run `npm --prefix apps/web run dev` and inspect the static shell at the 1280px reference width. Verify semantic navigation/controls, visible keyboard focus, no horizontal overflow and readable missing-versus-zero/unknown-price labels. Do not treat representative charts or controls as implemented analytics behavior.
- **Verification Evidence:**
  - `npm --prefix apps/web run build` passed on 2026-09-23: TypeScript completed and Vite 6.4.3 generated the production bundle with 27 transformed modules and no build errors.
  - Ad-hoc browser inspection at a 1280×900 viewport rendered the Figma-aligned desktop template with `scrollWidth=1265` inside `innerWidth=1280`, eight dashboard cards, 27 semantic focus targets and zero captured console errors; keyboard focus showed a 3px visible outline and no non-absolute element crossed the horizontal viewport boundary.
  - The template surfaces SRS/knowledge-graph semantics without claiming later tasks complete: unknown-price exclusions remain labeled (FR-08), open-day gaps and confirmed zero use distinct shapes plus text (FR-10), chart/table and manual-control alternatives are represented (NFR-05), and revision-matched source transactions are shown as a static preview (FR-11). **TASK-25-03**, **TASK-25-04** and **TASK-25-05** remain pending for real renderers, query-driven states and drilldown behavior.
- **Reflection:**
  - The prior neutral placeholder established routing but did not communicate the intended builder workflow. The refined shell adopts the friendly Google/Material direction from the approved Figma frame while keeping EasyLedger's trust signals prominent.
  - This pass intentionally stops at a desktop static template. It does not add ECharts, React Grid Layout, voice execution, dashboard persistence or live drilldown, and it does not claim 390px acceptance; those remain in their numbered Day 25–27 tasks.

---

### Day 26 · Sep 26, 2026: Phase P4 — Dashboard Builder: Responsive Grid & Persistence
- **Role:** Frontend Engineer
- **Status:** `[ ] Pending`
- **What to Do:**
  - Implement responsive drag/resize grid layout using React Grid Layout with keyboard alternatives.
  - Connect voice commands and manual UI controls to widget add/move/resize/delete operations.
  - Implement dashboard saving, versioning, and reopening with current ledger data recomputation.
- **Tasks to Do:**
  - [ ] **TASK-26-01**: Integrate React Grid Layout in `apps/web`: support adding, moving, resizing, and removing widgets.
  - [ ] **TASK-26-02**: Implement keyboard/touch accessible layout controls (Move Up, Move Down, Size presets) for mobile screens (390px).
  - [ ] **TASK-26-03**: Connect voice tool `update_dashboard` to update layout drafts without altering ledger records (FR-12).
  - [x] **TASK-26-04**: Implement `save_dashboard` and `GET /api/dashboards/:id`: persist named dashboard JSON; reopening recomputes current data from ledger (FR-13, Test `T-06`).
- **Agent Execution Guidance:**
  - Optimistic version checks: reject save if `expected_version` is stale.
- **Human Verification Checkpoint:**
  - Save a dashboard named "Weekly Overview", record new sales, reopen the dashboard, and verify that widgets reflect updated totals.
- **Verification Evidence:**
  - `npm test` passed 25 tests (15 domain, 10 API contract tests).
  - Verified Dashboard REST endpoints (`GET/POST /api/v1/dashboards`, `GET/PUT/DELETE /api/v1/dashboards/:id`) and voice tool `save_dashboard` with optimistic version locking (409 on stale version) and tenant isolation.

---

### Day 27 · Sep 27, 2026: Phase P5 — Validation & Hardening: E2E & Accessibility
- **Role:** QA & Fullstack Engineer
- **Status:** `[ ] Pending`
- **What to Do:**
  - Execute end-to-end golden journey test (`T-01`): voice sales entry → confirmation → receipt → correction → chart update.
  - Perform manual accessibility audit: ensure full workflow is operable without voice at mobile (390px) and desktop (1280px) widths.
  - Measure performance against NFR targets (tool response p95 < 1s, visible refresh p95 < 2s).
- **Tasks to Do:**
  - [ ] **TASK-27-01**: Run Playwright/Cypress E2E test covering the complete Golden Journey from [`docs/01-Product-Brief.md`](file:///C:/Project/EasyLedger/docs/01-Product-Brief.md).
  - [ ] **TASK-27-02**: Run accessibility audit (axe-core / keyboard navigation): test tab focus, visible labels, and screen reader text equivalents for charts (NFR-05, Test `T-09`).
  - [ ] **TASK-27-03**: Benchmark query latency with 10,000 seeded sales records; record p50 and p95 timings (NFR-02, Test `T-11`).
- **Agent Execution Guidance:**
  - Record actual timings and test logs into a verification summary.
- **Human Verification Checkpoint:**
  - Complete the full sales entry and correction flow with microphone permissions disabled.

---

### Day 28 · Sep 28, 2026: Phase P5 — Validation & Hardening: Demo Isolation & Restore
- **Role:** DevOps & Security Engineer
- **Status:** `[ ] Pending`
- **What to Do:**
  - Seed labeled synthetic demo datasets with isolated demo reset functionality.
  - Rehearse database backup and restoration drill to ensure audit trails survive recovery.
  - Final security audit: check CORS, CSP, cookie flags, and verify zero secret leakage.
- **Tasks to Do:**
  - [ ] **TASK-28-01**: Implement synthetic demo fixtures with prominent `[DEMO DATA]` UI badges (FR-16).
  - [ ] **TASK-28-02**: Build demo reset endpoint: restricted to demo workspace; verify it cannot wipe real merchant records (Test `T-10`).
  - [ ] **TASK-28-03**: Execute PostgreSQL backup and restore rehearsal: verify all sales, revisions, and operations match pre-backup state (NFR-07).
  - [ ] **TASK-28-04**: Run security scan on web bundle: confirm zero API keys, tokens, or environment credentials exist in client code.
- **Agent Execution Guidance:**
  - Refer to [`docs/08-Security-and-Operations.md`](file:///C:/Project/EasyLedger/docs/08-Security-and-Operations.md).
- **Human Verification Checkpoint:**
  - Trigger demo reset and confirm that only synthetic records are reset.

---

### Day 29 · Sep 29, 2026: Phase P6 — Submission & Demo: Deployment & Presentation
- **Role:** Product Lead & Presenter
- **Status:** `[ ] Pending`
- **What to Do:**
  - Deploy working web application and API to Render (`apps/web` as Static Site, `apps/api` as Web Service, and managed Render PostgreSQL).
  - Record 5-minute video walkthrough following the submission narrative.
  - Prepare pitch deck (PDF) covering problem, solution, architecture, and live demo links.
- **Tasks to Do:**
  - [ ] **TASK-29-01**: Deploy Fastify API (`apps/api`) and PostgreSQL database to Render with HTTPS, rate limiting, and CORS configuration.
  - [ ] **TASK-29-02**: Deploy React frontend (`apps/web`) to Render Static Site; verify live AssemblyAI voice agent connectivity.
  - [ ] **TASK-29-03**: Create 16:9 cover image for lablab.ai submission.
  - [ ] **TASK-29-04**: Record and edit MP4 video presentation (max 5 minutes):
    1. Introduction: Merchant pain point (paper/phone ledger friction).
    2. Demo: Spoken sales entry → instant receipt → voice mistake correction → chart update → dashboard save.
    3. Architecture: AssemblyAI Voice Agent API + Fastify + PostgreSQL exact math.
  - [ ] **TASK-29-05**: Export pitch deck to PDF format.
- **Agent Execution Guidance:**
  - Check submission requirements against [`docs/18-Hackathon-Rules.md`](file:///C:/Project/EasyLedger/docs/18-Hackathon-Rules.md).
- **Human Verification Checkpoint:**
  - Review video presentation duration (must be ≤ 5 minutes) and verify audio clarity.

---

### Day 30 · Sep 30, 2026: Phase P6 — Submission: Final Review & Submission
- **Role:** Project Owner
- **Status:** `[ ] Pending`
- **What to Do:**
  - Complete official submission on lablab.ai before deadline.
  - Perform final repository cleanliness check and verify all links.
- **Tasks to Do:**
  - [ ] **TASK-30-01**: Fill out lablab.ai submission form: Project Title, Short Description (< 255 chars), Long Description (> 100 words), tags.
  - [ ] **TASK-30-02**: Attach Cover Image (16:9), MP4 Video link, and PDF Pitch Deck.
  - [ ] **TASK-30-03**: Provide Public GitHub Repository link (`https://github.com/dragonsterm/EasyLedger`) and Live Demo URL.
  - [ ] **TASK-30-04**: Final repository audit: ensure `README.md` is updated, license is verified MIT, and no sensitive logs exist.
- **Human Verification Checkpoint:**
  - Confirm receipt of lablab.ai submission confirmation email/screen.
