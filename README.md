# Anamnesis

Evidence-first clinician-in-the-loop workflow control plane for structured case intake, bounded document and FHIR ingestion, physician-packet drafting, explicit review and finalization, and append-only auditability.

This repository is intentionally not an AI doctor, clinical decision engine, or general-purpose FHIR server. Its public scope is workflow support for clinician review, with claims kept narrower than the code, tests, and evidence currently support.

## Why This Repository Exists

Anamnesis is designed as a narrow standalone slice for healthcare-adjacent workflow software. The project favors verifiable scope, explicit interoperability boundaries, and auditable state transitions over speculative medical or AI claims. In practice, that means the repository optimizes for truthful workflow assistance rather than diagnosis, treatment, triage, prescription logic, or inflated clinical positioning.

## What Is Implemented Today

- structured case intake and case lifecycle APIs;
- workflow-family-aware case creation for general intake, MRI second-opinion, and mRNA board-review paths;
- owner-scoped visibility for JWT-created cases, with API-key operator access retained as the shared-secret admin path;
- source artifact registration and removal with packet staleness tracking;
- derived artifact metadata carry-through plus a read-only evidence-lineage graph route for lineage-aware evidence bundles;
- molecular sample registration for case-scoped review workflows;
- imaging study-context attachment and QC-summary recording for second-opinion workflows;
- bounded text document ingestion for `text/plain` and `text/markdown`;
- bounded FHIR-compatible import for inline `Binary` and `DocumentReference` resources carrying `text/plain` or `text/markdown` payloads;
- bounded FHIR Bundle import for `document` and `collection` bundles, with `document` bundles requiring a `Composition` first entry plus `identifier.system`, `identifier.value`, and `timestamp`;
- explicit, request-gated `attachment.url` dereference over `https` with public-target validation, redirect rejection, text-only response filtering, byte limits, and optional host allowlisting;
- physician packet drafting from current case state;
- explicit clinician review ledger (`approved`, `changes_requested`, `rejected`);
- packet finalization only for clinician-approved, non-stale drafts;
- append-only audit trail and operations summary;
- Bearer-token authentication, rate limiting, security headers, and graceful shutdown;
- durable SQLite persistence with AES-256-GCM encryption at rest.

## What This Repository Explicitly Does Not Claim

- medical diagnosis;
- triage urgency scoring;
- treatment or prescription recommendations;
- clinical validation or regulatory clearance;
- general-purpose FHIR REST server behavior;
- SMART on FHIR authorization flows;
- imaging pixel-data ingestion, genomics file-transport pipelines, wearable ingestion, or OCR pipelines;
- EHR replacement.

## Architecture At A Glance

Anamnesis adopts a reduced architectural kernel extracted from the broader MicroPhoenix platform, but only where the pattern improves clarity without inflating runtime complexity.

| Layer | Responsibility in this slice |
|---|---|
| Core | IDs, correlation, audit-event envelope, normalization-profile primitives |
| Domain | Case workflow, artifact model, bounded import parsing, physician packet and review rules |
| Application | HTTP routes, request validation, auth, rate limiting, metrics, error mapping |
| Infrastructure | SQLite stores, AES-256-GCM encryption, audit persistence, bounded external attachment fetch |
| Runtime chain | `src/index.ts` -> `src/bootstrap.ts` -> `src/application/create-app.ts` |

Key transfer principles from MicroPhoenix:

- one explicit composition root and one runtime chain;
- code, tests, docs, and evidence move together before a capability is promoted as real;
- adapters and bounded seams come before heavier platform machinery;
- public claims remain downstream of verified evidence, not upstream of ambition.

## Interoperability Boundary

FHIR support exists only as a bounded import seam into workflow artifacts. The repository does not expose generic FHIR CRUD, search, transactions, history, subscriptions, messaging, or `/metadata` capability discovery.

Supported now:

- inline `Binary` with `text/plain` or `text/markdown` payloads;
- inline `DocumentReference.content.attachment.data` with `text/plain` or `text/markdown` payloads;
- `Bundle.type=document` and `Bundle.type=collection` when entries remain inside the supported slice;
- `document` bundles only when the bundle carries the standard document envelope used in this repository;
- remote `attachment.url` dereference only through an explicit, opt-in, bounded, `https`-only path.

