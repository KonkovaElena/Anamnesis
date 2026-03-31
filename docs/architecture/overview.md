---
title: "Personal Doctor Architecture Overview"
status: active
version: "0.7.0"
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
| Domain | case workflow state, artifact model, physician packet draft/review/finalization model, audit event model |
| Application | HTTP routes, request validation, response contracts, error mapping, auth middleware, rate limiting, metrics |
| Infrastructure | durable SQLite persistence with AES-256-GCM encryption at rest, append-only audit persistence, in-memory fallbacks |

## Deliberately Missing
- document parsing pipeline;
- external audit export or tamper-evident signatures;
- event publishing;
- async workers;
- diagnostic reasoning layer.

## Claim Boundary

This runtime is an organizational workflow system. It is not a clinical decision engine.
