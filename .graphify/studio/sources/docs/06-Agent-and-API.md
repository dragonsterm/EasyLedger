---
title: Agent workflow and API contracts
status: proposed
tags: [easyledger, agent, contracts]
---
# Agent workflow and API contracts

AssemblyAI selects registered tools; EasyLedger determines what can actually happen. The vendor supports server HTTP tools and client function tools, which have different execution paths. Keep the integration adapter separate from the following **proposed EasyLedger contracts**. These are not copied AssemblyAI endpoint names. Vendor references: [[docs/13-Sources]].

## State machine

`idle → listening → interpreting → clarifying OR proposing → awaiting_confirmation → executing → committed/failed → responding → idle`.

Read-only questions may go directly from interpreting to executing. Ledger mutations require a visible normalized proposal and confirmation tied to its ID/hash; “yes” without one active proposal is insufficient. A user can cancel before execution. Interrupting spoken output does not undo a database commit. Once execution starts, cancellation reports the authoritative operation status and offers explicit undo if already committed. Expired proposals require a fresh review.

## Tool catalog

| Tool | Essential arguments | Result / restrictions |
| --- | --- | --- |
| get_context | optional dashboard_id | Authorized catalog, currency, timezone, selection and versions; bounded results |
| propose_sales | lines(product_id, quantity, unit_price?, sale_date), intent=additional | Validated proposal in the business currency, computed totals, warnings; no write to ledger |
| commit_sales | proposal_id, confirmation_token, idempotency_key | Atomic receipt for confirmed exact payload |
| propose_correction | sale_id, expected_version, changed fields, reason | Before/after proposal; ambiguous sale ID requires clarification |
| commit_correction | proposal_id, confirmation_token, idempotency_key | Corrected receipt, not an extra sale |
| propose_undo | operation_id, expected_versions | Validated before/after preview and proposal ID for an eligible operation |
| undo_operation | operation_id, expected_versions, confirmation_token, idempotency_key | Compensating revision or conflict |
| query_sales | metric=units/revenue, dimension=date/product/none, date range, product_ids, comparison? | Rows, exact totals, completeness, effective filters, ledger_revision |
| get_source_records | query token, selected bucket, cursor | Authorized paginated records or stale-query response |
| update_dashboard | dashboard_id, expected_version, typed operations | Validated draft add/edit/move/resize/remove/select; no ledger writes |
| save_dashboard | dashboard_id?, name, expected_version, draft, idempotency_key | Saved versioned configuration |
| propose_day_coverage | local date, state=open/complete, expected_version | Preview explaining missing-versus-zero behavior and proposal ID |
| set_day_coverage | proposal_id, confirmation_token, idempotency_key | Authorized audited coverage change; no-row complete dates become zero |

Selected widget context may be supplied by a client function, but IDs and versions are verified by the server. Never infer target solely from stale conversation history. Tool schemas reject extra properties, arbitrary URLs, SQL, HTML, JavaScript and unknown enum values. Use bounded date ranges (maximum 366 days), page size (maximum 100), and widget count (maximum 20) for MVP.

The confirmation token is server-issued only after an authenticated UI or unambiguous voice confirmation event matches an active proposal. Binding covers user, business, session, proposal payload and expiry. A model cannot authorize a write merely by repeating a token from a tool result. Proposal tools return a preview identifier, not a ready-to-use authorization token. The session adapter must enforce this transition outside model reasoning. Read-only and temporary dashboard-draft changes do not require ledger confirmation.

## Common response envelope

Success: `request_id`, `operation_id?`, `status`, `data`, `currency?`, `ledger_revision?`, `dashboard_version?`, `warnings[]`, `undo_available`. Monetary values use decimal strings in exact business minor units. Error: `request_id`, `code`, `message`, `retryable`, `field_errors?`, `current_version?`. Codes include UNAUTHORIZED, FORBIDDEN, VALIDATION_ERROR, NEEDS_CLARIFICATION, CONFLICT, IDEMPOTENCY_CONFLICT, PROPOSAL_EXPIRED, RATE_LIMITED and PROVIDER_UNAVAILABLE. Return minimal safe messages; retain correlation IDs rather than secrets in diagnostics.

Suggested application routes: `POST /api/voice/sessions`, `POST /api/proposals`, `POST /api/proposals/:id/commit`, `POST /api/operations/:id/undo`, `GET /api/operations/:id`, `GET /api/sales`, `POST /api/analytics/query`, `GET /api/dashboards/:id`, `PUT /api/dashboards/:id`. Version these under an API prefix before implementation. HTTP semantics: 401/403 for authentication/authorization, 422 for validation, 409 for version/key conflicts, 429 for limits, 503 for unavailable dependencies. Mutating requests use a stable idempotency header plus expected versions.

## Authentication and failures

Bootstrap voice access only after authenticating the merchant. Bind any provider-facing tool credential to server-held session/business identity and expiry; do not trust a model-supplied business_id. Verify the exact provider header/token mechanism during the spike. If secure HTTP session binding cannot be demonstrated, route client function calls through the user's authenticated API instead of releasing an unsafe endpoint.

Only acknowledge success after durable tool success. On tool timeout, read operation status with the same key before retry; never create a new key to “try again.” Limit retries to transient failures with bounded backoff. For ambiguous input ask one focused clarification. If AssemblyAI is unavailable, preserve drafts, show the failure, and offer manual actions. No imagined totals or hidden fallback writes.

Prompt guidance for the future agent: use only registered tools, explain proposed changes, identify the selected object, clarify ambiguity, distinguish missing data from zero, and report tool errors honestly. Prompt text is not a security boundary; [[docs/08-Security-and-Operations]] and [[docs/09-Verification]] define enforcement and checks.
