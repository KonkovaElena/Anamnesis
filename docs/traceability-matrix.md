---
title: "Anamnesis Traceability Matrix"
status: active
version: "1.3.0"
last_updated: "2026-04-09"
tags: [anamnesis, traceability, evidence, reference]
---

# Traceability Matrix

## Purpose

Map implemented features to public claims, implementation anchors, and automated evidence.

This page is the shortest route for checking whether a product or diligence statement is stronger than the actual repository evidence.

## Matrix

| Feature | Safe public claim | Implementation anchors | Automated evidence |
| --- | --- | --- | --- |
| Structured case intake | The system can create, list, retrieve, and delete workflow cases with typed intake data. | `src/application/create-app/case-routes.ts`, `src/domain/anamnesis/case-workflow.ts`, `src/domain/anamnesis/interfaces.ts` | `tests/api.test.ts`, `tests/sqlite-store.test.ts` |
| Workflow-family-aware case creation | The system can create cases for general intake, MRI second-opinion, and mRNA board-review workflows. | `src/application/create-app/case-schemas.ts`, `src/application/create-app/case-routes.ts`, `src/domain/anamnesis/case-workflow.ts` | `tests/extraction-api.test.ts`, `tests/extraction-foundation.test.ts` |
| Source artifact management | The system can register and remove source artifacts and keep packet state synchronized. | `src/application/create-app/case-routes.ts`, `src/domain/anamnesis/case-workflow.ts` | `tests/api.test.ts`, `tests/extraction-api.test.ts` |
| Derived artifact lineage | The system preserves derived-artifact metadata and parent-child lineage through the public artifact route, a dedicated read-only lineage endpoint, and packet rendering. | `src/application/create-app/case-routes.ts`, `src/application/create-app/case-schemas.ts`, `src/domain/anamnesis/case-workflow.ts`, `src/domain/anamnesis/evidence-lineage.ts`, `src/domain/anamnesis/packet-workflow.ts` | `tests/extraction-api.test.ts`, `tests/extraction-foundation.test.ts` |
| Molecular sample registration | The system can register case-scoped molecular samples and surface them in physician packet drafts. | `src/application/create-app/case-schemas.ts`, `src/application/create-app/case-routes.ts`, `src/domain/anamnesis/case-workflow.ts`, `src/domain/anamnesis/packet-workflow.ts` | `tests/extraction-api.test.ts`, `tests/extraction-foundation.test.ts` |
| Imaging study context and QC | The system can attach imaging study context, record QC summaries, and surface both in physician packet drafts. | `src/application/create-app/case-schemas.ts`, `src/application/create-app/case-routes.ts`, `src/domain/anamnesis/case-workflow.ts`, `src/domain/anamnesis/specialty-context.ts`, `src/domain/anamnesis/packet-workflow.ts` | `tests/extraction-api.test.ts`, `tests/extraction-foundation.test.ts` |
| Bounded text document ingestion | The system can normalize bounded plain-text and markdown inputs into workflow artifacts. | `src/application/create-app/ingestion-routes.ts`, `src/domain/anamnesis/document-imports.ts` | `tests/document-ingestion-api.test.ts`, `tests/document-ingestion.test.ts` |
| Narrow FHIR inline import | The system can import supported inline `Binary` and `DocumentReference` resources into workflow artifacts. | `src/application/create-app/ingestion-routes.ts`, `src/domain/anamnesis/document-imports.ts`, `src/domain/anamnesis/fhir-import-parsing.ts` | `tests/fhir-import-api.test.ts`, `tests/fhir-import.test.ts` |
| Narrow FHIR bundle import | The system can import supported `document` and `collection` bundles into workflow artifacts. | `src/application/create-app/ingestion-routes.ts`, `src/domain/anamnesis/document-imports.ts`, `src/domain/anamnesis/fhir-import-parsing.ts` | `tests/fhir-bundle-import-api.test.ts`, `tests/fhir-bundle-import.test.ts` |
| Gated remote attachment fetch | The system can dereference remote bundle attachments only through an opt-in, bounded, public-target-only path. | `src/infrastructure/HttpExternalAttachmentFetcher.ts`, `src/domain/anamnesis.ts`, `src/bootstrap.ts` | `tests/http-external-attachment-fetcher.test.ts`, `tests/fhir-bundle-import.test.ts` |
| Secure-by-default auth startup | Normal runtime requires `API_KEY`; unauthenticated startup requires an explicit dev override and is blocked in production mode. | `src/index.ts`, `src/bootstrap.ts`, `src/application/auth-middleware.ts` | `tests/auth.test.ts` |
| Review ledger and packet finalization | The system records explicit clinician reviews and finalizes only approved, non-stale packets. | `src/application/create-app/packet-routes.ts`, `src/domain/anamnesis/packet-workflow.ts` | `tests/review-ledger.test.ts`, `tests/finalization.test.ts` |
| Audit trail and operational counters | The system writes append-only audit events for write flows and exposes aggregate counters. | `src/application/create-app/ops-routes.ts`, `src/domain/anamnesis/operations.ts`, `src/infrastructure/SqliteAuditTrailStore.ts`, `src/infrastructure/InMemoryAuditTrailStore.ts` | `tests/audit-trail.test.ts`, `tests/api.test.ts` |
| Encrypted durable persistence | The system can persist cases in SQLite with AES-256-GCM encryption at rest when configured, using a versioned token format for future key rotation. | `src/infrastructure/SqliteAnamnesisStore.ts`, `src/infrastructure/encryption.ts`, `src/bootstrap.ts` | `tests/encryption.test.ts`, `tests/sqlite-store.test.ts` |
| Graceful shutdown | The process exposes health/readiness behavior and drains on shutdown. | `src/index.ts`, `src/graceful-shutdown.ts`, `src/application/create-app.ts` | `tests/shutdown.test.ts`, `tests/api.test.ts` |
| SSRF defense in depth | External attachment fetch rejects private, local, metadata, and special-use targets through hostname denial, DNS pre-resolution, address validation, credential rejection, redirect blocking, and bounded response reads. | `src/infrastructure/external-attachment-target-validators.ts`, `src/infrastructure/HttpExternalAttachmentFetcher.ts` | `tests/http-external-attachment-fetcher.test.ts` |
| Paginated list endpoints | Case listing and audit-event listing return bounded pages with configurable limit and offset, preventing unbounded memory consumption. | `src/domain/anamnesis/store-contracts.ts`, `src/application/create-app/case-routes.ts`, `src/infrastructure/SqliteAnamnesisStore.ts`, `src/infrastructure/InMemoryAnamnesisStore.ts` | `tests/api.test.ts` |

## Use Rule

When proposing any external statement, verify that all four columns remain true:

1. the feature exists;
2. the public claim is no stronger than the feature;
3. the implementation anchors still point to live code;
4. the automated evidence still passes.

If any column fails, the claim is not ready.

## Related Surfaces

- [claim-boundary.md](claim-boundary.md)
- [api-scope.md](api-scope.md)
- [interop/README.md](interop/README.md)
- [security/posture-and-gaps.md](security/posture-and-gaps.md)
- [../openapi.yaml](../openapi.yaml)