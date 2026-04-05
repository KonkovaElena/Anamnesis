# Anamnesis

Clinician-in-the-loop personal health control plane bootstrap for Anamnesis.

This repository is not an AI doctor.

It implements a narrow workflow baseline that helps a user organize case intake, supporting artifacts, and a physician-facing packet draft without claiming diagnosis, treatment, or prescription capability.

## Public Repository Status

- The repository is self-contained and no longer depends on a parent-monorepo export workflow.
- Claim-boundary, roadmap, evidence, and investor diligence materials live in dedicated local docs rather than migration notes.
- The April 3, 2026 documentation refresh synchronizes the public docs set with the current codebase, current official standards references, and current research-derived controls.
- Declared runtime dependencies currently track: Express `^5.2.1`, Helmet `^8.1.0`, Zod `^4.3.6`, better-sqlite3 `^12.8.0`, tsx `^4.21.0`, and TypeScript `^6.0.2`.

## Stack (April 2026 Baseline)

| Technology | Version | Role |
|---|---|---|
| Node.js | `>=24` | Runtime |
| TypeScript | `^6.0.2` | Type system and compiler |
| Express | `^5.2.1` | HTTP framework |
| Helmet | `^8.1.0` | Security headers |
| Zod | `^4.3.6` | Input validation |
| better-sqlite3 | `^12.8.0` | Durable SQLite persistence |
| node:test | built-in | Test runner |

## Current Scope

- structured case intake;
- source artifact registration with future-date rejection;
- bounded text document ingestion (`text/plain`, `text/markdown`) into source artifacts;
- bounded FHIR-compatible import seams for inline `Binary` and `DocumentReference` resources carrying `text/plain` or `text/markdown` payloads;
- bounded FHIR Bundle import seam for `document` and `collection` bundles, with `document` bundles requiring the standard document envelope (`Composition` first entry, `identifier.system`, `identifier.value`, and `timestamp`);
- explicit, gated `attachment.url` dereference over `https` for bounded text bundle attachments that resolve only to public addresses, with optional host allowlisting;
- artifact and case deletion;
- physician packet draft generation;
- explicit clinician review ledger (`approved`, `changes_requested`, `rejected`);
- physician packet finalization after clinician approval;
- append-only per-case audit trail;
- operations summary;
- Bearer-token authentication (`API_KEY`);
- per-IP sliding-window rate limiting (`RATE_LIMIT_RPM`);
- security headers via Helmet;
- graceful HTTP shutdown with connection draining;
- durable SQLite persistence with AES-256-GCM encryption at rest;
- `GET /healthz`, `GET /readyz`, and `GET /metrics`.

## Non-Goals In This Slice

- autonomous diagnosis or triage verdicts;
- medication or treatment advice;
- clinical validation claims;
- imaging, genomics, or wearable processing pipelines;
- general-purpose FHIR server behavior;
- EHR replacement.

## Quickstart

Use `.env.example` as the baseline runtime contract.

```bash
npm install
npm test
npm run build
npm run dev
```

Set either `API_KEY` or `ALLOW_INSECURE_DEV_AUTH=true` before starting the server.

Default runtime port: `4020`

## Deployment Notes

- `/metrics` is treated as an operational endpoint. It remains unauthenticated like `/healthz` and `/readyz`, so monitoring access should sit behind separate network controls when exposure beyond the local trust boundary is possible.
- If you enable `RATE_LIMIT_RPM` behind a reverse proxy or load balancer, configure Express proxy trust for the deployment topology before relying on `request.ip` for enforcement.

## Validation

For a publication-grade local verification pass:

```bash
npm run validate:public-export
```

If you want the individual steps instead of the aggregate script:

```bash
npm run lint
npm run test:coverage
npm run build
npm run audit:prod
```

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `4020` | HTTP listen port |
| `API_KEY` | Yes unless explicit local-dev override is enabled | — | Bearer token for API authentication on application endpoints. |
| `ALLOW_INSECURE_DEV_AUTH` | No | `false` | Explicit local-development override that allows startup without `API_KEY`. Rejected when `NODE_ENV=production`. |
| `RATE_LIMIT_RPM` | No | `0` | Maximum requests per minute per IP. Health and readiness probes are exempt. |
| `EXTERNAL_ATTACHMENT_HOST_ALLOWLIST` | No | — | Optional comma-separated hostname allowlist for external FHIR bundle attachment fetches. When set, only listed hosts are eligible in addition to the public-address checks. |
| `STORE_PATH` | No | — | Path to SQLite database file. When unset, data is stored in memory only. |
| `ENCRYPTION_KEY` | When `STORE_PATH` is set | — | 64-character hex string used for AES-256-GCM encryption at rest. |

## API Surface

- `POST /api/cases`
- `GET /api/cases`
- `GET /api/cases/:caseId`
- `POST /api/cases/:caseId/artifacts`
- `POST /api/cases/:caseId/document-ingestions`
- `POST /api/cases/:caseId/fhir-imports`
- `POST /api/cases/:caseId/fhir-bundle-imports`
- `DELETE /api/cases/:caseId/artifacts/:artifactId`
- `POST /api/cases/:caseId/physician-packets`
- `GET /api/cases/:caseId/physician-packets`
- `POST /api/cases/:caseId/physician-packets/:packetId/reviews`
- `GET /api/cases/:caseId/physician-packets/:packetId/reviews`
- `POST /api/cases/:caseId/physician-packets/:packetId/finalize`
- `GET /api/cases/:caseId/audit-events`
- `GET /api/operations/summary`
- `GET /healthz`
- `GET /readyz`
- `GET /metrics`

OpenAPI description: [openapi.yaml](openapi.yaml)

## Documentation

- [design.md](design.md)
- [docs/README.md](docs/README.md)
- [docs/design-refresh-2026-04-03.md](docs/design-refresh-2026-04-03.md)
- [docs/api-scope.md](docs/api-scope.md)
- [docs/architecture/overview.md](docs/architecture/overview.md)
- [docs/claim-boundary.md](docs/claim-boundary.md)
- [docs/interop/README.md](docs/interop/README.md)
- [docs/roadmap-and-validation.md](docs/roadmap-and-validation.md)
- [docs/traceability-matrix.md](docs/traceability-matrix.md)
- [docs/security/posture-and-gaps.md](docs/security/posture-and-gaps.md)
- [docs/academic/evidence-register.md](docs/academic/evidence-register.md)
- [docs/regulatory/positioning.md](docs/regulatory/positioning.md)
- [docs/investor/README.md](docs/investor/README.md)

## Governance And Support

- [GOVERNANCE.md](GOVERNANCE.md) defines maintainer rules, evidence requirements, and change-control boundaries.
- [SUPPORT.md](SUPPORT.md) explains support routing and security-reporting boundaries.
- [PUBLISHING.md](PUBLISHING.md) is the public GitHub release checklist.
- [CONTRIBUTING.md](CONTRIBUTING.md) covers contribution flow.
- [SECURITY.md](SECURITY.md) covers security reporting.
- [CITATION.cff](CITATION.cff) provides machine-readable citation metadata.
- `.github/workflows/ci.yml` and `.github/workflows/dependency-review.yml` define the current GitHub validation baseline.

## Claim Boundary

This repository is an organizational workflow system for clinician review.

The generated physician packet is a draft summary, not a diagnosis, treatment plan, prescription, or clinical sign-off.

Future AI or local-model experiments should remain behind explicit adapter seams, evaluation packs, and updated evidence gates before they affect public scope.