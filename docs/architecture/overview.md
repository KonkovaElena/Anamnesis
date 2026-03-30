---
title: "Personal Doctor Architecture Overview"
status: active
version: "0.2.0"
last_updated: "2026-03-30"
tags: [personal-doctor, healthcare, architecture, reference]
---

# Architecture Overview

## Runtime Shape

The current standalone uses a reduced runtime chain:

- `src/index.ts`
- `src/bootstrap.ts`
- `src/application/create-app.ts`
- `src/domain/personal-doctor.ts`
- `src/infrastructure/InMemoryPersonalDoctorStore.ts`

## Intent By Layer

| Layer | Responsibility in this slice |
| --- | --- |
| Domain | case workflow state, artifact model, physician packet draft model |
| Application | HTTP routes, request validation, response contracts, error mapping |
| Infrastructure | in-memory persistence |

## Deliberately Missing

- database persistence;
- document parsing pipeline;
- clinician review ledger;
- event publishing;
- async workers;
- diagnostic reasoning layer.

## Claim Boundary

This runtime is an organizational workflow system. It is not a clinical decision engine.
