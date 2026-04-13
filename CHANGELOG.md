# Changelog

All notable changes to this project should be documented in this file.

The format is based on Keep a Changelog and the project uses Semantic Versioning for tagged releases.

## [Unreleased]

### Added

- **R-01 tamper-evident audit trail**: SHA-256 hash-chain on all audit events; `GENESIS_CHAIN_HASH`, `computeChainHash()`, `canonicalizeAuditEvent()`, and `verifyAuditChain()` in `src/core/audit-events.ts`; `chainHash` field stored in both InMemory and SQLite audit stores; 16 dedicated hash-chain tests;
- **R-03 JWT Bearer authentication**: JWT verification in `src/core/jwt-verification.ts` now supports HS256 shared-secret validation, RS256 single-key public-key validation, kid-aware local JWKS validation, and issuer-bound remote `JWT_JWKS_URL` retrieval with bounded HTTPS fetch, cache-aware freshness, `ETag`/`Last-Modified` revalidation, refresh-on-kid-miss, and operator-visible summary or metrics telemetry; auth middleware supports both API key and JWT Bearer tokens with principal extraction; `JWT_SECRET`, `JWT_PUBLIC_KEY`, `JWT_JWKS`, `JWT_JWKS_URL`, `JWT_ISSUER`, and `JWT_AUDIENCE` env vars; `request.principal` populated with `RequestPrincipal` including roles and claims; dedicated JWT unit and integration coverage in `tests/jwt-auth.test.ts`, `tests/auth.test.ts`, and `tests/remote-jwks.test.ts`;
- **R-02 bounded LLM draft assistance seam**: `LlmSidecar`, `LlmDraftAssistanceInput`, and `LlmDraftAssistanceResult` interfaces now wire through bootstrap and packet drafting as an optional fail-closed application-layer enrichment path; `NoOpLlmSidecar` remains the fallback adapter when no sidecar is configured, `OpenAiCompatibleLlmSidecar` can call an operator-managed OpenAI-compatible `POST /v1/chat/completions` endpoint through `LLM_SIDECAR_BASE_URL` and `LLM_SIDECAR_MODEL`, available sidecars can append one bounded draft-assistance section plus flat audit metadata to `packet.drafted`, clinically unsafe diagnosis or treatment language is rejected before packet enrichment is accepted, and operator-visible sidecar request, success, failure, and timestamp counters now surface through `/api/operations/summary` and `/metrics`; focused contract plus API coverage lives in `tests/llm-sidecar.test.ts` and `tests/llm-packet-enrichment.test.ts`;
- authenticated principal propagation into audit events for routes that do not already provide a workflow-specific actor, plus `GET /api/audit-chain/verify` for operator-visible hash-chain verification;
- persisted SQLite hash-chain verification coverage in `tests/audit-store.test.ts` and a checked-in `.env.example` for runtime configuration bootstrapping;
- JWT packet governance: under JWT bearer auth, `requestedBy`, `reviewerName`, and `finalizedBy` are bound to the authenticated subject, spoofed identity fields are rejected, and packet review/finalize enforce minimal role checks (`reviewer`/`clinician`);
- stricter JWT verification: `nbf` is enforced, non-empty `sub` is required, malformed `roles` are rejected, optional JOSE `typ` matching is supported via `JWT_TYP`, weak HS256 secrets are rejected in production bootstrap, weak RS256 verification keys are rejected with an RSA-2048 floor, and `JWT_SECRET` / `JWT_PUBLIC_KEY` dual configuration is rejected at bootstrap;
- revocable case sharing on top of JWT owner-scoped ACL: `POST /api/cases/:caseId/access-grants` and `DELETE /api/cases/:caseId/access-grants/:principalId` let the JWT case owner or an API-key operator grant or revoke another JWT principal's access, emit `case.shared` and `case.unshared` audit events, keep destructive case-admin actions owner-or-operator only, and preserve deleted-case audit visibility only for principals who still held access at deletion time;
- cursor-based pagination (`limit`, `offset` query params) on `GET /api/cases` and `GET /api/cases/:caseId/audit-events`; default page size 100, maximum 1000;
- versioned encryption token format (`v1:iv:tag:ciphertext`) with backward-compatible decryption of legacy 3-part tokens, enabling future key rotation without data loss;
- IPv4-mapped IPv6 address normalization in rate limiter (`::ffff:x.x.x.x → x.x.x.x`) preventing per-family key bypass;
- multi-stage `Dockerfile` and `.dockerignore` for reproducible container builds (Node 24 Alpine, non-root, tini, healthcheck);
- encryption versioning and legacy-compat tests (`tests/encryption.test.ts`);
- SSRF defense and paginated-endpoint rows in traceability matrix.

