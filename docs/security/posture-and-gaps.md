---
title: "Anamnesis Security Posture And Gaps"
status: active
version: "1.6.0"
last_updated: "2026-04-12"
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
| Unauthenticated application access | Bearer token auth on application routes when `API_KEY`, `JWT_SECRET`, `JWT_PUBLIC_KEY`, `JWT_JWKS`, or `JWT_JWKS_URL` is set | `src/application/auth-middleware.ts`, `src/bootstrap.ts`, `src/core/jwt-verification.ts`, `src/infrastructure/RemoteJwtJwksProvider.ts` | API-key path remains shared-secret and operator-wide; JWT path can verify HS256 shared-secret tokens, RS256 public-key tokens, RS256 tokens selected from a local JWKS by `kid`, or RS256 tokens validated against an issuer-bound remote JWKS with cache-aware refresh, is subject-bound, owner-scopes newly created cases, supports explicit grant and revoke sharing to named principals, keeps destructive case-admin actions owner-or-operator only, validates `sub`/`nbf`/configured `iss`/`aud`/optional `typ`, and applies packet-route role gates, but it is still not a full tenant/RBAC system |
| Silent fail-open startup | Secure-by-default bootstrap policy; unauthenticated startup now requires explicit `ALLOW_INSECURE_DEV_AUTH=true` and is blocked in production mode | `src/bootstrap.ts`, `src/index.ts` | Local-dev override still exists by design |
| Brute-force or burst abuse | Per-IP sliding-window limiter via `RATE_LIMIT_RPM` with IPv4-mapped IPv6 normalization | `src/application/rate-limiter.ts`, `src/application/create-app.ts` | Disabled by default unless configured |
| Header hardening | Helmet with CSP/HSTS/COOP/CORP/Referrer-Policy and related headers | `src/application/create-app.ts` | TLS termination is still deployment-side, not in-process |
| Input shape abuse | Zod request validation plus malformed JSON handling | `src/application/create-app.ts` | Payload-size exhaustion beyond configured limits is not separately documented as a public API contract |
| Data-at-rest disclosure | AES-256-GCM whole-record encryption for SQLite case store with versioned token format (`v1:` prefix) for future key rotation | `src/infrastructure/encryption.ts`, `src/infrastructure/SqliteAnamnesisStore.ts` | Audit store is durable but not encrypted by a second independent mechanism |
| External attachment SSRF | `https` only, no URL credentials, local/metadata hostname denial, DNS resolution to public addresses only, redirect rejection, text-only MIME restriction, byte limit, optional hostname allowlist | `src/infrastructure/HttpExternalAttachmentFetcher.ts` | Stronger production posture still benefits from network egress controls |
| Unauthorized claim widening via FHIR | Import seam remains constrained to narrow text-oriented resources and bundle types | `src/domain/anamnesis.ts`, `docs/claim-boundary.md` | Not a generic FHIR REST server |
| Tampering or retroactive workflow confusion | Append-only audit events for write actions and packet review/finalization transitions, plus SHA-256 hash-chain verification | `src/domain/anamnesis.ts`, `src/core/audit-events.ts`, `src/infrastructure/*AuditTrailStore.ts`, `src/application/create-app/ops-routes.ts` | No external notarization or detached signatures yet |

## Auth Posture

