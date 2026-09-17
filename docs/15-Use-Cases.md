---
title: Use cases and acceptance journeys
status: proposed
tags: [easyledger, product, requirements]
---
# Use cases and acceptance journeys

All scenarios assume an authenticated owner and business timezone. They expand [[docs/02-SRS]] without claiming implementation. Tests are in [[docs/09-Verification]].

| Use case | Preconditions and main flow | Alternate/failure flow | Coverage |
| --- | --- | --- | --- |
| UC-01 Prepare catalog | Owner creates orange/mango products and optional prices; entries become selectable | Duplicate normalized name rejected; deactivation preserves history | FR-01, FR-18; T-07, T-13 |
| UC-02 Record a batch | Voice or manual input → structured proposal → owner review → confirmation → atomic receipt → chart refresh | Unknown product/date/price clarified; cancellation before execution writes nothing; timeout checks operation status | FR-02, FR-03, FR-04, FR-14, FR-15, FR-17; T-01, T-02, T-03, T-08 |
| UC-03 Correct/undo | Owner selects sale/receipt → before/after preview → confirm → new audited revision → refresh | Ambiguous target asks a question; stale version conflicts; undo after intervening edits requires re-evaluation | FR-05, FR-06; T-04 |
| UC-04 Explore sales | Choose metric/date/product → deterministic query → chart → tap point → matching records | Missing prices/days flagged; zero denominator suppresses percentage; stale result refetched | FR-07, FR-08, FR-09, FR-10, FR-11; T-05 |
| UC-05 Build/save | Select chart/KPI → configure filters → move/resize by voice or controls → save name → reopen | Incompatible chart rejected with available choices; save conflict reloads/reapplies; no ledger mutation | FR-12, FR-13; T-06, T-09 |
| UC-06 Confirm a day | Review date and coverage consequence → confirm → day complete and auditable | Reopen restores missing semantics; subsequent sale mutation reopens affected day | FR-19; T-14 |
| UC-07 Work without voice | Deny microphone or disconnect → visible explanation → complete equivalent manual actions | Existing commit remains durable even if speech response was interrupted | FR-02, FR-07, FR-17; T-08, T-09 |
| UC-08 Demonstrate safely | Open isolated labeled synthetic dataset → golden journey → authorized demo reset | Reset cannot target real workspace; provider outage is disclosed, not disguised | FR-16; T-10 |

## Command examples and interpretation

“Log ten orange juices” uses a known catalog price only when shown in the proposal. “Ten sold today” requires clarification if it could replace a daily total. “Eight instead” needs a selected sale and current version. “Show revenue this week” resolves a concrete business-local range. “Compare with last week” uses the documented comparison policy. “Make that wider” changes selected widget layout only. “Nothing sold yesterday” can propose a complete zero-sale day after confirming there are no conflicting records; it must not delete existing sales.

The application displays product/date/price changes in plain language, not internal tool names. Developers use [[docs/06-Agent-and-API]] for contracts and [[docs/05-Data-Model]] for exact semantics. Simple accessible UI remains the baseline in [[docs/07-Dashboard-and-UX]].
