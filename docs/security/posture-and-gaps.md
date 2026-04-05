---
title: "Anamnesis Security Posture And Gaps"
status: active
version: "1.0.1"
last_updated: "2026-04-05"
tags: [anamnesis, security, evidence]
---

# Security Posture And Gaps

## Purpose

Summarize the current security posture of the standalone Anamnesis runtime and the remaining gaps that should not be overstated in public claims.

This page is implementation-grounded. It does not claim security controls that are not present in code.

## External Basis

- Express production security guidance remains centered on TLS, input validation, Helmet, dependency hygiene, and brute-force protection.
- OWASP SSRF guidance recommends allowlists where possible, rejection of local or metadata targets, redirect denial, and defense in depth at both application and network layers.
- Node.js `v24` is the current Active LTS release line and is the runtime baseline declared by this repository.

## Current Control Matrix

| Threat surface | Current control | Current repo anchor | Residual note |
| --- | --- | --- | --- |
| Unauthenticated application access | Bearer token auth on application routes when `API_KEY` is set | `src/application/auth-middleware.ts`, `src/bootstrap.ts` | Single shared bearer secret, not per-user identity or RBAC |
| Silent fail-open startup | Secure-by-default bootstrap policy; unauthenticated startup now requires explicit `ALLOW_INSECURE_DEV_AUTH=true` and is blocked in production mode | `src/bootstrap.ts`, `src/index.ts` | Local-dev override still exists by design |
| Brute-force or burst abuse | Per-IP sliding-window limiter via `RATE_LIMIT_RPM` | `src/application/rate-limiter.ts`, `src/application/create-app.ts` | Disabled by default unless configured |
| Header hardening | Helmet with CSP/HSTS/COOP/CORP/Referrer-Policy and related headers | `src/application/create-app.ts` | TLS termination is still deployment-side, not in-process |
| Input shape abuse | Zod request validation plus malformed JSON handling | `src/application/create-app.ts` | Payload-size exhaustion beyond configured limits is not separately documented as a public API contract |
| Data-at-rest disclosure | AES-256-GCM whole-record encryption for SQLite case store | `src/infrastructure/encryption.ts`, `src/infrastructure/SqliteAnamnesisStore.ts` | Audit store is durable but not encrypted by a second independent mechanism |
| External attachment SSRF | `https` only, no URL credentials, local/metadata hostname denial, DNS resolution to public addresses only, redirect rejection, text-only MIME restriction, byte limit, optional hostname allowlist | `src/infrastructure/HttpExternalAttachmentFetcher.ts` | Stronger production posture still benefits from network egress controls |
| Unauthorized claim widening via FHIR | Import seam remains constrained to narrow text-oriented resources and bundle types | `src/domain/anamnesis.ts`, `docs/claim-boundary.md` | Not a generic FHIR REST server |
| Tampering or retroactive workflow confusion | Append-only audit events for write actions and packet review/finalization transitions | `src/domain/anamnesis.ts`, `src/infrastructure/*AuditTrailStore.ts` | No cryptographic signing or external notarization yet |

## Auth Posture

- Application routes rely on a bearer token shared through `API_KEY`.
- Health, readiness, and metrics probes intentionally remain unauthenticated.
- Local development can opt into unauthenticated startup only through `ALLOW_INSECURE_DEV_AUTH=true`.
- `ALLOW_INSECURE_DEV_AUTH=true` is rejected when `NODE_ENV=production`.

This is a secure-by-default improvement over the earlier silent no-key startup behavior.

## External Attachment Posture

The highest-risk runtime surface in the current slice is external bundle attachment dereference.

Current application-layer controls:

- opt-in only through request payload;
- `https` only;
- embedded credentials rejected;
- localhost and metadata-style hostnames rejected;
- DNS resolution required before fetch;
- every resolved address must be public, not private, loopback, link-local, multicast, or metadata-special;
- redirects rejected;
- only `text/plain` and `text/markdown` accepted;
- body size bounded;
- optional strict hostname allowlist through `EXTERNAL_ATTACHMENT_HOST_ALLOWLIST`.

Operator recommendation:

- keep the application in an egress-constrained network segment;
- use `EXTERNAL_ATTACHMENT_HOST_ALLOWLIST` in production when attachment dereference is needed at all;
- if attachment dereference is not required, keep `allowExternalAttachmentFetch=false` at callers and treat remote URL fetch as disabled-by-policy.

## Persistence And Audit Posture

- Cases can persist in SQLite when `STORE_PATH` is configured.
- Encrypted persistence requires `ENCRYPTION_KEY` and is enforced when `STORE_PATH` is set.
- Audit history is append-only at the application level and survives case deletion.
- Sample-registration metadata, imaging study identifiers, and QC summaries currently live inside the same encrypted case record rather than under separate field-level compartmentalization.

What is not yet true:

- tamper-evident audit signatures;
- external audit export or notarization;
- documented key-rotation procedure;
- documented backup-and-restore procedure.

## Known Gaps

1. TLS is expected to be handled by deployment infrastructure rather than by the Node process itself.
2. Auth is shared-secret based, not user- or role-based.
3. There is no central secret manager integration or automated key rotation workflow in this repository.
4. The audit trail is append-only in software terms, but not cryptographically sealed.
5. There is no formal backup, restore, or disaster-recovery runbook in the active docs set yet.
6. Imaging study identifiers and molecular sample metadata are encrypted at rest with the case record, but they are not isolated behind a second compartment or field-level key boundary.
7. The security posture is strong for the current narrow workflow surface, but it is not a claim of regulatory clearance or production security certification.

## Operator Baseline

Minimum recommended deployment posture for the current slice:

1. Set `API_KEY` and keep `ALLOW_INSECURE_DEV_AUTH` unset.
2. Run behind TLS termination.
3. Set `RATE_LIMIT_RPM` to a non-zero value.
4. Set `STORE_PATH` and `ENCRYPTION_KEY` together for durable encrypted storage.
5. Use `EXTERNAL_ATTACHMENT_HOST_ALLOWLIST` if remote attachment fetch is enabled.
6. Monitor `/readyz` and `/metrics` and treat them as operational surfaces, not business APIs.

## Public Claim Boundary

This posture supports a narrow workflow claim: authenticated, bounded, auditable case-organization software for clinician review.

It does not support claims of clinical decision safety, zero-trust completeness, regulatory approval, or generalized secure health-data platform status.