- Application routes rely on a bearer token shared through `API_KEY` and/or a JWT validated through either `JWT_SECRET` (HS256), `JWT_PUBLIC_KEY` (RS256 single key), `JWT_JWKS` (RS256 local JWK Set), or `JWT_JWKS_URL` (issuer-bound remote RS256 JWKS).
- `JWT_SECRET`, `JWT_PUBLIC_KEY`, `JWT_JWKS`, and `JWT_JWKS_URL` are mutually exclusive JWT verifier modes; bootstrap rejects ambiguous dual configuration.
- JWT validation now rejects missing subject, malformed role arrays, future `nbf`, issuer/audience mismatches, and optional JOSE `typ` mismatches when `JWT_TYP` is configured.
- Health, readiness, and metrics probes intentionally remain unauthenticated.
- Local development can opt into unauthenticated startup only through `ALLOW_INSECURE_DEV_AUTH=true`.
- `ALLOW_INSECURE_DEV_AUTH=true` is rejected when `NODE_ENV=production`.
- In `NODE_ENV=production`, weak HS256 shared secrets are rejected at bootstrap; the current minimum is 32 bytes.
- Weak RS256 verification keys are also rejected at bootstrap; the current minimum is an RSA public key with modulus length >= 2048 bits.
- Under JWT bearer auth, newly created cases are owner-scoped to the authenticated subject, and non-owner JWT principals do not see or mutate those cases through case-bound routes.
- A JWT case owner or an API-key operator can explicitly grant and revoke case access to another JWT principal.
- Shared non-owner JWT principals can collaborate on case-bound reads and non-destructive writes, but cannot re-grant access, revoke access, delete cases, or remove source artifacts.
- Under JWT bearer auth, packet workflow identity fields (`requestedBy`, `reviewerName`, `finalizedBy`) are bound to the authenticated JWT `sub` instead of trusting caller-supplied strings.
- Under JWT bearer auth, packet review requires `reviewer` or `clinician`, and packet finalization requires `clinician`.

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

- externalized or detached audit signatures;
- external audit export or notarization;
- automated encrypted-store key rotation;
- automated backup scheduling or restore-drill orchestration.

## Known Gaps

1. TLS is expected to be handled by deployment infrastructure rather than by the Node process itself.
2. The API-key path is still shared-secret based and operator-wide; the JWT path now supports HS256, RS256 single-key verification, local JWKS-based `kid` rollover, and issuer-bound remote JWKS refresh, plus owner-scoped case visibility, revocable sharing, subject-bound identity, and route-level role enforcement, but it is not a full tenant/RBAC system with fine-grained permission tiers.
3. There is no central secret manager integration or automated key rotation workflow in this repository. See [crypto-agility-inventory.md](crypto-agility-inventory.md) for the migration plan.
4. The audit trail is append-only in software terms, but not cryptographically sealed.
5. The repository now has a current-state [backup, restore, and key-rotation runbook](backup-restore-and-key-rotation.md), but restore drills, backup scheduling, and encrypted-store key rotation remain manual operator work.
6. Imaging study identifiers and molecular sample metadata are encrypted at rest with the case record, but they are not isolated behind a second compartment or field-level key boundary.
7. The security posture is strong for the current narrow workflow surface, but it is not a claim of regulatory clearance or production security certification.

## Operator Baseline

Minimum recommended deployment posture for the current slice:

1. Set `API_KEY` and keep `ALLOW_INSECURE_DEV_AUTH` unset.
	If an external issuer already exists, prefer `JWT_JWKS_URL` for issuer-bound remote rollover and cache-aware refresh; if you need a purely local verifier artifact with restart-time overlap windows, prefer `JWT_JWKS`; otherwise prefer `JWT_PUBLIC_KEY` over `JWT_SECRET` so the standalone verifies signatures without sharing the issuer's signing secret.
2. Run behind TLS termination.
3. Set `RATE_LIMIT_RPM` to a non-zero value.
4. Set `STORE_PATH` and `ENCRYPTION_KEY` together for durable encrypted storage.
5. Use `EXTERNAL_ATTACHMENT_HOST_ALLOWLIST` if remote attachment fetch is enabled.
6. Monitor `/readyz` and `/metrics` and treat them as operational surfaces, not business APIs.
7. Follow [backup-restore-and-key-rotation.md](backup-restore-and-key-rotation.md) for current backup and recovery procedure instead of improvising file copies or key changes.

## Public Claim Boundary

This posture supports a narrow workflow claim: authenticated, bounded, auditable case-organization software for clinician review.

It does not support claims of clinical decision safety, zero-trust completeness, regulatory approval, or generalized secure health-data platform status.