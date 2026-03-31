---
title: "Personal Doctor Roadmap And Validation"
status: active
version: "0.7.0"
last_updated: "2026-03-31"
tags: [personal-doctor, healthcare, roadmap, validation]
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

## Next Logical Expansions

1. bounded document-ingestion seam.

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
| Phase 2 - Intake plus documents | richer interview flow, typed artifact normalization, OCR or document ingestion, FHIR-compatible import seams | representative fixtures, updated parent evidence docs, code and tests for the new seam, explicit interoperability boundary, review-visible workflow state |
| Phase 3 - Clinician decision support | triage draft, evidence engine, retrieval-backed packet enrichment, bounded orchestrator loop | task-local evaluation, explicit clinician-review boundary, auditability, deterministic validation rules, updated claim-boundary docs |
| Phase 4 - Multimodal and specialist expansion | imaging, genomics and omics evidence, wearables, specialist routing, candidate agent-native patient graph | modality-specific governance, dedicated validation docs, stronger data controls, revised regulatory positioning, separate adoption decision per subsystem |

## Non-Upgrade Rule

Future phases should not upgrade public claims faster than code, tests, and evidence do.

Research arrival alone is not a scope upgrade.

The local authority set for future-phase architecture is `design.md`, `docs/roadmap-and-validation.md`, and `docs/academic/evidence-register.md`.   
