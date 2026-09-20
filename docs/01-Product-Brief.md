---
title: Product brief
status: proposed
tags: [easyledger, product]
---
# Product brief

**Promise:** say what you sold; build a dashboard you understand. EasyLedger lets small shop, food-stand, and drink-stall owners record transactions, correct mistakes, ask about sales, and build saved dashboards by voice or direct controls.

The initial persona is a merchant who maintains their own records on a phone. The problem is the effort of entering sales and turning them into understandable evidence. Convenience and business value remain hypotheses; no user study has established benefits. This is an operational sales record, not certified bookkeeping, tax reporting, payments, or financial advice.

## Golden journey

1. Start from visibly labeled demo history and a small catalog.
2. Say “Today I sold ten orange juices at 15,000 rupiah each and six mango juices at 18,000 each.”
3. Review the proposed entries and computed total of IDR 258,000, then confirm.
4. Say “Actually eight orange juices, not ten.” Review the identified entry and commit its correction; the total becomes IDR 228,000.
5. Ask for daily revenue this week and compare with the prior week.
6. Add a product bar chart and a revenue card, move and resize them, then save “Weekly Overview.”
7. Reopen the dashboard: saved configuration is retained and data is recomputed from current ledger records.

## Scope and success

MVP: one business per owner, English voice interaction, an IDR demonstration dataset, per-business IDR or USD selection, a product catalog, transactional entry/correction/undo, manual history, line/bar/KPI widgets, date/product filters, drilldown, layout editing, and persistence. The database still carries business ownership on every record to avoid unsafe assumptions when multiple users try the demo. Currency is exact and fixed per business; no conversion or mixed-currency ledger is provided.

The long-term aim is a capable but understandable visualization builder: tables, additional chart families, reusable metrics, import, connectors, collaboration, exports, and templates. These are staged in [[docs/07-Dashboard-and-UX]], not promised as hackathon delivery. Complex statistical work may later need an analytics service; it is unnecessary for sums and grouped sales queries.

Validation will compare task time, field accuracy, correction success, clarification frequency, dashboard completion, and source-record comprehension with each merchant's current process. Do not advertise measured improvement before this study. See [[docs/09-Verification]] and [[docs/10-Delivery-Plan]].

## Source reconciliation

The writing brief describes STT plus a separate LLM. The feasibility brief proposes the integrated AssemblyAI Voice Agent API. The active recommendation uses the integrated API with EasyLedger tools; a separate orchestration stack is only a contingency. The user's new direction prioritizes agentic workflows and the dashboard builder, with backend correctness before themed UI. References and unresolved vendor limitations are in [[docs/13-Sources]].
