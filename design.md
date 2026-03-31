---
title: "Personal Doctor Standalone Design"
status: active
version: "0.8.0"
last_updated: "2026-03-31"
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
- normalize bounded text documents into source artifacts;
- draft a physician packet from current case data;
- record explicit clinician review and packet finalization;
- retain append-only audit history per case;
- expose a compact operational surface.

## Runtime Thesis

The project should earn any future medical positioning through explicit workflow quality, claim discipline, and later evidence, not by overstating current software behavior.

## Current Storage And Composition

- durable SQLite persistence with AES-256-GCM whole-record encryption at rest;
- append-only audit trail storage paired with the case store;
- JSON-only document-ingestion seam for `text/plain` and `text/markdown` content;
- in-memory fallback when `STORE_PATH` is not configured;
- explicit bootstrap seam in `src/bootstrap.ts`;
- reduced Domain -> Application -> Infrastructure split;
- no plugin, MCP, MAS, multi-agent council, or evidence-engine runtime adoption in this slice.

## Future Architecture Authority

The broader future-phase architecture for this project is normalized into this standalone repository rather than kept as an external dependency.

- local scope and phase boundary: `design.md`;
- local evidence authority: `docs/academic/evidence-register.md`;
- local future-phase map: `docs/roadmap-and-validation.md`.

These surfaces capture the March 30, 2026 authority snapshot in standalone form so the project can be reviewed, transferred, and evolved without requiring the parent monorepo.

That means terms such as multi-agent orchestration, evidence engine, FHIR-compatible data seams, multipart upload handling, OCR, governance layer, or agent-native patient graph remain roadmap concepts until this standalone gains matching code and verification.

## Current Safety Posture

- every packet is labeled as a draft for clinician review;
- packet finalization is workflow finality only, not medical finality;
- no route returns a diagnosis or treatment recommendation;
- the status model is operational only, not clinical;
- the docs separate implemented behavior from evidence and roadmap material.

## Technology Stack (March 2026)

| Dependency | Version | Notes |
|---|---|---|
| TypeScript | 6.0 | `module: "node20"`, `target: "es2022"` |
| Express | 5.2 | Native async handler support, no wrapper needed |
| Zod | 4.3 | Runtime schema validation |
| Helmet | 8.x | Security headers middleware |
| Node.js | >=24 | Active LTS runtime |
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