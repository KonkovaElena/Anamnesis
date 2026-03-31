---
title: "Personal Doctor Claim Boundary"
status: active
version: "0.9.0"
last_updated: "2026-03-31"
tags: [personal-doctor, healthcare, claim-boundary, reference]
---

# Claim Boundary

## Implemented Truth

- the repository stores cases in SQLite with AES-256-GCM encryption at rest (or in memory when no store path is configured);
- it registers source artifacts (with future-date rejection);
- it ingests bounded `text/plain` and `text/markdown` documents into source artifacts;
- it imports inline FHIR `Binary` and `DocumentReference` resources that carry `text/plain` or `text/markdown` payloads into source artifacts;
- it supports artifact and case deletion;
- it drafts physician packets from currently stored case data;
- it records explicit clinician reviews on physician packets;
- it finalizes clinician-approved packets as workflow artifacts;
- it writes append-only audit events for write operations;
- it exposes an operational HTTP surface;
- it enforces Bearer-token authentication;
- it applies per-IP sliding-window rate limiting;
- it sets security headers via Helmet (CSP, HSTS, COOP, CORP, Referrer-Policy);
- it performs graceful HTTP shutdown with connection draining.

## Not Implemented Truth

- medical diagnosis;
- triage verdict generation;
- treatment planning;
- prescription logic;
- multipart upload or OCR document ingestion;
- FHIR REST server behavior;
- FHIR Bundle import or transaction handling;
- external Binary or `attachment.url` dereference;
- medical sign-off or legal attestation.

## Required Language

Use terms such as "draft", "organizational summary", and "clinician review".

Do not use terms that imply validated clinical output.
