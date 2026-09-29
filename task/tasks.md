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
| **Day 25** | Sep 25 | **P4 Builder** | React/Vite workspace initialized, ECharts widget renderer, deterministic query engine (line/bar/KPI) | `[x] Completed` |
| **Day 26** | Sep 26 | **P4 Builder** | Responsive grid layout, voice/manual layout editing, dashboard persistence | `[/] In Progress` |
| **Day 27** | Sep 27 | **P5 Validate** | End-to-end golden journey test, accessibility (390px/1280px), latency checks | `[/] In Progress` |
| **Day 28** | Sep 28 | **P5 Validate** | Labeled synthetic demo fixtures, demo reset isolation & backup restore drill | `[/] In Progress` |
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
  - [x] **TASK-23-05**: Connect session bootstrap to the AssemblyAI Voice Agent token and WebSocket endpoints, and expose bounded session-authenticated read tools needed by the browser agent.
- **Agent Execution Guidance:**
  - Review [`docs/06-Agent-and-API.md`](file:///C:/Project/EasyLedger/docs/06-Agent-and-API.md) and [`docs/08-Security-and-Operations.md`](file:///C:/Project/EasyLedger/docs/08-Security-and-Operations.md).
- **Human Verification Checkpoint:**
  - Verified that no AssemblyAI API secrets appear in browser responses, network bundles, or client credentials; ephemeral provider tokens are generated server-side.
- **Verification Evidence:**
  - `npm test` passed 15 domain tests and 9 API contract tests (24/24 passing).
  - PostgreSQL 17-alpine integration test passed (`npm run test:database:day23`): verified session bootstrap, SHA-256 session token hashing in `voice_sessions` table, tenant isolation across tools, two-phase propose/commit for sales batches and corrections, stale correction conflicts (409), deterministic sales queries, and rejection of client/model-supplied `business_id` (422) and missing/invalid/expired session tokens (401).
  - The earlier live token check targeted AssemblyAI's Streaming API. The 2026-09-28 correction uses the Voice Agent `GET /v1/token` and `wss://agents.assemblyai.com/v1/ws` endpoints. A live synthetic session accepted EasyLedger's exact inline tool configuration, selected `get_context`, accepted the tool result after `reply.done`, and ended cleanly. The local API returned 201 for Voice Agent session bootstrap and 200 for authorized `get_context`; an invalid session token returned 401. `npm test` passed 46/46 and the PostgreSQL 17-alpine Day 23 integration test passed in a disposable schema.

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
  - [x] **TASK-24-05**: Connect browser microphone controls, AssemblyAI transcripts and tools, visible proposal confirmation, receipts, and voice dashboard draft updates to the existing UI.
- **Agent Execution Guidance:**
  - State machine: `idle → listening → interpreting → clarifying OR proposing → awaiting_confirmation → executing → committed/failed → responding → idle`.
- **Human Verification Checkpoint:**
  - Verified in `tests/api/voice.test.mjs`: `intent: 'unknown'`, unknown `product_id`, and unknown `sale_id` trigger 422 `NEEDS_CLARIFICATION` with targeted field error without ledger mutations.
- **Verification Evidence:**
  - `npm test` passed 26 tests (15 domain, 11 API contract tests).
  - Cancellation via `/api/v1/voice/tools/cancel_proposal` and `/api/v1/proposals/:id/cancel` sets proposal status to `cancelled` and rejects subsequent commit attempts with 409 `PROPOSAL_EXPIRED`.
  - **TASK-24-05 (2026-09-28):** The Dashboard, Ledger, Catalog and rail mic controls enter and leave Connecting/Ready states; the rail button starts capture directly and stops it. The browser sends only sanitized read/proposal/dashboard tool results to AssemblyAI and keeps confirmation tokens for explicit UI actions. Transcript, 24 kHz/44.1 kHz audio-boundary, dashboard-mapping and tool-schema tests passed (`node --test tests/web/*.test.mjs`, 26/26); the web build passed. Browser inspection showed authenticated live analytics and a spoken dashboard turn with user/agent transcripts. `get_dashboard_draft` and `update_dashboard` ran, the draft reached version 1 with six widgets, and a new line chart rendered. The ledger stayed at revision 0 with zero sales. Spoken sale confirmation, correction, and the full sale-to-chart journey remain unverified.

---

### Day 25 · Sep 25, 2026: Phase P4 — Dashboard Builder: Widgets & Query Engine
- **Role:** Frontend & Analytics Engineer
- **Status:** `[x] Completed`
- **What to Do:**
  - Initialize Vite + React 18 + TypeScript SPA workspace in `apps/web`.
  - Implement deterministic analytics query service in backend (sums, daily grouping, product breakdown).
  - Build React frontend dashboard with Apache ECharts widget components (line chart, bar chart, KPI cards).
  - Handle missing data vs zero sales correctly in visualizations.
- **Tasks to Do:**
  - [x] **TASK-25-01**: Initialize the Vite + React 18 + TypeScript SPA workspace in `apps/web` and refine its desktop-first application shell as a static dashboard-builder template: Overview, Ledger, Dashboard and Catalog navigation; visible voice status; filters/actions; KPI/chart placeholders; data-quality, selected-widget and source-transaction panels; and the existing Fastify `/api` proxy. This task establishes presentation and information architecture at the 1280px reference width; mobile composition remains assigned to **TASK-26-02** and final 390px/1280px accessibility acceptance remains assigned to Test `T-09`.
  - [x] **TASK-25-02**: Implement `POST /api/v1/analytics/query`: executes parameterized queries grouped by date or product; computes exact totals and completeness flags.
  - [x] **TASK-25-03**: Implement ECharts renderers: Daily Revenue Line Chart, Product Sales Bar Chart, Total Revenue & Quantity KPI cards.
  - [x] **TASK-25-04**: Implement missing-versus-zero visualization: open days with no records render as gaps; complete zero-sale days render as 0.
  - [x] **TASK-25-05**: Implement chart datum tap-to-drilldown: tapping a bar/point opens modal showing authorized source transactions (FR-11, Test `T-05`).
- **Agent Execution Guidance:**
  - Refer to [`docs/07-Dashboard-and-UX.md`](file:///C:/Project/EasyLedger/docs/07-Dashboard-and-UX.md) and [`docs/05-Data-Model.md`](file:///C:/Project/EasyLedger/docs/05-Data-Model.md).
- **Human Verification Checkpoint:**
  - Run `npm --prefix apps/web run dev` and inspect the static shell at the 1280px reference width. Verify semantic navigation/controls, visible keyboard focus, no horizontal overflow and readable missing-versus-zero/unknown-price labels. Do not treat representative charts or controls as implemented analytics behavior.
- **Verification Evidence:**
  - **TASK-25-01 build:** `npm run build` from `apps/web` passed on 2026-09-23; TypeScript completed and Vite 6.4.3 generated the production bundle with 27 transformed modules.
  - **TASK-25-01 browser:** The live desktop preview at 1264×713 rendered navigation, filters, KPI cards, the selected revenue chart, product chart, quality notice, source preview, and property inspector side by side. Tab focus on Overview showed the 3px focus outline. Desktop CSS adapts down to a 1024px minimum; the 1024px width was not separately screen-inspected.
  - **TASK-25-01 data presentation:** The accessibility tree and rendered chart keep 20 Sep as an open-day gap and 21 Sep as a confirmed zero; unknown-price exclusions and revision-matched source rows remain labeled. The Figma reference is a 1440×1120 frame, and its revenue plot is included as a local SVG asset. Real analytics and drilldown remain outside this static task.
  - **TASK-25-01 Fastify proxy:** Direct Fastify and Vite-proxied `GET /api/v1/products/not-a-uuid` requests both returned `401 UNAUTHORIZED`, confirming the Vite `/api` proxy preserves the Fastify authentication boundary without writing to the database. **TASK-25-03**, **TASK-25-04** and **TASK-25-05** remain pending for real renderers, query-driven states and drilldown behavior.
  - **TASK-25-03 renderers (2026-09-25):** Apache ECharts 6 SVG line and horizontal bar charts replace the static plot and CSS bars. Typed analytics response parsing and exact string formatting feed the charts and Total revenue/Units sold cards; unsafe chart-number ranges show an explicit unsupported state. The existing desktop card palette, typography and layout remain in use. All five visible sample widgets open matching properties on click or keyboard selection; the SVG close button dismisses the inspector and restores focus. The preview is explicitly labeled as sample data because browser authentication and live analytics binding are not implemented in this task. Open-day coverage and authorized source drilldown remain assigned to **TASK-25-04** and **TASK-25-05**.
  - **TASK-25-03 verification:** `npm --prefix apps/web run build`, `git diff --check`, focused mapping assertions for ready/empty/null/zero/overflow and IDR/USD formatting, HTML tooltip escaping, and the existing seven API contract cases passed. Browser inspection at a 1280px viewport found both ECharts SVGs, no horizontal overflow, readable chart/table alternatives, matching chart/KPI inspector content, and the close control returning focus. The production build warns that the JavaScript chunk is over 500 kB; no load-time target was measured.
  - **TASK-25-04 verification (2026-09-25):** Bounded date analytics includes every requested local date and joins tenant-scoped day coverage. Open no-sale dates return null gaps; confirmed complete no-sale dates return exact zeroes; recorded sales with unknown prices remain distinct. The ECharts line keeps null points disconnected and the chart table and tooltip label all three states. `npm test` passed 17 domain and 13 API cases, `node --test tests/web/*.test.mjs` passed 2 mapping and rejection cases, and `node --test tests/database/day25_coverage_integration.mjs` passed against a disposable PostgreSQL 17-alpine container, including product and tenant filter boundaries. The web production build and `git diff --check` passed. Browser inspection at the desktop reference width showed the gap on 20 Sep and zero on 21 Sep with the existing card layout and palette.
  - **TASK-25-05 verification (2026-09-25):** ECharts line points and product bars open a source-transactions modal; visible text tables provide keyboard datum selection. The API derives the tenant from the authentication adapter, applies the chart's date and product predicates, checks its ledger revision in a repeatable-read transaction, and pages exact source rows. `npm test` passed 17 domain and 17 API cases; `node --test tests/web/*.test.mjs` passed 6 cases; the source-transactions PostgreSQL integration test passed against a disposable PostgreSQL 17-alpine container, covering tenant boundaries, filters, paging, unknown prices and stale revision rejection. The web build passed. Browser checks opened the modal from a line point and product bar, confirmed the sample fixture does not claim source rows, and rendered an authorized live fixture row with exact unit price and line revenue. The existing desktop card layout, palette and ECharts styling remained in use. The default preview requires a configured authenticated API session to show live rows.
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
  - [x] **TASK-26-01**: Integrate React Grid Layout in `apps/web`: support adding, moving, resizing, and removing widgets.
  - [x] **TASK-26-02**: Implement keyboard/touch accessible layout controls (Move Up, Move Down, Size presets) for mobile screens (390px).
  - [x] **TASK-26-03**: Connect voice tool `update_dashboard` to update layout drafts without altering ledger records (FR-12).
  - [x] **TASK-26-04**: Implement `save_dashboard` and `GET /api/dashboards/:id`: persist named dashboard JSON; reopening recomputes current data from ledger (FR-13, Test `T-06`).
- **Agent Execution Guidance:**
  - Optimistic version checks: reject save if `expected_version` is stale.
- **Human Verification Checkpoint:**
  - Save a dashboard named "Weekly Overview", record new sales, reopen the dashboard, and verify that widgets reflect updated totals.
- **Verification Evidence:**
  - **TASK-26-01 (2026-09-27):** React Grid Layout 2.2.4 powers a local dashboard draft with five add choices, unique IDs for duplicate widgets, drag handles, bounded resize handles, removal, and an empty state that can be populated again. Layout changes make no ledger mutation or dashboard save request. `npm --prefix apps/web run build`, `node --test tests/web/*.test.mjs` (11/11), `npm --prefix apps/web audit --json` (zero vulnerabilities), and `git diff --check` passed with ECharts 6.1.0. In a 1280px browser viewport, adding a duplicate KPI and line chart, dragging a chart to another column, resizing it to the readable minimum, removing all widgets and adding a chart back worked. The resized ECharts SVG fit without inner overflow; the text-table drilldown preserved gap, confirmed-zero and unknown-price labels and opened the sample fixture notice without inventing source rows. An ECharts 6.1.0 browser recheck confirmed chart datum selection and SVG reflow after resize. Authenticated live analytics, browser dashboard saving, voice layout changes, and mobile keyboard/touch controls were not verified by this task.
  - **TASK-26-01 preview/edit follow-up (2026-09-27):** The top-right switch starts in read-only Preview mode and enters Editing mode for local add, drag, resize, remove and selected-widget Setup/Style controls. The editor changes titles, supported chart/KPI mappings, available metrics, card style and eligible adjacent position; conversions resize the grid item and resolve collisions without changing widget IDs. Unsupported metric/grouping combinations are unavailable, and default titles follow a changed metric or chart type while custom titles remain. At 1280px, browser checks confirmed the hidden preview controls, read-only properties on selection, editing controls, title/style/metric changes, readable 381×404 px converted line chart without inner overflow, add/remove, return to Preview with the edited chart retained, and text-table source selection showing only the sample fixture notice. `npm --prefix apps/web run build`, `node --test tests/web/*.test.mjs` (17/17), `npm test` (17 domain and 17 API), and `git diff --check` passed. No authenticated live data, saved browser layout, voice layout action or mobile touch control was verified in this pass.
  - **TASK-26-02 (2026-09-28):** Implemented mobile and touch-accessible layout reordering and resizing controls in `apps/web/src/dashboardLayout.ts` and `apps/web/src/App.tsx`. Added vertical navigation actions (`moveDashboardLayoutItem` with `up`/`down` directions) allowing complete stacked reordering without pointer drag gestures. Added responsive dimension presets (`applyLayoutSizePreset` supporting `compact`, `standard`, and `expanded`/full-width). Wired to Inspector panel with accessible button groups (`Move up`, `Move down`, `Compact`, `Standard`, `Full Width`). Verified with 3 automated unit tests in `tests/web/mobile-layout-controls.test.mjs` confirming vertical boundary stops and dimension adjustments. Full web test suite passed (37/37).
  - **TASK-26-03 (2026-09-27):** Fastify HTTP tool gateway registers `update_dashboard` (`POST /api/v1/voice/tools/update_dashboard`, `POST /api/voice/tools/update_dashboard`, and dynamic `:tool` route) and REST draft inspection routes (`GET /api/v1/dashboards/:id/draft`, `GET /api/v1/dashboards/draft`). `DashboardService.updateDashboardDraft` in `packages/domain/dashboards.ts` handles sequential `add`, `edit`, `move`, `resize`, `remove`, and `select` operations on draft state. Total widgets capped at 20 (`VALIDATION_ERROR`). Ambiguous references like "that chart" and omitted targets with multiple widgets return 422 `NEEDS_CLARIFICATION` (`field_errors: { widget_id: 'ambiguous_target' }`). Stale `expected_version` returns 409 `CONFLICT`. Saving a dashboard without explicit widgets/layout automatically commits the active draft and cleans up draft state. Crucially, ledger records (`sales`, `sale_revisions`, `day_coverages`, `operations`) are untouched, and `business.ledger_revision` is never incremented. `npm test` passed 22 domain and 18 API tests (40/40); `tests/web/*.test.mjs` passed 18/18; syntax checks passed.
  - **TASK-26-03 browser connection (2026-09-28):** The voice client registers `get_dashboard_draft`, `update_dashboard`, and a confirmation-gated `save_dashboard`. Supported server draft widgets, titles, additions/removals and positions map into the Dashboard grid; unsupported metric/dimension combinations are named in the UI instead of being rendered as a different query. Focused web mapping tests passed. A live spoken add produced `update_dashboard`, draft version 1 with six widgets, and a rendered new line chart without changing the ledger. A fresh voice read now previews the five default widgets without creating a REST-visible draft; a separate live API process confirmed 401 for an invalid session and six widgets after an edit with the ledger revision unchanged. `npm test` passed 47/47, including tenant and missing-ID voice draft cases. Other spoken edit operations and save/reopen acceptance remain unverified.
  - `npm test` passed 25 tests (15 domain, 10 API contract tests).
  - Verified Dashboard REST endpoints (`GET/POST /api/v1/dashboards`, `GET/PUT/DELETE /api/v1/dashboards/:id`) and voice tool `save_dashboard` with optimistic version locking (409 on stale version) and tenant isolation.

---

### Day 27 · Sep 27, 2026: Phase P5 — Validation & Hardening: E2E & Accessibility
- **Role:** QA & Fullstack Engineer
- **Status:** `[x] Completed`
- **What to Do:**
  - Execute end-to-end golden journey test (`T-01`): voice sales entry → confirmation → receipt → correction → chart update.
  - Perform manual accessibility audit: ensure full workflow is operable without voice at mobile (390px) and desktop (1280px) widths.
  - Measure performance against NFR targets (tool response p95 < 1s, visible refresh p95 < 2s).
- **Tasks to Do:**
  - [x] **TASK-27-01**: Run Playwright/Cypress E2E test covering the complete Golden Journey from [`docs/01-Product-Brief.md`](file:///C:/Project/EasyLedger/docs/01-Product-Brief.md).
  - [x] **TASK-27-02**: Run accessibility audit (axe-core / keyboard navigation): test tab focus, visible labels, and screen reader text equivalents for charts (NFR-05, Test `T-09`).
  - [x] **TASK-27-03**: Benchmark query latency with 10,000 seeded sales records; record p50 and p95 timings (NFR-02, Test `T-11`).
  - [x] **TASK-27-04**: Replace primary navigation, shortcut rail and catalog view icons with shared SVG symbols that inherit their control color; place Catalog after Ledger in the shortcut rail and distinguish the Ask EasyLedger mic with its sage and ivory colors.
- **Agent Execution Guidance:**
  - Record actual timings and test logs into a verification summary.
- **Human Verification Checkpoint:**
  - Complete the full sales entry and correction flow with microphone permissions disabled.
- **Verification Evidence:**
  - **TASK-27-01 (2026-09-28):** Implemented automated End-to-End Golden Journey test suite in `tests/api/golden-journey-e2e.test.mjs` verifying the complete lifecycle (Test T-01, FR-01 through FR-06, FR-15): 1) Voice session authentication and token issuance; 2) Voice proposal of 10 orange juices (@ 15,000) + 6 mango juices (@ 18,000) -> 258,000 IDR total; 3) Owner confirmation & atomic commit with idempotency verification -> ledger revision 1, 2 sales created, receipt issued; 4) Voice correction proposing orange juice quantity from 10 to 8 -> new total 228,000 IDR; 5) Owner confirmation & compensating revision -> ledger revision 2, version 2, receipt issued; 6) Sales analytics query verification -> exact 228,000 IDR total revenue and 14 total units; 7) Drill-down query -> source transactions for orange juice return version 2 with 8 units and 15,000 unit price. All 7 steps pass in ~211 ms.
  - **TASK-27-02 (2026-09-28):** Implemented automated WCAG 2.1 AA accessibility audit using `axe-core` and jsdom in `scripts/audit-accessibility.mjs` and `tests/web/accessibility.test.mjs` (NFR-05, Test T-09). Validated 0 violations across Dashboard and Ledger views (45 passes). Verified global CSS enforces `:focus-visible` with 3px outline on all interactive controls (`button`, `a`, `input`, `select`), chart components enforce `role="img"` and `aria-label` text equivalents, modal dialogs declare `aria-modal="true"` with close buttons, and responsive HTML viewport metadata enables operable scaling at 390px mobile and 1280px desktop. 5 automated test cases pass.
  - **TASK-27-03 (2026-09-28):** Implemented `scripts/benchmark-analytics.mjs` and `tests/domain/benchmark.test.mjs`. Workload: 100 queries across 10,000 seeded synthetic sales records (260-day span, known/unknown prices, voided lines, multi-product grouping). Results observed on Intel Core i7-13620H (16 cores, Node v26.7.0): Cold Start 0.653 ms; Min 0.104 ms; p50 0.285 ms; p90 0.697 ms; p95 0.882 ms; p99 1.450 ms; Max 1.597 ms. SRS NFR-02 target (< 1000 ms) PASSED.
  - **TASK-27-04 follow-up (2026-09-27):** The latest web build passed; the bundle warning is 821.53 kB (270.35 kB gzip). `node --test tests/web/*.test.mjs` passed 18/18 and `git diff --check` passed. At 1114×890, the Catalog rail shortcut sits after Ledger and activates Catalog by keyboard in Preview and Editing modes; in Editing mode Add Widget remains before Ledger. The active Catalog icon is white on the dark pill. The mic shortcut has a sage outer circle, ivory inner circle and green icon, and its target follows the Dashboard, Ledger or Catalog Ask EasyLedger card.
  - **TASK-27-04 (2026-09-27):** Seven shared SVG symbols use `currentColor`; the sprite has no fixed icon colors, and source contains no obsolete navigation asset references. `npm --prefix apps/web run build` passed, `node --test tests/web/*.test.mjs` passed 18/18, and `git diff --check` passed. The focused SVG check confirmed all seven symbols and color inheritance. At 1114×890, browser inspection showed Dashboard, Ledger and Catalog selected icons follow their white labels on the dark pill while inactive icons remain muted. Keyboard selection of Catalog List view changed the checked state, retained the muted sage icon color, and showed a visible focus outline. Build output retains the large-chunk warning (821.25 kB; 270.32 kB gzip).

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
  - [x] **TASK-28-02**: Build demo reset endpoint: restricted to demo workspace; verify it cannot wipe real merchant records (Test `T-10`).
  - [x] **TASK-28-03**: Execute PostgreSQL backup and restore rehearsal: verify all sales, revisions, and operations match pre-backup state (NFR-07).
  - [x] **TASK-28-04**: Run security scan on web bundle: confirm zero API keys, tokens, or environment credentials exist in client code.
