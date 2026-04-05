---
title: "Anamnesis Claim Boundary"
status: active
version: "1.1.2"
last_updated: "2026-04-05"
tags: [anamnesis, healthcare, claim-boundary, reference]
---

# Claim Boundary

## Implemented Truth

- the repository stores cases in SQLite with AES-256-GCM encryption at rest (or in memory when no store path is configured);
- it creates workflow-family-aware cases for `GENERAL_INTAKE`, `MRI_SECOND_OPINION`, and `MRNA_BOARD_REVIEW`;
- it registers source artifacts (with future-date rejection);
- it preserves derived-artifact metadata and parent-child lineage when artifacts declare upstream artifact ids;
- it exposes a read-only evidence-lineage graph for artifacts within an existing case;
- it registers molecular samples on a case;
- it attaches imaging study context and records QC summaries for imaging-review workflows;
- it ingests bounded `text/plain` and `text/markdown` documents into source artifacts;
- it imports inline FHIR `Binary` and `DocumentReference` resources that carry `text/plain` or `text/markdown` payloads into source artifacts;
- it imports bounded FHIR `Bundle` resources of type `document` or `collection` into source artifacts;
- it can dereference `DocumentReference.content.attachment.url` only when the bundle import request explicitly opts in, the target stays on public `https` addresses, and the fetched response remains bounded text content;
- it supports artifact and case deletion;
- it drafts physician packets from currently stored case data;
- it records explicit clinician reviews on physician packets;
- it finalizes clinician-approved packets as workflow artifacts;
- it writes append-only audit events for write operations;
- it exposes an operational HTTP surface;
- it enforces Bearer-token authentication in normal runtime and requires an explicit local-development override for unauthenticated startup;
- it applies per-IP sliding-window rate limiting;
- it sets security headers via Helmet (CSP, HSTS, COOP, CORP, Referrer-Policy);
- it performs graceful HTTP shutdown with connection draining.

## Not Implemented Truth

- medical diagnosis;
- triage verdict generation;
- treatment planning;
- prescription logic;
- multipart upload, OCR document ingestion, imaging pixel-data ingestion, or genomics file transport;
- FHIR REST server behavior;
- FHIR transaction handling;
- external Binary dereference or ungated `attachment.url` dereference;
- medical sign-off or legal attestation.

## Required Language

Use terms such as "draft", "organizational summary", and "clinician review".

Do not use terms that imply validated clinical output.

## Companion Assurance Surfaces

- [api-scope.md](api-scope.md)
- [interop/README.md](interop/README.md)
- [traceability-matrix.md](traceability-matrix.md)
- [security/posture-and-gaps.md](security/posture-and-gaps.md)
