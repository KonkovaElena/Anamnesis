---
title: "Anamnesis Evidence Register"
status: active
version: "1.0.0"
last_updated: "2026-04-01"
tags: [anamnesis, healthcare, evidence, academic]
---

# Evidence Register

## Current Source Classes

- local implementation docs for the current runtime boundary;
- normalized March 30, 2026 design and evidence material folded into this standalone repository at export time;
- user research memo treated as roadmap and risk input only.

## Local Authority Surfaces

- `design.md`
- `docs/roadmap-and-validation.md`
- `docs/regulatory/positioning.md`
- `docs/claim-boundary.md`

## Provenance Boundary

This repository intentionally internalizes its March 30, 2026 evidence and roadmap snapshot so it can stand on its own.

The local authority for standalone claims is the local authority set above.

Research-to-phase decisions for this standalone live in `docs/roadmap-and-validation.md`.

## External References (March 2026 Audit)

### Standards

- **HL7 FHIR R5** (v5.0.0, September 2024) — current interoperability standard for health data exchange. The standalone now ships bounded single-resource and Bundle import seams, including explicit `attachment.url` dereference gates for supported text content, while broader FHIR exchange remains roadmap-scoped.
- **WHO SMART Guidelines** — digital adaptation of clinical guidelines using FHIR + ICD-11 + CQL. Relevant for future clinical decision support phases.
- **ICD-11** — WHO International Classification of Diseases, current revision. Standard coding system for health conditions.

### Regulatory Landscape

- **FDA AI-Enabled Medical Device List** (current as of 03/04/2026, 29 pages) — catalogs AI/ML-enabled devices with marketing authorization. Project's clinician-in-the-loop positioning aligns with FDA human-oversight requirements.
- **EU MDR 2017/745** — classifies clinical decision support software. Project explicitly disclaims clinical decision support output.

### Security Best Practices

- **Express.js Security Best Practices** (expressjs.com) — recommends Helmet for HTTP security headers, TLS termination, rate limiting, dependency auditing, and safe regex.
- **body-parser official docs** — current parser stack does not handle multipart bodies, and route-specific parsers are the recommended usage pattern. This bounds the standalone ingestion seam to JSON requests carrying text content instead of file uploads.

### Competitor Landscape (March 2026)

| Repository | Language | Architecture | Status |
|---|---|---|---|
| `kononyukii/structured-intake-assistant` | TypeScript/Next.js | Client-side, local-first | Closest feature overlap |
| `NickLeko/TriageAI` | Python/Streamlit | LLM-based triage MVP | Demo only |
| `leenathomas/the-consult-model` | — | Architectural thought experiment | No implementation |

The competitive landscape for structured clinician-in-the-loop intake systems is sparse as of March 2026. This project offers stronger architectural rigor (typed domain model, explicit claim boundaries, layered architecture) than all identified analogs.

The broader v6-style subsystem concepts such as multi-agent orchestration, evidence engine design, FHIR transaction exchange, governance and safety layers, and agent-native patient-graph candidates remain roadmap material until this standalone ships them.

No standalone runtime claim should be widened from this file alone.