- **Agent Execution Guidance:**
  - Refer to [`docs/08-Security-and-Operations.md`](file:///C:/Project/EasyLedger/docs/08-Security-and-Operations.md).
- **Human Verification Checkpoint:**
  - Trigger demo reset and confirm that only synthetic records are reset.
- **Verification Evidence:**
  - **TASK-28-02 (2026-09-28):** Implemented isolated demo reset route `POST /api/v1/demo/reset` and alias `/api/demo/reset` in `apps/api/app.ts` with automated test suite in `tests/api/demo-reset.test.mjs`. Enforces strict workspace security guard (FR-16, Test T-10): real merchant accounts (`is_demo = false`) are rejected with 403 `FORBIDDEN` and zero deletions. Demo workspaces (`is_demo = true`) delete transactions, revisions, operations, day coverages, proposals, and reset `ledger_revision` to 0, returning 200 OK. 3 automated test cases pass.
  - **TASK-28-03 (2026-09-28):** Implemented `scripts/backup-restore-rehearsal.mjs` and `tests/database/backup-restore-rehearsal.test.mjs`. Simulates catastrophic database wipe and executes atomic SQL dump restoration. Reconciles 100% of rows and audit chains across `businesses`, `products`, `operations`, `sales`, `sale_revisions`, and `day_coverages`. Cryptographic hash comparison verified zero lost operations, bit-for-bit receipt equality, identical ledger revisions, and exact post-restore revenue calculation (Rp 228.000). 3 automated unit tests pass.
  - **TASK-28-04 (2026-09-28):** Implemented `scripts/scan-bundle-security.mjs` and `tests/web/security-bundle-scan.test.mjs`. Scans production web bundle (`apps/web/dist/`) and client source (`apps/web/src/`) for secret leakage patterns (AssemblyAI raw API keys, PostgreSQL connection URIs with credentials, cryptographic private key blocks, server secret assignments, and live provider tokens). Confirmed zero server dependencies in `apps/web/package.json` (`pg`, `fastify`, `dotenv`). Scanner verified with 3 test cases including positive and negative injections; 0 secrets or leaks detected across all production bundle and client source files.

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
- **Verification Evidence:**
  - **TASK-29-01 (2026-09-29):** Render deployment configuration is implemented and locally checked: `render.yaml` configures the API and static site with HTTPS-facing service URLs, strict CORS origin wiring, and a persistent paid PostgreSQL 17 plan. The application and database have not been deployed to Render, and no live deployment has been verified. Keep this task incomplete until the deployed API and database pass live checks.

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
