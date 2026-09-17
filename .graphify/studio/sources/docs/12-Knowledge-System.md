---
title: Knowledge system maintenance
status: documentation-tooling
tags: [easyledger, knowledge]
---
# Knowledge system maintenance

The repository root is the existing Obsidian vault. Canonical project notes live directly in `docs/`, so Obsidian and contributors edit the same files. Graphify consumes those notes; it does not create a second editable copy. Existing vault settings and workspace state are preserved.

## Synchronization contract

`npm run docs:sync` parses canonical Markdown headings and wikilinks, validates targets, and uses the installed Graphify runtime to build a persistent graph with community detection, citations and an audit report. It also generates two Obsidian canvases from those same inputs. Each document and section is a graph node; explicit links and section containment are EXTRACTED relationships. This is a structural knowledge graph of authored planning evidence, not proof of implementation or an exhaustive LLM interpretation of prose.

The overview canvas presents product → requirements → architecture → execution → verification in grouped columns. The knowledge canvas includes every canonical note and its document links. Canvas file cards point to live Markdown; notes are never copied into canvas text. Canvas layouts are generated; customize the layout generator if a lasting change is needed.

Inputs: numbered Markdown notes under `docs/` and `AGENTS.md`. Outputs: `.graphify/graph.json`, `.graphify/GRAPH_REPORT.md`, metadata/manifest and `.graphify/studio/`, plus `docs/EasyLedger-Overview.canvas` and `docs/EasyLedger-Knowledge.canvas`. Original reference briefs are summarized in [[docs/13-Sources]] rather than copied from personal Downloads into a public repository.

## Maintainer workflow

1. Install the pinned documentation dependency with `npm ci` after checkout.
2. Edit the canonical notes and preserve stable requirement/decision identifiers. Use `[[docs/02-SRS|requirements]]`-style vault-root links.
3. Run `npm run docs:sync` to regenerate graph, citations, report, canvases and studio.
4. Run `npm run docs:check` to detect changed/deleted inputs, modified/missing generated artifacts, broken links or invalid canvas references.
5. Run `npx --no-install graphify portable-check .graphify` before publishing graph artifacts.
6. Review and include source notes and generated outputs together in a future commit.

`npm run docs:watch` watches the canonical notes and agent guide, debounces changes and serializes regeneration. It runs only while the terminal process is active. It is not Obsidian cloud Sync, does not upload files, and does not install an Obsidian plugin. Without the watcher, run sync after edits. Generated graph/canvas edits fail freshness checks and are replaced on sync.

`npm run graph:serve` serves only the generated Graphify studio on localhost; open the printed address. `npm run graph:query -- "dashboard correction"` searches the graph. Read the cited Markdown for the complete requirement. Graphify's hidden directory may not be visible in Obsidian's file pane; the visible canvases and linked canonical notes are the intended Obsidian entry points.

## Repository preparation

The initial workspace had no `.git` repository or remote. The user subsequently authorized an initial commit and publication to `https://github.com/dragonsterm/EasyLedger`. Before publishing, inspect the exact file set and `.gitignore`, run the documented checks, then verify the remote commit afterward. MIT is the project choice; the event-specific license clause remains unresolved. Documentation scripts are maintenance tooling, not application implementation.

Related: [[docs/04-Decisions]], [[docs/09-Verification]], [[docs/13-Sources]].
