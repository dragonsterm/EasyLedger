---
title: Glossary
status: proposed
tags: [easyledger, navigation]
---
# Glossary

| Term | Meaning in EasyLedger |
| --- | --- |
| Agent | AssemblyAI voice runtime choosing from EasyLedger's registered tools. |
| Tool | Bounded application action or query; not automatically a separate AI agent. |
| Ledger | Stored sales plus audit revisions; not a certified general ledger. |
| Proposal | Normalized pending mutation reviewed before durable commit. |
| Receipt | Authoritative result of a committed operation, with IDs and revisions. |
| Idempotency | A repeated logical request produces one commit, not duplicates. |
| Revision | Monotonic version used to detect stale edits and mixed chart results. |
| Widget | Typed chart or KPI configuration bound to a validated query. |
| Dashboard | Named saved widget configuration and layout; its data is refreshed. |
| Missing | No evidence of activity/completeness; never automatically zero. |
| Confirmed zero | Complete day with no active sales. |
| Known-price revenue | Sum of quantity × known unit price, with incompleteness disclosed. |
| Minor unit | Smallest stored currency unit: one rupiah for IDR or one cent for USD. |
| Business currency | The immutable IDR or USD choice for one ledger; EasyLedger does not mix or convert currencies. |
| Canonical note | Editable Markdown source shared by the repository and Obsidian. |
| Graphify graph | Derived searchable document/section relationships with provenance. |
| Canvas | Obsidian visual map containing links to the live canonical notes. |

Continue with [[docs/00-Home]], [[docs/05-Data-Model]] and [[docs/12-Knowledge-System]].
