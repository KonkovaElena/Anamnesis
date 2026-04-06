# Anamnesis Phase 1 Refactor — Hyper-Deep Audit Report

**Date**: 2026-04-06  
**Scope**: Domain module extraction, fixture corpus, application layer assessment  
**Baseline**: 129 tests, 42 src files (123.4 KB), 24 test files (161.5 KB)  
**Post-refactor**: 129 tests, 46 src files (124 KB), 26 test files (172.2 KB)  
**Verdict**: ALL 129 TESTS PASS, ZERO BUILD ERRORS

---

## 1. Domain Contracts Split

### Problem
`contracts.ts` was 324 lines mixing type aliases, data interfaces, store port contracts, and the domain error class in a single file. This made it the largest contract surface in the domain, coupling type evolution to store evolution.

### Solution
Split into four focused modules with a backward-compatible re-export barrel:

| File | Lines | Responsibility |
|------|-------|---------------|
| `types.ts` | 25 | Type aliases and union types (CaseStatus, ArtifactType, WorkflowFamily, etc.) |
| `errors.ts` | 10 | `AnamnesisDomainError` class |
| `interfaces.ts` | 294 | All data shape interfaces (CaseIntake, SourceArtifact, PhysicianPacket, AnamnesisCase, etc.) |
| `store-contracts.ts` | 17 | Store port interfaces (AnamnesisStore, AuditTrailStore) |
| `contracts.ts` | 4 | Re-export barrel — full backward compatibility |

### Impact
- **Zero import changes required** — all 11 domain files that import from `./contracts` continue to work unchanged
- **Zero downstream changes** — all application, infrastructure, and test imports through the `../domain/anamnesis` barrel are unaffected
- **Enables independent evolution** — store contracts can now evolve separately from data types

### Verification
- TypeScript compilation: CLEAN (zero errors)
- Architecture test: PASS (domain layer stays free of infrastructure imports)
- Full test suite: 129/129 PASS

---

## 2. Application Layer Assessment

### Finding
The application layer was already well-decomposed during prior work:
- `create-app.ts` (107L) — thin Express compositor
- `create-app/case-routes.ts` (248L) — case CRUD routes
- `create-app/packet-routes.ts` (133L) — physician packet routes
- `create-app/ingestion-routes.ts` (116L) — document and FHIR ingestion routes
- `create-app/ops-routes.ts` — operational endpoints
- `create-app/*-schemas.ts` — Zod validation schemas per route group
- `create-app/shared.ts` (120L) — shared request/response utilities

### Decision
No further split needed. The application layer is already at appropriate granularity with clear separation of concerns.

---

## 3. Typed Fixture Corpus

### Problem
Test data was created inline across 24 test files with duplicated patterns for case creation, artifact addition, FHIR resource construction, and HTTP test helpers.

### Solution
Created two shared test support files:

| File | Lines | Content |
|------|-------|---------|
| `tests/fixtures.ts` | ~260 | Typed fixtures: case inputs (general/MRI/mRNA), artifact inputs (note/lab/summary/imaging/RNA), sample inputs, review inputs, document payloads, FHIR resource factory functions, API request bodies |
| `tests/helpers.ts` | ~70 | HTTP test helpers: `withServer()`, `jsonRequest()`, `textRequest()` |

### Coverage
The fixture corpus covers:
- **3 workflow families**: GENERAL_INTAKE, MRI_SECOND_OPINION, MRNA_BOARD_REVIEW
- **5 artifact types**: note, lab, summary, imaging-summary, and semantically-typed RNA FASTQ
- **3 review actions**: approved, changes_requested, rejected
- **2 document content types**: text/plain, text/markdown
- **4 FHIR resource factories**: Binary, DocumentReference (inline + external URL), document Bundle, collection Bundle
- **4 API request bodies**: case creation, artifact addition, document ingestion, review submission

### Adoption Path
The fixture corpus is additive in this wave. Existing tests were not migrated yet and still use their current inline builders and helper functions.

Existing tests can adopt the shared fixtures and helpers incrementally via import in a follow-up wave. No breaking change to existing test patterns was introduced here.

---

## 4. Architecture Invariants Verified