## Security Posture

The current security baseline is intentionally modest but explicit:

- secure-by-default bearer authentication on application routes;
- explicit development-only unauthenticated override, blocked in production;
- per-IP sliding-window rate limiting;
- Helmet-based header hardening;
- encrypted durable case storage when `STORE_PATH` and `ENCRYPTION_KEY` are configured;
- append-only audit history for write flows;
- SSRF-aware remote attachment controls for the highest-risk interoperability path.

Current non-claims remain important:

- no full tenant RBAC model, delegated case-sharing workflow, or fine-grained per-field access policy;
- no cryptographically sealed audit log;
- no automated encrypted-store key rotation, restore-drill orchestration, or disaster-recovery automation;
- TLS is expected to be handled by deployment infrastructure, not by the Node process itself.

## Evidence And Documentation Model

This repository is organized so that public language can be checked against implementation and tests rather than inferred from aspiration.

Primary authority surfaces:

- [design.md](design.md)
- [docs/design-refresh-2026-04-03.md](docs/design-refresh-2026-04-03.md)
- [docs/architecture/overview.md](docs/architecture/overview.md)
- [docs/api-scope.md](docs/api-scope.md)
- [docs/claim-boundary.md](docs/claim-boundary.md)
- [docs/interop/README.md](docs/interop/README.md)
- [docs/traceability-matrix.md](docs/traceability-matrix.md)
- [docs/security/posture-and-gaps.md](docs/security/posture-and-gaps.md)
- [docs/security/backup-restore-and-key-rotation.md](docs/security/backup-restore-and-key-rotation.md)
- [docs/academic/evidence-register.md](docs/academic/evidence-register.md)
- [openapi.yaml](openapi.yaml)

The shortest claim-to-code-to-test route is [docs/traceability-matrix.md](docs/traceability-matrix.md).

## Positioning In The Adjacent OSS Landscape

Adjacent open-source projects in this space tend to cluster around two patterns:

- local-first intake assistants centered on patient-side data capture and printable summaries;
- AI summarization MVPs centered on conservative note generation while disclaiming diagnosis and treatment.

Anamnesis is positioned differently. It is a server-side, evidence-governed workflow control plane: narrower than a digital front door, less speculative than a generic medical AI demo, and more explicit about interoperability, auditability, and claim boundaries than many adjacent prototypes.

## Technology Baseline (April 2026)

| Technology | Version | Role |
|---|---|---|
| Node.js | `>=24` | Runtime |
| TypeScript | `^6.0.2` | Type system and compiler |
| Express | `^5.2.1` | HTTP framework |
| Helmet | `^8.1.0` | Security headers |
| Zod | `^4.3.6` | Request validation and runtime schemas |
| better-sqlite3 | `^12.8.0` | Durable persistence |
| node:test | built-in | Test runner |

## Quick Start

Use `.env.example` as the baseline runtime contract.

```bash
npm install
npm run validate:public-export
npm run dev
```

Set one of `API_KEY`, `JWT_SECRET`, or `JWT_PUBLIC_KEY` before starting the server unless `ALLOW_INSECURE_DEV_AUTH=true` is explicitly enabled for local development.

Default runtime port: `4020`

## Validation

Publication-grade local verification:

```bash
npm run validate:public-export
```

This expands to:

```bash
npm run lint
npm run test:coverage
npm run build
npm run audit:prod
```

Operational probes:

- `GET /healthz`
- `GET /readyz`
- `GET /metrics`

## Deployment Notes

- `/metrics` remains unauthenticated like `/healthz` and `/readyz`, so monitoring access should sit behind separate network controls when exposure beyond the local trust boundary is possible.
- If you enable `RATE_LIMIT_RPM` behind a reverse proxy or load balancer, configure Express proxy trust for the deployment topology before relying on `request.ip` for enforcement.

## Docker

A multi-stage Dockerfile is included. Build and run:

