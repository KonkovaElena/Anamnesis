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
- bounded FHIR Bundle import seam for `document` and `collection` bundles;
- explicit, gated `attachment.url` dereference over `https` for bounded text bundle attachments;
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

Default runtime port: `4020`

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `4020` | HTTP listen port |
| `API_KEY` | No | — | Bearer token for API authentication. When unset, endpoints are unauthenticated for local development. |
| `RATE_LIMIT_RPM` | No | `0` | Maximum requests per minute per IP. Health and readiness probes are exempt. |
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
- [docs/architecture/overview.md](docs/architecture/overview.md)
- [docs/claim-boundary.md](docs/claim-boundary.md)
- [docs/roadmap-and-validation.md](docs/roadmap-and-validation.md)
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

## Claim Boundary

This repository is an organizational workflow system for clinician review.

The generated physician packet is a draft summary, not a diagnosis, treatment plan, prescription, or clinical sign-off.

Future AI or local-model experiments should remain behind explicit adapter seams, evaluation packs, and updated evidence gates before they affect public scope.