---
title: "Anamnesis Roadmap And Validation"
status: active
version: "1.5.0"
last_updated: "2026-04-12"
tags: [anamnesis, healthcare, roadmap, validation]
---

# Roadmap And Validation

## Current Validation Rail

For a publication-grade local verification pass in the standalone package, run:

```bash
npm run validate:public-export
```

That aggregate rail currently expands to:

```bash
npm run lint
npm run test:coverage
npm run build
npm run audit:prod
```

Then verify:

- `GET /healthz`
- `GET /readyz`
- `GET /metrics` as an operational probe rather than a business API

This is the current local closure rail for implemented scope.

The separate live GitHub publication state should be checked against `docs/investor/GITHUB_POST_PUSH_CHECK_2026_04_03.md`.

## Current GitHub Publication Follow-Through

The April 3, 2026 post-push audit changes the order of remaining external work.

Highest-priority maintainer-side follow-up:

1. enable dependency graph so the committed `dependency-review` workflow can actually enforce pull-request policy;
2. enable repository-side security analysis surfaces such as vulnerability alerts, automated security fixes, and private vulnerability reporting as appropriate;
3. configure branch protection or rulesets only after the intended required checks are all genuinely passable.

These are repository-operations tasks, not product-scope upgrades.

## Immediate April 2026 Priorities

1. ~~Replace the single shared bearer-secret posture with a clearer operator model and a staged path toward stronger user or role scoping if the standalone remains server-side.~~ **Done (R-03)**: JWT Bearer auth now supports HS256 shared-secret verification, RS256 single-key public-key verification, local kid-aware JWKS verification, or issuer-bound remote `JWT_JWKS_URL` verification with cache-aware refresh, plus principal extraction and role-based `RequestPrincipal`. API key auth is preserved for backward compatibility, while `JWT_SECRET`, `JWT_PUBLIC_KEY`, `JWT_JWKS`, and `JWT_JWKS_URL` remain mutually exclusive JWT modes.
	Follow-through: owner-scoped case visibility, revocable sharing, local kid-aware JWKS rollover, remote issuer-bound JWKS retrieval, and operator-visible remote verifier counters are now implemented for JWT principals, while richer RBAC remains backlog.
2. ~~Publish backup, restore, and key-rotation operating guidance before making stronger security or durability claims.~~ **Done (R-04)**: active runbook published at `docs/security/backup-restore-and-key-rotation.md`. Backup and restore now have explicit current-state operator guidance; automated encrypted-store key rotation remains backlog.
3. ~~Tighten the audit-integrity narrative: keep append-only workflow history as implemented truth, but treat sealing, notarization, and stronger confidentiality boundaries as explicit backlog.~~ **Done (R-01)**: SHA-256 hash-chain on audit trail with genesis hash, chain verification, and tamper-detection API.
4. Add richer sharing policy or tenant-scoped RBAC only if the standalone needs collaboration beyond the current revocable owner-admin sharing model.
5. Close the GitHub-side dependency-graph and repository-protection gap recorded in the post-push audit.
6. **Phase 3 starter (R-02)**: packet drafting now supports an optional OpenAI-compatible local model adapter through `LLM_SIDECAR_BASE_URL` and `LLM_SIDECAR_MODEL`, while preserving deterministic fail-closed drafting when the sidecar is absent or invalid. Retrieval-backed grounding, rationale capture, and stronger evaluation packs remain explicit Phase 3 backlog.

## Current Extraction Foundations

- workflow-family-aware case creation now accepts `GENERAL_INTAKE`, `MRI_SECOND_OPINION`, and `MRNA_BOARD_REVIEW`;
- case-scoped sample registration, imaging study-context attachment, and QC-summary recording are now available on the public HTTP surface;
- artifact lineage metadata can now enter through the public artifact route and render as evidence-lineage sections in packet drafts;
- these additions remain workflow metadata and packet-enrichment capabilities, not imaging pixel ingestion, genomics file transport, or autonomous clinical decision support.

## Completed In v1.0.0

- bounded FHIR Bundle import seam at `POST /api/cases/:caseId/fhir-bundle-imports`;
- support for `document` and `collection` bundles that extract supported `Binary` and `DocumentReference` entries into source artifacts;
- explicit, request-gated `https` dereference of `DocumentReference.content.attachment.url` for bounded `text/plain` and `text/markdown` payloads;
- dedicated `fhir.bundle.imported` audit event with route, domain, and adapter coverage.

## Completed In v0.9.0

