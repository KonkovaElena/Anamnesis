---
title: "Personal Doctor Architecture Overview"
status: active
version: "0.8.0"
last_updated: "2026-03-31"
tags: [personal-doctor, healthcare, architecture, reference]
---

# Architecture Overview

## Runtime Shape

The current standalone uses a reduced runtime chain:

- `src/index.ts`
- `src/bootstrap.ts`
- `src/application/create-app.ts`
- `src/application/auth-middleware.ts`
- `src/application/rate-limiter.ts`
- `src/domain/personal-doctor.ts`
- `src/infrastructure/InMemoryPersonalDoctorStore.ts`
- `src/infrastructure/InMemoryAuditTrailStore.ts`
- `src/infrastructure/SqlitePersonalDoctorStore.ts`
- `src/infrastructure/SqliteAuditTrailStore.ts`
- `src/infrastructure/encryption.ts`
- `src/graceful-shutdown.ts`

## Intent By Layer

| Layer | Responsibility in this slice |
| --- | --- |
| Domain | case workflow state, artifact model, bounded text-document normalization, physician packet draft/review/finalization model, audit event model |
| Application | HTTP routes, request validation, response contracts, error mapping, auth middleware, rate limiting, metrics, JSON-only ingestion boundary |
| Infrastructure | durable SQLite persistence with AES-256-GCM encryption at rest, append-only audit persistence, in-memory fallbacks |

## Deliberately Missing
- multipart upload pipeline;
- OCR or binary document parsing;
- FHIR resource parsing or import transactions;
- external audit export or tamper-evident signatures;
- event publishing;
- async workers;
- diagnostic reasoning layer.

## Claim Boundary

This runtime is an organizational workflow system. It is not a clinical decision engine.
