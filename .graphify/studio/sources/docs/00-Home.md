---
title: EasyLedger documentation home
status: planning
tags: [easyledger, navigation]
---
# EasyLedger documentation home

EasyLedger is a voice-first sales ledger and interactive dashboard builder for small merchants. The Day 20 data foundation is implemented: a PostgreSQL migration and seed plus exact IDR/USD money arithmetic and tests. The API, authentication, voice workflow, dashboard UI and deployment remain planned. This documentation replaces SayLedger as the active product name while retaining the briefs' useful requirements.

Start with [[docs/01-Product-Brief|the product brief]], then [[docs/02-SRS|the software requirements specification]]. Developers and agents should continue through [[docs/03-Architecture|architecture]], [[docs/04-Decisions|stack decisions]], [[docs/05-Data-Model|data semantics]], and [[docs/06-Agent-and-API|agent and API contracts]].

| Question | Canonical note |
| --- | --- |
| What are we building and for whom? | [[docs/01-Product-Brief]] |
| What must the MVP do? | [[docs/02-SRS]] |
| How do the systems connect? | [[docs/03-Architecture]] |
| Why this stack? What is undecided? | [[docs/04-Decisions]] |
| How are totals and corrections trustworthy? | [[docs/05-Data-Model]] |
| What tools may the voice agent use? | [[docs/06-Agent-and-API]] |
| How does the builder behave? | [[docs/07-Dashboard-and-UX]] |
| How do we protect data? | [[docs/08-Security-and-Operations]] |
| How do we verify requirements? | [[docs/09-Verification]] |
| What gets built first? | [[docs/10-Delivery-Plan]] |
| What must be submitted and licensed? | [[docs/11-Hackathon-and-License]] |
| How do docs, graph, and vault stay aligned? | [[docs/12-Knowledge-System]] |
| Where did claims come from? | [[docs/13-Sources]] |
| What terms mean what? | [[docs/14-Glossary]] |
| What happens in each user scenario? | [[docs/15-Use-Cases]] |
| How does implementation begin? | [[docs/16-Implementation-Handoff]] |
| What was actually verified? | [[docs/17-Verification-Record]] |
| What are the hackathon rules, requirements, and judging criteria? | [[docs/18-Hackathon-Rules]] |

Open [[docs/EasyLedger-Overview.canvas|the overview canvas]] for a guided map, or [[docs/EasyLedger-Knowledge.canvas|the complete document graph]]. Both are generated from the same notes as Graphify. The root README intentionally contains only `in progress`.

## Reading the plan

“Shall” is a proposed acceptance requirement unless a note explicitly marks part of it implemented and verified. MVP is the bounded hackathon scope; later features are the intended product direction. All performance numbers are targets awaiting measurement. Stack choices are a recommended baseline, subject to a short implementation spike. UI/UX will remain simple until backend and end-to-end behavior work; no theme has been selected.
