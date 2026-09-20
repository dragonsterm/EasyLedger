---
title: Software requirements specification
status: proposed
tags: [easyledger, requirements]
---
# Software requirements specification

## Purpose and boundary

Specify the hackathon MVP from [[docs/01-Product-Brief]]. Actors are an authenticated merchant and the AssemblyAI voice agent acting with that merchant's restricted session. The browser, backend, database, and external voice service are distinct trust boundaries. The product shall remain usable through manual controls if voice is unavailable.

## Functional requirements

| ID | Priority | Requirement and observable acceptance |
| --- | --- | --- |
| FR-01 | Must | Owner can authenticate and access one business and catalog; another owner's IDs disclose no records. |
| FR-02 | Must | User can explicitly start/stop microphone capture and see connection/listening/processing/error states; denied permission leaves manual entry usable. |
| FR-03 | Must | Agent proposes one or multiple sales with product, positive whole quantity, business date and optional known price; confirmation commits all valid lines atomically. |
| FR-04 | Must | Unknown products, unclear dates, additional-versus-total sales, and ambiguous references trigger clarification before mutation; no guessed price. |
| FR-05 | Must | Correct a selected sale with its current version; stale edits return conflict instead of overwriting. A correction replaces the intended value, never inserts an accidental duplicate. |
| FR-06 | Must | Undo a committed operation by a compensating revision, retaining audit history; fail safely when intervening edits make reversal ambiguous. |
| FR-07 | Must | Transaction history supports pagination, date/product filtering, manual entry and editing with the same backend rules as voice. |
| FR-08 | Must | Quantity and known-price revenue are calculated by application/database code. Unknown-price sales remain visible and flagged; totals label incomplete revenue. |
| FR-09 | Must | Create line, bar, and KPI widgets from validated metric/dimension/filter choices; neither raw SQL nor executable chart code is accepted from the model. |
| FR-10 | Must | Date/product filters and explicit prior-period comparison affect queries; missing dates are gaps, while explicitly confirmed zero-sales dates are zero. |
| FR-11 | Must | Tapping a chart datum opens authorized source transactions using exactly the same query predicates and revision. |
| FR-12 | Must | Voice and manual actions add, edit, move, resize and remove widgets; an ambiguous “that chart” asks for a target. Ledger records never change from layout actions. |
| FR-13 | Must | Named dashboards persist versioned configuration and responsive layout; reopening recomputes current data and shows its revision and refresh time. |
| FR-14 | Must | Every ledger mutation uses server-enforced idempotency; concurrent/retried identical requests yield one logical commit and the same receipt. Reuse with different arguments is rejected. |
| FR-15 | Must | Confirmed mutations return a receipt, updated revision, affected IDs and undo availability. Failed tools never produce success confirmations. |
| FR-16 | Must | Synthetic fixtures display a demo label, are isolated from real records, and can be reset only in the owner's demo workspace. |
| FR-17 | Should | Cancel a pending proposal or disconnect safely without losing an acknowledged commit; reconnect refreshes authoritative state before another change. |
| FR-18 | Must | Owner can create, rename and deactivate catalog products and set an optional default price through manual controls. Deactivation preserves historical sales; changing a default price never changes recorded prices. |
| FR-19 | Must | Owner explicitly confirms or reopens a business day's completeness. Show its date and consequences before applying; the action is authorized, idempotent and audited. |
| FR-20 | Must | Each business uses either IDR or USD. IDR prices are exact whole rupiah; USD prices are exact cents. Inputs are normalized without floating point, every result displays its currency, ledgers never mix currencies, and no conversion is inferred. |

## Nonfunctional requirements

| ID | Target / constraint | Measurement |
| --- | --- | --- |
| NFR-01 | Exact IDR/USD minor-unit arithmetic and consistent totals | All deterministic fixtures pass with no floating-point rounding. |
| NFR-02 | Tool response p95 below 1 second for local business queries; visible refresh p95 below 2 seconds after commit | 100 operations over 10,000 seeded sales in the chosen deployment; excludes speech recognition and synthesis. Record environment and cold starts. |
| NFR-03 | Voice turn completion to visible result p95 below 5 seconds | At least 30 scripted turns on a documented network; separate provider, tool and render timings. Target, not SLA. |
| NFR-04 | Authorized, bounded tools; no credentials in browser bundles | Negative authorization, injection, rate-limit and bundle checks in [[docs/09-Verification]]. |
| NFR-05 | Keyboard/manual alternatives, visible focus, text equivalents for charts, readable errors | Complete the golden journey without voice or drag gestures at phone and desktop widths. |
| NFR-06 | Reproducible docs and portable knowledge outputs | `npm run docs:check` and Graphify portability check succeed after a clean install/sync. |
| NFR-07 | Recoverable acknowledged data | Database backup and restore rehearsal before public demo; audit references survive restoration. |

## Exclusions and assumptions

No payment processing, accounting compliance, currency conversion, mixed-currency ledger, inventory forecasting, arbitrary datasets, custom JavaScript, collaborative editing, or autonomous bulk writes in MVP. A business chooses IDR or USD and stores one currency only. English voice is the baseline; Indonesian speech requires a separate verified path. Currency and timezone are independent of voice language. Assume online access and an available AssemblyAI account; validate quotas and session behavior before implementation.

System design: [[docs/03-Architecture]]. Data rules: [[docs/05-Data-Model]]. Acceptance coverage: [[docs/09-Verification]]. Delivery gates: [[docs/10-Delivery-Plan]].