```bash
docker build -t anamnesis .
docker run -p 4020:4020 \
  -e API_KEY=your-secret-key \
  -e STORE_PATH=/data/anamnesis.db \
  -e ENCRYPTION_KEY=$(openssl rand -hex 32) \
  -v anamnesis-data:/data \
  anamnesis
```

The image uses Node 24 Alpine, runs as a non-root user, and includes a built-in health check against `/healthz`.

## Environment Contract

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `4020` | HTTP listen port |
| `API_KEY` | One auth mechanism is required unless explicit local-dev override is enabled | — | Opaque bearer token for application endpoints |
| `JWT_SECRET` | No | — | HS256 verifier secret for JWT bearer authentication; mutually exclusive with `JWT_PUBLIC_KEY` |
| `JWT_PUBLIC_KEY` | No | — | PEM-encoded RSA public key for RS256 JWT verification; mutually exclusive with `JWT_SECRET` |
| `JWT_ISSUER` | No | — | Optional JWT issuer constraint |
| `JWT_AUDIENCE` | No | — | Optional JWT audience constraint |
| `JWT_TYP` | No | — | Optional JOSE `typ` value that JWTs must match |
| `ALLOW_INSECURE_DEV_AUTH` | No | `false` | Explicit local-development override that allows startup without `API_KEY`, `JWT_SECRET`, or `JWT_PUBLIC_KEY`; rejected when `NODE_ENV=production` |
| `RATE_LIMIT_RPM` | No | `0` | Maximum requests per minute per IP; health and readiness probes are exempt |
| `EXTERNAL_ATTACHMENT_HOST_ALLOWLIST` | No | — | Optional comma-separated hostname allowlist for external FHIR bundle attachment fetches |
| `STORE_PATH` | No | — | Path to SQLite database file; when unset, data is stored in memory only |
| `ENCRYPTION_KEY` | When `STORE_PATH` is set | — | 64-character hex string used for AES-256-GCM encryption at rest |

Current operational guidance for backup, restore, and key handling lives in [docs/security/backup-restore-and-key-rotation.md](docs/security/backup-restore-and-key-rotation.md).

## API Surface

- `POST /api/cases`
- `GET /api/cases`
- `GET /api/cases/:caseId`
- `DELETE /api/cases/:caseId`
- `POST /api/cases/:caseId/artifacts`
- `DELETE /api/cases/:caseId/artifacts/:artifactId`
- `GET /api/cases/:caseId/evidence-lineage`
- `POST /api/cases/:caseId/samples`
- `POST /api/cases/:caseId/study-context`
- `POST /api/cases/:caseId/qc-summary`
- `POST /api/cases/:caseId/document-ingestions`
- `POST /api/cases/:caseId/fhir-imports`
- `POST /api/cases/:caseId/fhir-bundle-imports`
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

Machine-readable contract: [openapi.yaml](openapi.yaml)

## Repository Trust Surfaces

- [README.md](README.md)
- [openapi.yaml](openapi.yaml)
- [docs/claim-boundary.md](docs/claim-boundary.md)
- [docs/traceability-matrix.md](docs/traceability-matrix.md)
- [docs/security/posture-and-gaps.md](docs/security/posture-and-gaps.md)
- [CONTRIBUTING.md](CONTRIBUTING.md)
- [SECURITY.md](SECURITY.md)
- [SUPPORT.md](SUPPORT.md)
- [GOVERNANCE.md](GOVERNANCE.md)
- [CITATION.cff](CITATION.cff)
- [CHANGELOG.md](CHANGELOG.md)

## Governance And Support

- [GOVERNANCE.md](GOVERNANCE.md) defines maintainer rules, evidence requirements, and change-control boundaries.
- [SUPPORT.md](SUPPORT.md) explains support routing and security-reporting boundaries.
- [PUBLISHING.md](PUBLISHING.md) is the public GitHub release checklist and repository-metadata guide.
- [CONTRIBUTING.md](CONTRIBUTING.md) covers contribution flow.
- [SECURITY.md](SECURITY.md) covers security reporting.
- [CITATION.cff](CITATION.cff) provides machine-readable citation metadata.
- `.github/workflows/ci.yml` and `.github/workflows/dependency-review.yml` define the current GitHub validation baseline.

## License

MIT. See [LICENSE](LICENSE).