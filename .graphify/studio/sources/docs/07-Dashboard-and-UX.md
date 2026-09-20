---
title: Dashboard builder and UX
status: proposed
tags: [easyledger, dashboard, product]
---
# Dashboard builder and UX

The builder is a core product capability alongside the agentic workflow. Aim for the breadth of a useful business dashboard over time, while presenting a small set of clear choices at each step. Backend functionality and a complete workflow precede visual polish. **Theme, brand colors, typography system and final visual style are undecided.**

## First usable interface

A simple application shell contains Ledger, Dashboard and Catalog views plus an always-available voice control. Dashboard has a widget area, selected-widget settings and an Add widget action. Show the selected widget title, effective date range, business currency (IDR or USD), last refresh, data completeness and saved/unsaved status. A plain neutral layout is sufficient. Microphone/listening state must be explicit; transcripts and tool receipts remain readable after audio stops.

Widgets are first-class objects: `id`, `type`, `title`, `metric`, `dimension`, `filters`, `comparison`, `format`, `layout`, `schema_version`. Supported metric choices are units and known-price revenue. Do not store chart results as the canonical widget; store a query specification and re-fetch current data. The renderer maps validated specifications to ECharts options; it does not execute model-produced code.

| Capability | MVP behavior | Later expansion |
| --- | --- | --- |
| Charts | Daily line, product bar, total KPI | Tables, area, stacked bar, pie/donut with category limits, scatter, heatmap |
| Query builder | Metric, date, product, grouping | Reusable measures, safe calculated fields, richer dimensions |
| Layout | Add/remove, drag/resize, voice move, save/reopen | Templates, tabs/pages, reusable groups |
| Interaction | Tooltip/tap, filter, source-record drilldown | Cross-filtering, brushing, linked selections |
| Data | Native ledger and explicit demo fixtures | Validated CSV import, connectors, joins with provenance |
| Sharing | Owner-only saved dashboards | Read-only links, export CSV/PNG/PDF, roles and collaboration |
| Design | Clear labels and responsive controls | Theme editor and refined design system after testing |

## Behavioral rules

Global filters apply unless a widget explicitly overrides them; show overrides beside the title. Comparison labels show exact date ranges and completeness. A chart always has a table/text alternative. KPI revenue indicates excluded unknown-price records. Empty, missing, confirmed-zero, loading, failed and stale are different states. Display the reason when a metric/chart pairing is unavailable.

“Make that a bar chart” uses the selected widget ID and compatible dimension. “Move it to the top” changes layout only. Multiple plausible targets prompt a choice. Removing a widget cannot remove transactions. Saving a dashboard checks its base version; a conflict offers reload/reapply instead of silent last-write-wins.

For small screens, widgets stack in a stable order. Provide Move up/down and size presets as keyboard/touch alternatives to dragging. Do not rely on color alone for comparisons or completeness. Source-record panels are dismissible and preserve dashboard context. Text/manual controls must reach the same core actions as voice.

Data definitions: [[docs/05-Data-Model]]. Agent actions: [[docs/06-Agent-and-API]]. Feature acceptance: [[docs/09-Verification]]. Scope sequencing: [[docs/10-Delivery-Plan]].
