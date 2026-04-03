---
title: "Anamnesis Roadmap And Validation"
status: active
version: "1.1.0"
last_updated: "2026-04-03"
tags: [anamnesis, healthcare, roadmap, validation]
---

# Roadmap And Validation

## Current Validation Rail

Run these commands in the standalone package:

```bash
npm test
npm run build
```

Then verify:

- `GET /healthz`
- `GET /readyz`
- `GET /metrics`

This remains the minimum closure rail for implemented scope.

## Immediate April 2026 Priorities

1. Typed artifact-normalization fixtures and a broader evaluation corpus for the existing text and FHIR seams.
2. More explicit interoperability narrowing through profile-aware tests before any broader FHIR claim.
3. A future local-model experimentation rail behind an adapter boundary and offline evaluation only, not in the public write path.

## Completed In v1.0.0

- bounded FHIR Bundle import seam at `POST /api/cases/:caseId/fhir-bundle-imports`;
- support for `document` and `collection` bundles that extract supported `Binary` and `DocumentReference` entries into source artifacts;
- explicit, request-gated `https` dereference of `DocumentReference.content.attachment.url` for bounded `text/plain` and `text/markdown` payloads;
- dedicated `fhir.bundle.imported` audit event with route, domain, and adapter coverage.

## Completed In v0.9.0

- bounded FHIR-compatible import seam at `POST /api/cases/:caseId/fhir-imports`;
- support for inline `Binary` and `DocumentReference` resources carrying `text/plain` or `text/markdown` payloads;
- reuse of the bounded text-normalization and excerpt pipeline for FHIR-derived artifacts;
- dedicated `fhir.imported` audit event with route and domain coverage.

## Completed In v0.8.0

- bounded document-ingestion seam for `text/plain` and `text/markdown` request bodies;
- deterministic whitespace normalization and bounded excerpting into source artifacts;
- dedicated `document.ingested` audit event;
- document-ingestion API coverage for route validation, audit trail, and operations summary.

## Completed In v0.7.0

- packet finalization for clinician-approved, non-stale packets;
- append-only audit trail for case creation, artifact add/remove, packet draft, review submit, finalize, and delete flows;
- audit-aware operations summary and `/metrics` counters;
- SQLite audit history retention across restarts and case deletion.

## Completed In v0.6.0

- explicit clinician review ledger (approved / changes_requested / rejected);
- physician packet status transitions (DRAFT_REVIEW_REQUIRED → CLINICIAN_APPROVED / CHANGES_REQUESTED / REJECTED);
- append-only review entries on each physician packet;
- review guard: approved packets reject further reviews;
- reviews metric in `/metrics` endpoint;
- 17 new tests (8 domain unit + 9 API integration).

## Completed In v0.5.0

- durable SQLite persistence (`STORE_PATH`);
- AES-256-GCM whole-record encryption at rest (`ENCRYPTION_KEY`);
- in-memory fallback when no store path is set;
- graceful database close on shutdown.

## Completed In v0.4.0

- Bearer-token authentication (`API_KEY`);
- per-IP sliding-window rate limiting (`RATE_LIMIT_RPM`);
- security headers via Helmet (CSP, HSTS, COOP, CORP, Referrer-Policy, etc.);
- sourceDate future-date rejection;
- Node.js engine bump to >=24 (Active LTS).

## Future-Phase Evidence Gates

| Future phase | Capability examples | Minimum gate before public scope changes |
| --- | --- | --- |
| Phase 2 - Intake plus documents | richer intake flow, typed artifact normalization, composition-aware bundle traversal, selective non-text handling | representative fixtures, code and tests for the new seam, explicit interoperability boundary, review-visible workflow state, updated claim-boundary wording |
| Phase 3 - Clinician decision-support experiments | retrieval-backed packet enrichment, local-model adapter, rationale capture, bounded draft assistance | task-local evaluation pack, explicit draft-only state boundary, auditability, deterministic validation rules, updated evidence register, no diagnosis or treatment language |
| Phase 4 - Multimodal and specialist expansion | imaging, genomics or omics evidence, wearables, specialist routing, candidate patient graph | modality-specific governance, dedicated validation docs, stronger data controls, revised regulatory positioning, separate adoption decision per subsystem |
| Phase 5 - Agentic workflow automation | orchestrated evidence gathering, task agents, model councils, automated follow-up suggestions | lifecycle security review, memory-integrity checks, capability bounds, operator-visible kill switch, explicit reliability gate, separate human-oversight design review |

## MicroPhoenix-Derived Promotion Rules

- code, tests, docs, and evidence should move together before a capability is presented as real;
- the authority stack is local and explicit: `design.md` -> `docs/roadmap-and-validation.md` -> `docs/academic/evidence-register.md` -> `docs/claim-boundary.md`;
- adding a new model runtime, agent, or serving sidecar is not enough to widen public claims;
- future AI subsystems need evaluation fixtures, failure taxonomies, and audit visibility before they touch the main workflow;
- architecture should be transplanted minimally: explicit composition and adapter seams first, heavier platform machinery later only if justified.

## Non-Upgrade Rule

Future phases should not upgrade public claims faster than code, tests, and evidence do.

Research arrival alone is not a scope upgrade.

The local authority set for future-phase architecture is `design.md`, `docs/roadmap-and-validation.md`, and `docs/academic/evidence-register.md`.
