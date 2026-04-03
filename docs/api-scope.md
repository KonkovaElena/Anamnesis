---
title: "Anamnesis API Scope"
status: active
version: "1.2.0"
last_updated: "2026-04-03"
tags: [anamnesis, api, reference]
---

# API Scope

## Purpose

Describe the implemented HTTP contract for the current standalone slice.

Use this page together with [../openapi.yaml](../openapi.yaml) and [claim-boundary.md](claim-boundary.md).

This is an organizational workflow API, not a diagnostic or treatment API.

## Authentication Model

- Application endpoints use `Authorization: Bearer <API_KEY>` when `API_KEY` is configured.
- Startup without `API_KEY` is rejected unless `ALLOW_INSECURE_DEV_AUTH=true` is explicitly set.
- `ALLOW_INSECURE_DEV_AUTH=true` is rejected when `NODE_ENV=production`.
- `GET /healthz`, `GET /readyz`, and `GET /metrics` remain unauthenticated even when bearer auth is enabled.

## Request And Content Bounds

- JSON request parsing is bounded to `256kb` at the HTTP layer.
- Plain document ingestion accepts only `text/plain` and `text/markdown`.
- Document-ingestion request `content` is capped at `12000` characters before normalization.
- Stored artifact summaries are bounded excerpts, capped to the domain excerpt limit after normalization.
- FHIR import is limited to JSON-shaped payloads with `Binary`, `DocumentReference`, and bundle entries that are explicitly supported by this slice.

## Route Surface

| Route | Method | Behavior |
| --- | --- | --- |
| `/api/cases` | `POST` | Create a new case with structured intake. |
| `/api/cases` | `GET` | List cases with `meta.totalCases`. |
| `/api/cases/{caseId}` | `GET` | Return one case by id. |
| `/api/cases/{caseId}` | `DELETE` | Delete a case and append `case.deleted` to the audit trail. |
| `/api/cases/{caseId}/artifacts` | `POST` | Register a source artifact and stale any active packet drafts. |
| `/api/cases/{caseId}/artifacts/{artifactId}` | `DELETE` | Remove a source artifact and stale any active packet drafts. |
| `/api/cases/{caseId}/document-ingestions` | `POST` | Normalize bounded text into a source artifact plus ingestion metadata. |
| `/api/cases/{caseId}/fhir-imports` | `POST` | Import one supported inline FHIR resource into a source artifact. |
| `/api/cases/{caseId}/fhir-bundle-imports` | `POST` | Import one supported FHIR bundle into one or more source artifacts. |
| `/api/cases/{caseId}/physician-packets` | `POST` | Draft a physician packet from the current case state. |
| `/api/cases/{caseId}/physician-packets` | `GET` | List packet drafts for a case with `meta.totalPackets`. |
| `/api/cases/{caseId}/physician-packets/{packetId}/reviews` | `POST` | Append a clinician review entry. |
| `/api/cases/{caseId}/physician-packets/{packetId}/reviews` | `GET` | Return the review ledger for one packet. |
| `/api/cases/{caseId}/physician-packets/{packetId}/finalize` | `POST` | Finalize a clinician-approved, non-stale packet. |
| `/api/cases/{caseId}/audit-events` | `GET` | Return append-only audit events by `caseId`. |
| `/api/operations/summary` | `GET` | Return aggregate workflow counts for cases, artifacts, packets, reviews, finalized packets, and audit events. |
| `/healthz` | `GET` | Liveness probe. |
| `/readyz` | `GET` | Readiness probe; returns `503` during shutdown drain. |
| `/metrics` | `GET` | Prometheus-style plain-text counters. |

## Normalization Profiles

Document and FHIR import responses now expose explicit profile metadata so clients can tell which bounded parser path produced the stored artifact.

- `DocumentIngestionResult.normalizationProfile` is `document.text.plain.v1` or `document.text.markdown.v1`.
- `FhirImportResult.importProfile` distinguishes `Binary`, inline `DocumentReference`, and externally dereferenced `DocumentReference` imports.
- `FhirBundleImportResult.bundleProfile` records whether the accepted bundle gate was `document` or `collection`.
- `FhirBundleImportResult.entryProfiles` lists the per-entry parser profiles that actually emitted artifacts.

## Audit Event Envelope

`GET /api/cases/{caseId}/audit-events` now returns a typed audit-event envelope rather than only a minimal log row.

- `auditId` remains the legacy public identifier for compatibility.
- `eventId` is the extracted event-kernel identifier and currently mirrors `auditId` exactly.
- `schemaVersion` is currently fixed at `1`.
- `correlationId` records the originating HTTP request correlation and mirrors the `x-request-id` header assigned when the event was created through the API.
- `causationId` is optional and reserved for future chained event flows.
- ingestion-related audit events include normalization and import profile metadata inside `details`.

## Workflow Semantics

- New cases start in `INTAKING`.
- Adding or ingesting evidence moves a case toward packet readiness and marks existing packets stale.
- Packets are always draft workflow artifacts, not diagnoses or treatment plans.
- Reviews append immutable ledger entries to the packet.
- Finalization is workflow finality only and still does not imply medical attestation.

## FHIR Import Boundary

### Supported

- inline `Binary` resources with `text/plain` or `text/markdown` payloads;
- inline `DocumentReference` attachments with `text/plain` or `text/markdown` payloads;
- `Bundle` resources of type `document` or `collection` containing supported `Binary` and `DocumentReference` entries;
- explicit, request-gated dereference of `DocumentReference.content.attachment.url` during bundle import when `allowExternalAttachmentFetch=true`.

### Not Supported

- generic FHIR CRUD or search server behavior;
- transactions, history, `$operations`, or `CapabilityStatement` discovery endpoints;
- non-text attachment import in the current write path;
- ungated external dereference.

## External Attachment Dereference Rules

Bundle attachment dereference is allowed only when all of the following are true:

- the request sets `allowExternalAttachmentFetch=true`;
- the attachment URL is absolute `https`;
- the URL does not contain embedded credentials;
- the hostname is not local or metadata-special;
- the hostname resolves only to public IP addresses;
- redirects are rejected;
- the fetched response remains `text/plain` or `text/markdown`;
- the fetched body stays within the configured byte limit;
- if `EXTERNAL_ATTACHMENT_HOST_ALLOWLIST` is configured, the hostname must also match that allowlist.

## Error Model

- malformed JSON returns `400` with `code="invalid_json"`;
- request validation failures return `400` with `code="invalid_input"` plus Zod issue details;
- domain constraint violations return route-specific `400`, `404`, or `409` codes;
- missing or invalid bearer auth returns `401` with `code="unauthorized"` when auth is enabled;
- unmatched routes return `404` with `code="route_not_found"`.

## Important Asymmetries

- `GET /api/cases/{caseId}/audit-events` is keyed to the append-only audit store, not to current case existence. Deleted cases can still return audit history.
- `GET /api/cases/{caseId}/audit-events` now exposes correlation-aware event metadata suitable for tracing one request across case, artifact, review, and finalization transitions.
- `GET /metrics` is unauthenticated, but unlike `/healthz` and `/readyz` it is still subject to rate limiting when `RATE_LIMIT_RPM` is enabled.
- `POST /api/cases/{caseId}/physician-packets` requires at least one registered artifact and returns a `409` domain error otherwise.

## Machine-Readable Contract

The machine-readable authority surface for this route set is [../openapi.yaml](../openapi.yaml).
