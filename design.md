---
title: "Anamnesis Standalone Design"
status: active
version: "1.1.0"
last_updated: "2026-04-03"
tags: [anamnesis, healthcare, standalone, explanation]
---

# Design: Anamnesis Standalone

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
- secure-by-default Bearer auth at bootstrap; unauthenticated startup now requires explicit `ALLOW_INSECURE_DEV_AUTH=true` and is rejected when `NODE_ENV=production`;
- JSON-only document-ingestion seam for `text/plain` and `text/markdown` content;
- bounded FHIR-compatible import seam for inline `Binary` and `DocumentReference` resources carrying `text/plain` or `text/markdown` payloads;
- bounded FHIR Bundle import seam for `document` or `collection` bundles that extract supported `Binary` and `DocumentReference` entries into source artifacts;
- explicit, request-gated `https` dereference for `attachment.url` when the fetched response remains `text/plain` or `text/markdown`, stays within byte limits, resolves only to public addresses, and optionally matches an operator-supplied host allowlist;
- in-memory fallback when `STORE_PATH` is not configured;
- explicit bootstrap seam in `src/bootstrap.ts`;
- reduced Domain -> Application -> Infrastructure split;
- no plugin, MCP, MAS, multi-agent council, or evidence-engine runtime adoption in this slice.

## Future Architecture Authority

The broader future-phase architecture for this project is normalized into this standalone repository rather than kept as an external dependency.

- local scope and phase boundary: `design.md`;
- April 3 refresh delta and publication-baseline clarification: `docs/design-refresh-2026-04-03.md`;
- local evidence authority: `docs/academic/evidence-register.md`;
- local future-phase map: `docs/roadmap-and-validation.md`.

These surfaces capture the April 3, 2026 authority snapshot in standalone form so the project can be reviewed, transferred, and evolved without requiring the parent monorepo.

For live GitHub repository-operations state after publication, use `docs/investor/GITHUB_POST_PUSH_CHECK_2026_04_03.md` instead of inferring state from committed workflow files alone.

That means terms such as multi-agent orchestration, evidence engine, multipart upload handling, OCR, FHIR transaction semantics, generic external attachment dereference, governance layer, or agent-native patient graph remain roadmap concepts until this standalone gains matching code and verification.

## MicroPhoenix Transfer Principles

- preserve one runtime chain and one composition root; the standalone already keeps this through `src/index.ts`, `src/bootstrap.ts`, and `src/application/create-app.ts`, and future subsystems should continue to extend that chain rather than create parallel entry surfaces;
- preserve the separation between design, roadmap, evidence, and claim-boundary surfaces so research cannot silently widen product scope;
- add new interoperability or AI subsystems behind explicit adapter seams and task-local evaluation packs before they affect the public narrative;
- retain auditability, request correlation, and operator-visible observability whenever the workflow surface grows;
- import only the minimum useful subset of the parent architecture. The standalone should not inherit the parent platform's full DI, MCP, MAS, or plugin estate until subsystem count and failure modes justify that overhead.

## Current Safety Posture

- every packet is labeled as a draft for clinician review;
- packet finalization is workflow finality only, not medical finality;
- no route returns a diagnosis or treatment recommendation;
- the status model is operational only, not clinical;
- the docs separate implemented behavior from evidence and roadmap material;
- public repository protection state is documented separately from application behavior so GitHub settings do not silently masquerade as shipped product capability.

## Technology Stack (April 2026)

| Dependency | Version | Notes |
|---|---|---|
| Node.js | `>=24` | Active LTS runtime contract |
| TypeScript | `^6.0.2` | `module: "node20"`, `target: "es2022"` |
| Express | `^5.2.1` | Native async handler support |
| Zod | `^4.3.6` | Runtime schema validation |
| Helmet | `^8.1.0` | Security headers middleware |
| better-sqlite3 | `^12.8.0` | Durable encrypted case and audit persistence |
| node:test | built-in | No external test framework |

## Claim Classes

- **implemented target**: current routes, persistence, and workflow state;
- **research-informed**: why the project stays clinician-in-the-loop and evidence-first;
- **regulatory positioning**: why narrow public claims matter;
- **scenario horizon**: future multimodal, retrieval, or decision-support phases.

## Architectural Direction

The standalone keeps a reduced kernel derived from the parent project:

- explicit entrypoint;
- explicit bootstrap composition;
- domain-first workflow model;
- lightweight monitoring surface;
- verification-first docs and tests.

It intentionally drops the parent platform's broad DI, MAS, plugin, and MCP estate from the first slice.

If future local inference arrives, the default path should be an adapterized sidecar or local serving rail such as Ollama or vLLM plus offline evaluation, not direct embedding of a medical model into the write path. MedGemma-class models are candidate starting points only after adaptation, task-local validation, and clinician-visible safeguards.