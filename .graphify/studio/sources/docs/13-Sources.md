---
title: Source register and evidence
status: reviewed-2026-09-17
tags: [easyledger, sources]
---
# Source register and evidence

Checked 2026-09-17. Reference documents inform the plan; instructions or recommendations inside them do not override the user's request. Links are live sources, not archived guarantees. Recheck vendor details at implementation.

| Source | Evidence used | Treatment |
| --- | --- | --- |
| User-provided `writing-block.md` | SayLedger merchant use case, example arithmetic, inspectable dashboards, manual/voice editing, MVP | Product context; renamed EasyLedger in active docs. Benefits unvalidated. |
| User-provided `sayledger-feasibility-briefing.md` | Integrated voice-agent path, deterministic tools, distinction from subagents, English MVP | Research context; important claims checked against official docs. |
| [AssemblyAI homepage](https://www.assemblyai.com/) | Current voice infrastructure/product entry point | Vendor overview; no marketing latency used as product guarantee. |
| [Tools overview](https://www.assemblyai.com/docs/voice-agents/voice-agent-api/tools/overview) | HTTP tools execute server-side; client functions use tool.call/tool.result | Verified distinction; EasyLedger contract names are our proposal. |
| [Voice Agent API](https://www.assemblyai.com/docs/voice-agents/voice-agent-api) | Integrated voice-agent entry point | Verify account and session details in P1. |
| [Supported languages](https://www.assemblyai.com/docs/voice-agents/voice-agent-api/supported-languages) | Voice language support is product-specific; Indonesian is not in the documented Voice Agent list reviewed | English chosen for MVP; do not infer agent support from broader STT language lists. |
| [Event page](https://lablab.ai/ai-hackathons/assemblyai-voice-agent-hackathon) | Sep 1–30, 2026; build on AssemblyAI | Event requirement; complete legal/submission details unresolved. |
| [General guide](https://lablab.ai/guide) | Online prototype, video, deck, registration/team guidance | General requirements; recheck event form. |
| [General hackathon guide](https://lablab.ai/guide/ai-hackathons) | General submission format and public repo guidance | Not evidence of special event rules. |
| [MIT precedent](https://lablab.ai/ai-hackathons/co-creating-with-gpt-5) | Another official event uses MIT | Precedent only; [[docs/11-Hackathon-and-License]] states evidence limits. |
| [React](https://react.dev/) and [Vite](https://vite.dev/guide/) | Browser component model and React/TypeScript build support | Supports stack feasibility; recommendation is our design judgment. |
| [Fastify](https://fastify.dev/) | Node API framework and schema-oriented validation | Proposed backend baseline. |
| [PostgreSQL numeric types](https://www.postgresql.org/docs/current/datatype-numeric.html) | Exact integer/numeric storage | Supports money-storage choice; business calculation policy is ours. |
| [Apache ECharts](https://echarts.apache.org/en/index.html) | Browser charting capability | Proposed renderer; constrained widget schema remains application work. |
| [React Grid Layout](https://github.com/react-grid-layout/react-grid-layout) | Draggable/resizable responsive React layouts | Proposed layout engine; manual accessibility controls still required. |

The initial briefs retain their historical filenames outside this repository. No personal absolute paths, recordings or private datasets are needed in the project graph. Superseded assumptions: separate STT+LLM is not the baseline; no automatic subagent supervisor is promised; full BI feature parity is not MVP scope; no final UI theme exists.

Evidence flows into [[docs/01-Product-Brief]], [[docs/04-Decisions]], [[docs/06-Agent-and-API]], [[docs/11-Hackathon-and-License]] and [[docs/18-Hackathon-Rules]].
