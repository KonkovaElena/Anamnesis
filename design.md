---
title: "Personal Doctor Standalone Design"
status: active
version: "0.2.0"
last_updated: "2026-03-30"
tags: [personal-doctor, healthcare, standalone, explanation]
---

# Design: Personal Doctor Standalone

## Goal

Create a truthful first standalone for a clinician-in-the-loop personal health workflow rather than a speculative AI physician product.

## Why The First Slice Is Small

The upstream research pack is broader than the first repository contract should be.

The standalone therefore keeps only the lowest-risk slice that is still useful:

- organize intake;
- register supporting artifacts;
- draft a physician packet from current case data;
- expose a compact operational surface.

## Runtime Thesis

The project should earn any future medical positioning through explicit workflow quality, claim discipline, and later evidence, not by overstating current software behavior.

## Current Storage And Composition

- in-memory case persistence;
- explicit bootstrap seam in `src/bootstrap.ts`;
- reduced Domain -> Application -> Infrastructure split;
- no plugin, MCP, MAS, multi-agent council, or evidence-engine runtime adoption in this slice.

## Future Architecture Authority

The broader v6-style architecture for this project now lives in the parent authority pack, not in this standalone runtime surface.

- parent scope and phase boundary: `docs/superpowers/specs/2026-03-30-personal-doctor-project-design.md`;
- parent evidence authority: `docs/superpowers/specs/2026-03-30-personal-doctor-march-2026-evidence.md`;
- parent future-phase map: `docs/superpowers/specs/2026-03-30-personal-doctor-research-roadmap.md`.

That means terms such as multi-agent orchestration, evidence engine, FHIR-compatible data seams, governance layer, or agent-native patient graph remain roadmap concepts until this standalone gains matching code and verification.

## Current Safety Posture

- every packet is labeled as a draft for clinician review;
- no route returns a diagnosis or treatment recommendation;
- the status model is operational only, not clinical;
- the docs separate implemented behavior from evidence and roadmap material.

## Technology Stack (March 2026)

| Dependency | Version | Notes |
|---|---|---|
| TypeScript | 6.0 | `moduleResolution: "bundler"`, `target: "es2025"` |
| Express | 5.2 | Native async handler support, no wrapper needed |
| Zod | 4.3 | Runtime schema validation |
| Node.js | >=22 | LTS runtime |
| node:test | built-in | No external test framework |

## Claim Classes

- **implemented target**: current routes and in-memory workflow state;
- **research-informed**: why the project stays clinician-in-the-loop and evidence-first;
- **regulatory positioning**: why narrow public claims matter;
- **scenario horizon**: future multimodal or decision-support phases.

## Architectural Direction

The standalone keeps a reduced kernel derived from the parent project:

- explicit entrypoint;
- explicit bootstrap composition;
- domain-first workflow model;
- lightweight monitoring surface;
- verification-first docs and tests.

It intentionally drops the parent platform's broad DI, MAS, plugin, and MCP estate from the first slice.