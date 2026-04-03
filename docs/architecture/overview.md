---
title: "Anamnesis Architecture Overview"
status: active
version: "1.2.0"
last_updated: "2026-04-03"
tags: [anamnesis, healthcare, architecture, reference]
---

# Architecture Overview

## Runtime Shape

The current standalone uses a reduced runtime chain:

- `src/index.ts`
- `src/bootstrap.ts`
- `src/core/ids.ts`
- `src/core/correlation.ts`
- `src/core/audit-events.ts`
- `src/core/normalization-profiles.ts`
- `src/application/create-app.ts`
- `src/application/auth-middleware.ts`
- `src/application/rate-limiter.ts`
- `src/domain/anamnesis.ts`
- `src/infrastructure/HttpExternalAttachmentFetcher.ts`
- `src/infrastructure/InMemoryAnamnesisStore.ts`
- `src/infrastructure/InMemoryAuditTrailStore.ts`
- `src/infrastructure/SqliteAnamnesisStore.ts`
- `src/infrastructure/SqliteAuditTrailStore.ts`
- `src/infrastructure/encryption.ts`
- `src/graceful-shutdown.ts`

## Intent By Layer

| Layer | Responsibility in this slice |
| --- | --- |
| Core | extracted event-kernel primitives plus typed normalization/import profile classification adapted from MicroPhoenix without the parent DI/MCP/MAS estate |
| Domain | case workflow state, artifact model, bounded text-document normalization, profile-aware bounded FHIR resource and Bundle import parsing, physician packet draft/review/finalization model, audit event model |
| Application | HTTP routes, request validation, response contracts, error mapping, auth middleware, rate limiting, metrics, JSON-only ingestion boundary, bounded FHIR import wrapper routes, request-to-audit correlation propagation |
| Infrastructure | durable SQLite persistence with AES-256-GCM encryption at rest, append-only correlation-aware audit persistence, bounded external attachment fetch with public-target validation and optional host allowlisting, in-memory fallbacks |

## Extracted Kernel

The current audit trail now uses a minimal event kernel adapted from MicroPhoenix rather than a purely ad hoc log row.

- every audit event has both `auditId` and `eventId`, with `auditId` preserved as a compatibility alias;
- every audit event is schema-versioned (`schemaVersion = 1`);
- every audit event carries a `correlationId`, which mirrors the originating `x-request-id` header on HTTP-created events;
- stores can query the append-only history both by case and by correlation id.

## Normalization Kernel

The current import surfaces also expose a minimal normalization-profile kernel.

- text ingestion returns an explicit profile for `text/plain` vs `text/markdown` normalization;
- single-resource FHIR import distinguishes Binary, inline DocumentReference, and external-fetch DocumentReference parser paths;
- bundle import returns both a bundle-level profile and the list of entry profiles that actually produced artifacts.

## Deliberately Missing
- multipart upload pipeline;
- OCR or binary document parsing;
- FHIR REST server semantics, Bundle transaction semantics, or generic external attachment dereference;
- external audit export or tamper-evident signatures;
- event publishing;
- async workers;
- diagnostic reasoning layer.

## Claim Boundary

This runtime is an organizational workflow system. It is not a clinical decision engine.