### Changed

- domain contracts split from single `contracts.ts` into focused sub-modules: `types.ts`, `errors.ts`, `interfaces.ts`, `store-contracts.ts`, with backward-compatible barrel re-export;
- shared test fixtures (`tests/fixtures.ts`) and HTTP helpers (`tests/helpers.ts`) adopted across 12 test files, reducing inline payload duplication by ~400 lines;
- traceability matrix anchors updated to reference precise sub-modules after domain split;
- cryptographic inventory and agility assessment added to `docs/security/crypto-agility-inventory.md` covering current primitives, key management state, quantum readiness, and phased migration plan;
- SSRF defense-path coverage expanded: embedded-credential rejection, redirect blocking, timeout abort, oversized-body fail-closed, host allowlist enforcement, IPv6 ULA rejection, non-ok HTTP status, non-Bearer auth scheme rejection, and empty Bearer token rejection now have dedicated tests (suite total 129 → 137).

### Added

- workflow-family-aware case creation and case-scoped extraction routes for molecular samples, imaging study context, and QC summaries;
- public artifact-route support for derived-artifact metadata and evidence-lineage-aware packet rendering;
- read-only `GET /api/cases/:caseId/evidence-lineage` for producer-consumer artifact graphs and artifact summary metadata;
- `CITATION.cff` for GitHub-native citation rendering and later DOI backfill;
- `.github/CODEOWNERS` for review routing and ruleset-based protection;
- `.github/dependabot.yml` for scheduled npm and GitHub Actions dependency maintenance.
- `.github/workflows/codeql.yml` for repository-managed CodeQL scanning on `main` and pull requests.
- `.github/workflows/dependency-review.yml` for pull-request dependency review enforcement;
- `eslint.config.mjs`, `npm run lint`, and `npm run test:coverage` as part of the standalone publication verification baseline;
- `openapi.yaml`, `GOVERNANCE.md`, `SUPPORT.md`, and the expanded `docs/interop`, `docs/security`, `docs/traceability-matrix`, and `docs/investor` publication surfaces;
- `docs/investor/GITHUB_POST_PUSH_CHECK_2026_04_03.md` to record live GitHub post-push state, current workflow registration, and admin-bound follow-up actions.

### Changed

- `README.md`, `docs/api-scope.md`, `docs/claim-boundary.md`, and `docs/traceability-matrix.md` now document the MRI/mRNA extraction foundations and correct traceability anchors to the live test suite;
- GitHub publishing guidance now covers code owner protection, repository citation, and archival DOI backfill;
- CI push triggers now target the canonical `main` branch only after the standalone branch rename;
- issue intake now exposes private security-reporting guidance directly from the GitHub issue chooser;
- `validate:public-export` now runs lint, coverage, build, and production dependency audit checks;
- FHIR `document` bundle import now enforces the document-envelope fields already required by this slice: first-entry `Composition`, `identifier.system`, `identifier.value`, and `timestamp`; clients relying on the previously looser acceptance path must update their payloads;
- README deployment notes now correctly describe `/metrics` as unauthenticated, matching the live runtime and API contract surfaces;
- README, package metadata, and publishing guidance now present the repository as an evidence-first clinician-in-the-loop workflow control plane, with an explicit GitHub topic set aligned to current scope and architecture;
- the live GitHub audit shows `CI` and `CodeQL` running successfully on the public repository, while `dependency-review` is currently blocked by repository-side dependency graph enablement rather than a broken workflow file.

## [1.0.0] - 2026-04-01

### Added

- bounded FHIR Bundle import route for `document` and `collection` bundles;
- gated `attachment.url` dereference over `https` for supported text content;
- clinician review ledger and packet finalization workflow;
- SQLite persistence with AES-256-GCM encryption at rest;
- audit trail, operations summary, health, readiness, and metrics routes.

### Changed

- project branding normalized to Anamnesis;
- standalone docs and runtime scope aligned around clinician-in-the-loop workflow boundaries.