| Invariant | Status |
|-----------|--------|
| Domain layer free of infrastructure imports | PASS |
| Application layer free of infrastructure imports | PASS |
| Core layer has no domain/application imports | PASS (by file inspection) |
| Entry chain: index.ts → bootstrap.ts → create-app.ts | INTACT |
| Barrel re-export backward compatibility | PASS (zero import changes needed) |

---

## 5. File Structure After Refactor

```
src/
├── index.ts                          (72L, entry point)
├── bootstrap.ts                      (81L, composition root)
├── graceful-shutdown.ts              (51L)
├── core/
│   ├── audit-events.ts               (86L)
│   ├── correlation.ts
│   ├── ids.ts
│   └── normalization-profiles.ts     (57L)
├── domain/
│   ├── anamnesis.ts                  (barrel re-export)
│   └── anamnesis/
│       ├── types.ts                  (25L)  ← NEW
│       ├── errors.ts                 (10L)  ← NEW
│       ├── interfaces.ts             (294L) ← NEW
│       ├── store-contracts.ts        (17L)  ← NEW
│       ├── contracts.ts              (4L, re-export barrel)  ← SIMPLIFIED
│       ├── case-workflow.ts          (182L)
│       ├── packet-workflow.ts        (263L)
│       ├── packet-state-machine.ts   (53L)
│       ├── document-imports.ts       (150L)
│       ├── document-import-utils.ts  (106L)
│       ├── fhir-import-parsing.ts    (359L)
│       ├── fhir-binary-import-parsing.ts
│       ├── evidence-lineage.ts
│       ├── operations.ts             (52L)
│       ├── specialty-context.ts      (72L)
│       └── audit-identity.ts
├── application/
│   ├── create-app.ts                 (107L)
│   ├── auth-middleware.ts
│   ├── rate-limiter.ts               (46L)
│   └── create-app/
│       ├── case-routes.ts            (248L)
│       ├── packet-routes.ts          (133L)
│       ├── ingestion-routes.ts       (116L)
│       ├── ops-routes.ts
│       ├── case-schemas.ts           (90L)
│       ├── packet-schemas.ts
│       ├── document-schemas.ts
│       ├── shared-schemas.ts
│       ├── schemas.ts
│       └── shared.ts                 (120L)
└── infrastructure/
    ├── InMemoryAnamnesisStore.ts
    ├── InMemoryAuditTrailStore.ts
    ├── SqliteAnamnesisStore.ts        (58L)
    ├── SqliteAuditTrailStore.ts       (102L)
    ├── encryption.ts
    ├── HttpExternalAttachmentFetcher.ts (122L)
    ├── external-attachment-target-validators.ts (76L)
    ├── sqlite-audit-event-readers.ts
    └── sqlite-audit-event-rows.ts

tests/
├── fixtures.ts                        ← NEW (typed fixture corpus)
├── helpers.ts                         ← NEW (HTTP test helpers)
└── *.test.ts                          (24 test files, 129 tests)
```

---

## 6. Remaining Phase 1 Opportunities

| Item | Priority | Notes |
|------|----------|-------|
| Migrate existing tests to use `fixtures.ts` imports | Medium | Incremental; reduces duplication across 24 test files |
| Split `fhir-import-parsing.ts` (359L, largest file) | Medium | Could separate document-bundle vs single-resource parsing |
| Extract `withServer`/`jsonRequest` from existing tests to use `helpers.ts` | Low | Backward-compatible; adopt per-file |
| Add `RecordQcSummaryInput` and study-context fixtures | Low | Expand fixture corpus for specialty workflows |

---

## 7. Metrics Summary

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| Source files | 42 | 46 | +4 |
| Source size (KB) | 123.4 | 124.0 | +0.6 |
| Test files | 24 | 26 | +2 |
| Test size (KB) | 161.5 | 172.2 | +10.7 |
| Tests | 129 | 129 | 0 |
| Pass rate | 100% | 100% | 0 |
| Build errors | 0 | 0 | 0 |
| Largest file (contracts.ts) | 324L | 4L | -320L |
| New module files | — | 4 | +4 |
| New fixture/helper files | — | 2 | +2 |