- bounded FHIR-compatible import seam at `POST /api/cases/:caseId/fhir-imports`;
- support for inline `Binary` and `DocumentReference` resources carrying `text/plain` or `text/markdown` payloads;
- reuse of the bounded text-normalization and excerpt pipeline for FHIR-derived artifacts;
- dedicated `fhir.imported` audit event with route and domain coverage.

## Completed In v0.8.0

- bounded document-ingestion seam for `text/plain` and `text/markdown` request bodies;
- deterministic whitespace normalization and bounded excerpting into source artifacts;
- dedicated `document.ingested` audit event;
- document-ingestion API coverage for route validation, audit trail, and operations summary.

## Completed In v0.7.0

- packet finalization for clinician-approved, non-stale packets;
- append-only audit trail for case creation, artifact add/remove, packet draft, review submit, finalize, and delete flows;
- audit-aware operations summary and `/metrics` counters;
- SQLite audit history retention across restarts and case deletion.

## Completed In v0.6.0

- explicit clinician review ledger (approved / changes_requested / rejected);
- physician packet status transitions (DRAFT_REVIEW_REQUIRED → CLINICIAN_APPROVED / CHANGES_REQUESTED / REJECTED);
- append-only review entries on each physician packet;
- review guard: approved packets reject further reviews;
- reviews metric in `/metrics` endpoint;
- 17 new tests (8 domain unit + 9 API integration).

## Completed In v0.5.0

- durable SQLite persistence (`STORE_PATH`);
- AES-256-GCM whole-record encryption at rest (`ENCRYPTION_KEY`);
- in-memory fallback when no store path is set;
- graceful database close on shutdown.

## Completed In v0.4.0

- Bearer-token authentication (`API_KEY`);
- per-IP sliding-window rate limiting (`RATE_LIMIT_RPM`);
- security headers via Helmet (CSP, HSTS, COOP, CORP, Referrer-Policy, etc.);
- sourceDate future-date rejection;
- Node.js engine bump to >=24 (Active LTS).

## Future-Phase Evidence Gates

| Future phase | Capability examples | Minimum gate before public scope changes |
| --- | --- | --- |
| Phase 2 - Intake plus documents | richer intake flow, typed artifact normalization, composition-aware bundle traversal, selective non-text handling | representative fixtures, code and tests for the new seam, explicit interoperability boundary, review-visible workflow state, updated claim-boundary wording |
| Phase 3 - Clinician decision-support experiments | retrieval-backed packet enrichment, local-model adapter, rationale capture, bounded draft assistance | task-local evaluation pack, explicit draft-only state boundary, auditability, deterministic validation rules, updated evidence register, no diagnosis or treatment language |
| Phase 4 - Multimodal and specialist expansion | imaging, genomics or omics evidence, wearables, specialist routing, candidate patient graph | modality-specific governance, dedicated validation docs, stronger data controls, revised regulatory positioning, separate adoption decision per subsystem |
| Phase 5 - Agentic workflow automation | orchestrated evidence gathering, task agents, model councils, automated follow-up suggestions | lifecycle security review, memory-integrity checks, capability bounds, operator-visible kill switch, explicit reliability gate, separate human-oversight design review |

## MicroPhoenix-Derived Promotion Rules

- code, tests, docs, and evidence should move together before a capability is presented as real;
- the authority stack is local and explicit: `design.md` -> `docs/design-refresh-2026-04-03.md` -> `docs/roadmap-and-validation.md` -> `docs/academic/evidence-register.md` -> `docs/claim-boundary.md`;
- adding a new model runtime, agent, or serving sidecar is not enough to widen public claims;
- future AI subsystems need evaluation fixtures, failure taxonomies, and audit visibility before they touch the main workflow;
- architecture should be transplanted minimally: explicit composition and adapter seams first, heavier platform machinery later only if justified.

## April 2026 Guardrails From The Hyper-Deep Review

- treat `/metrics` auth wording as a documentation-sync problem, not as evidence that the runtime secretly widens public product scope;
- treat stricter FHIR document-bundle envelope validation as bounded interoperability hardening, not as proof of generic FHIR document-conformance or server behavior;
- treat shared-secret auth, recovery runbooks, and stronger audit integrity as real control gaps that deserve roadmap priority.

## Non-Upgrade Rule

Future phases should not upgrade public claims faster than code, tests, and evidence do.

Research arrival alone is not a scope upgrade.

The local authority set for future-phase architecture is `design.md`, `docs/roadmap-and-validation.md`, and `docs/academic/evidence-register.md`.
