---
title: "Personal Doctor Roadmap And Validation"
status: active
version: "0.3.0"
last_updated: "2026-03-30"
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

1. durable persistence;
2. explicit clinician review ledger;
3. packet finalization and audit trail;
4. bounded document-ingestion seam.

## Future-Phase Evidence Gates

| Future phase | Capability examples | Minimum gate before public scope changes |
| --- | --- | --- |
| Phase 2 - Intake plus documents | richer interview flow, typed artifact normalization, OCR or document ingestion, FHIR-compatible import seams | representative fixtures, updated parent evidence docs, code and tests for the new seam, explicit interoperability boundary, review-visible workflow state |
| Phase 3 - Clinician decision support | triage draft, evidence engine, review ledger, audit trail, retrieval-backed packet enrichment, bounded orchestrator loop | task-local evaluation, explicit clinician-review boundary, auditability, deterministic validation rules, updated claim-boundary docs |
| Phase 4 - Multimodal and specialist expansion | imaging, genomics and omics evidence, wearables, specialist routing, candidate agent-native patient graph | modality-specific governance, dedicated validation docs, stronger data controls, revised regulatory positioning, separate adoption decision per subsystem |

## Non-Upgrade Rule

Future phases should not upgrade public claims faster than code, tests, and evidence do.

Research arrival alone is not a scope upgrade.

The local authority set for future-phase architecture is `design.md`, `docs/roadmap-and-validation.md`, and `docs/academic/evidence-register.md`.   
