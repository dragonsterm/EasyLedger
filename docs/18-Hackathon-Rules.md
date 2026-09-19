---
title: AssemblyAI Voice Agent Hackathon rules, requirements, and judging
status: verified-from-event
tags: [easyledger, hackathon, rules, requirements]
---
# AssemblyAI Voice Agent Hackathon rules, requirements, and judging

Checked 2026-09-19 against [AssemblyAI - Voice Agent Hackathon on lablab.ai](https://lablab.ai/ai-hackathons/assemblyai-voice-agent-hackathon). This document specifies official hackathon constraints, evaluation criteria, and required deliverables to ensure EasyLedger achieves full compliance and competitive positioning.

## Event overview

| Parameter | Specification |
| --- | --- |
| Event name | AssemblyAI - Voice Agent Hackathon |
| Host & platform | [lablab.ai](https://lablab.ai) with [AssemblyAI](https://www.assemblyai.com/) |
| Dates | September 1–30, 2026 (Month-long, fully online) |
| Prize pool | $10,000 total ($5,000 cash + $5,000 in AssemblyAI API credits) |
| Required technology | AssemblyAI Voice Agent API and voice infrastructure |
| Eligibility | Global participation, individual or team, company or personal email |
| License baseline | MIT-compliant open-source contributions (see [[docs/11-Hackathon-and-License]]) |

## Judging criteria

The lablab.ai evaluation framework assesses submissions across four core pillars:

| Criterion | Focus & Evaluation | EasyLedger Implementation & Proof |
| --- | --- | --- |
| **Application of Technology** | Effective, deep, and correct integration of AssemblyAI Voice Agent API. Use of voice streaming, registered tools, turn-taking, and speech-to-dashboard capabilities. | Single voice agent registering bounded EasyLedger tools ([[docs/06-Agent-and-API]]). Voice-driven sale proposals, corrections, queries, and layout adjustments. |
| **Business Value & Practical Utility** | Real-world problem solving for a defined audience with tangible utility. Clear product rationale and domain fit. | Focus on micro-merchants (food stalls, kiosks) who struggle with manual ledgers. Provides instant voice sales logging, mistake correction, and visual profit/revenue clarity ([[docs/01-Product-Brief]]). |
| **Presentation & Demo** | Pitch clarity, storytelling, communication of technical nuance, quality of video demo, and slide deck. | Max 5-minute crisp walkthrough demonstrating the golden journey ([[docs/15-Use-Cases]] UC-02 & UC-03): voice logging → instant receipt → voice correction → visual chart update → saved dashboard. |
| **Technical Execution & Completeness** | System stability, architecture robustness, deterministic data handling, error resilience, and working online prototype. | Exact IDR integer arithmetic (no floating point errors, [[docs/05-Data-Model]]), server-enforced idempotency, two-phase mutation receipts, and full manual fallback when voice is unavailable. |

## Submission requirements

To qualify for official judging, the final submission on lablab.ai must satisfy all required deliverables:

### 1. Project profile & metadata
- **Project Title:** `EasyLedger` (Clear, descriptive name).
- **Short Description:** Concise summary under 255 characters (e.g., *"Voice-first sales ledger and interactive dashboard builder for micro-merchants, powered by AssemblyAI Voice Agent API and PostgreSQL."*).
- **Long Description:** Comprehensive overview (minimum 100 words) detailing the merchant problem, voice-to-dashboard workflow, exact financial calculation engine, architecture, and technology stack.
- **Category & Technology Tags:** `Voice AI`, `AssemblyAI`, `Fintech`, `Data Visualization`, `Fastify`, `React`, `PostgreSQL`.

### 2. Presentation materials
- **Cover Image:** Visual banner with 16:9 aspect ratio representing EasyLedger's voice and dashboard interface.
- **Video Presentation:** Video recording (maximum 5 minutes, MP4 format) including:
  1. Team and problem introduction (the burden of manual shop records).
  2. Live functional demonstration of voice sales entry, correction, and chart building.
  3. Technical architecture overview (AssemblyAI tool gateway, Fastify, PostgreSQL).
  4. Business impact and future roadmap.
- **Slide Presentation:** PDF pitch deck summarizing problem statement, solution, market, architecture, and live demo links.

### 3. Technical proof & accessibility
- **Public GitHub Repository:** Clean public repository at `https://github.com/dragonsterm/EasyLedger` with open-source `LICENSE` (MIT), clear documentation, and reproducible setup instructions.
- **Hosted Working Prototype:** Live, accessible online web application deployed with synthetic demo datasets and interactive voice controls.
- **Clean Hygiene:** Zero committed API keys, secrets, private customer data, or local workspace state.

## Hackathon rules & compliance checklist

- [ ] Build strictly on AssemblyAI's voice infrastructure and Voice Agent API.
- [ ] Maintain open-source code under MIT license in the public repository.
- [ ] Submit before the September 30, 2026 deadline.
- [ ] Deploy a functional online prototype with labeled synthetic data ([[docs/02-SRS]] FR-16).
- [ ] Verify that manual keyboard/touch alternatives work if microphone access is denied ([[docs/02-SRS]] FR-02, NFR-05).
- [ ] Ensure all financial sums use deterministic integer arithmetic ([[docs/05-Data-Model]]).

Related documentation: [[docs/00-Home]], [[docs/01-Product-Brief]], [[docs/02-SRS]], [[docs/06-Agent-and-API]], [[docs/10-Delivery-Plan]], [[docs/11-Hackathon-and-License]], [[docs/13-Sources]].
