# Anamnesis

Clinician-in-the-loop personal health control plane bootstrap for Anamnesis.

This repository is not an AI doctor.

It implements a narrow workflow baseline that helps a user organize case intake, supporting artifacts, and a physician-facing packet draft without claiming diagnosis, treatment, or prescription capability.

## Stack (March 2026)

| Technology | Version | Role |
|---|---|---|
| Node.js | >=24 LTS | Runtime |
| TypeScript | 6.0 | Type system & compiler |
| Express | 5.2 | HTTP framework |
| Zod | 4.3 | Runtime input validation |
| better-sqlite3 | 12.x | Durable SQLite persistence |
| node:test | built-in | Test runner |

## Current Scope

- structured case intake;
- source artifact registration (with future-date rejection);
- bounded text document ingestion (`text/plain`, `text/markdown`) into source artifacts;
- bounded FHIR-compatible import seam for inline `Binary` and `DocumentReference` resources carrying `text/plain` or `text/markdown` payloads into source artifacts;
- bounded FHIR Bundle import seam for `document` or `collection` bundles that extract supported `Binary` and `DocumentReference` entries into source artifacts;
- explicit, gated `attachment.url` dereference over `https` for `text/plain` and `text/markdown` bundle attachments;
- artifact and case deletion;
- physician packet draft generation;
- explicit clinician review ledger (approved / changes_requested / rejected);
- physician packet finalization after clinician approval;
- append-only per-case audit trail;
- operations summary;
- Bearer-token authentication (`API_KEY`);
- per-IP sliding-window rate limiting (`RATE_LIMIT_RPM`);
- security headers via Helmet (CSP, HSTS, COOP, CORP, Referrer-Policy, etc.);
- graceful HTTP shutdown with connection draining;
- durable SQLite persistence with AES-256-GCM encryption at rest;
- `GET /healthz`, `GET /readyz`, and `GET /metrics`.

## Non-Goals In This Slice

- autonomous diagnosis or triage verdicts;
- medication or treatment advice;
- clinical validation claims;
- imaging, genomics, or wearable processing pipelines;
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

## Contributing And Support

- Contribution guidelines: [CONTRIBUTING.md](CONTRIBUTING.md)
- Code of conduct: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- Security reporting: [SECURITY.md](SECURITY.md)
- Citation metadata: [CITATION.cff](CITATION.cff)
- Release history: [CHANGELOG.md](CHANGELOG.md)
- GitHub publication checklist: [PUBLISHING.md](PUBLISHING.md)

For bug reports, feature requests, and usage questions, use the repository issue forms after the project is published to GitHub.

## Citation

This repository ships with `CITATION.cff` so GitHub can render machine-readable software citation metadata.

If you use Anamnesis in research, evaluation, or clinician-workflow studies, cite the versioned software artifact rather than mentioning the repository only in prose.

For long-lived scholarly citation, archive a tagged release through Zenodo or another DOI-minting archive and then backfill the DOI into `CITATION.cff`.

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `4020` | HTTP listen port |
| `API_KEY` | No | — | Bearer token for API authentication. When unset, all endpoints are unauthenticated (dev mode). |
| `RATE_LIMIT_RPM` | No | `0` (disabled) | Maximum requests per minute per IP. Health and readiness probes are exempt. |
| `STORE_PATH` | No | — | Path to SQLite database file (e.g. `./data/anamnesis.db`). When unset, data is stored in memory only. |
| `ENCRYPTION_KEY` | When `STORE_PATH` is set | — | 64-character hex string (256-bit AES key). Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

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
- `DELETE /api/cases/:caseId`
- `GET /api/operations/summary`
- `GET /healthz`
- `GET /readyz`
- `GET /metrics`

## Current Status Model

### Case Status

- `INTAKING`
- `READY_FOR_PACKET`
- `REVIEW_REQUIRED`

### Physician Packet Status

- `DRAFT_REVIEW_REQUIRED`
- `CLINICIAN_APPROVED`
- `CHANGES_REQUESTED`
- `REJECTED`
- `FINALIZED`

The status model is intentionally narrow and never implies medical finality.

## Internal Docs

1. `docs/architecture/overview.md`
2. `docs/scope-lock.md`
3. `docs/claim-boundary.md`
4. `docs/status-model.md`
5. `docs/api-scope.md`
6. `docs/academic/evidence-register.md`
7. `docs/regulatory/positioning.md`
8. `docs/roadmap-and-validation.md`

## Local Design Pack

This standalone repository keeps its design, scope, and evidence surfaces locally.

The current documentation set is a normalized April 1, 2026 snapshot prepared so the project can move independently from the parent monorepo.

## Claim Boundary

This repository is not a medical decision engine. The generated physician packet is a draft summary for clinician review. No route returns a diagnosis or treatment recommendation.

## March 2026 Migration Notes

### Express 5.2

Express 5 catches rejected promises in async route handlers automatically. The `asyncHandler` wrapper used with Express 4 has been removed. Error middleware still uses the 4-parameter `(err, req, res, next)` signature per Express 5 spec.

### Helmet 8

Replaces manual `X-Content-Type-Options` / `X-Frame-Options` / `Cache-Control` headers with the full Helmet suite (11 headers). `Cache-Control: no-store` is retained as a separate middleware because Helmet does not set it for non-static routes.

### Node.js 24

Node.js 22 "Jod" entered Maintenance LTS (EOL March 2026). The engine requirement has been bumped to `>=24` (Active LTS "Krypton", v24.14.1).

### TypeScript 6.0

`module` set to `"node20"` and `target` set to `"es2022"` (the former `"Node"` module resolution value is deprecated in TS 6). `strict: true` is now the compiler default.

## Security Posture

**HTTPS is mandatory for any deployment beyond localhost.** The application handles health-related data. Never expose this service over plaintext HTTP in any network-reachable environment. Use a reverse proxy (nginx, Caddy, cloud LB) to terminate TLS.

The server applies the following hardening defaults:

- Security headers via [Helmet](https://helmetjs.github.io/) (Content-Security-Policy, Strict-Transport-Security, Cross-Origin-Opener-Policy, Cross-Origin-Resource-Policy, Referrer-Policy, X-Content-Type-Options, X-Frame-Options, etc.)
- `Cache-Control: no-store` to prevent caching of health-related data
- `requestTimeout`: 30 s
- `headersTimeout`: 40 s
- Generic 500 error responses (raw messages are logged server-side, not returned to clients)
- `x-request-id` propagation for correlation tracking
- Request logging (`method path status duration`) on stdout

## Known Limitations

- **No PII encryption at transit.** HTTPS must be enforced at the reverse-proxy layer for any deployment beyond localhost.
- **No multipart upload or OCR pipeline.** The document-ingestion seam is intentionally bounded to JSON requests that normalize `text/plain` and `text/markdown` content into source artifacts.
- **No general-purpose FHIR server behavior.** The FHIR import seams are intentionally bounded to `POST /api/cases/:caseId/fhir-imports` for single inline resources and `POST /api/cases/:caseId/fhir-bundle-imports` for `document` or `collection` bundles. Transaction semantics, generic resource import, non-text media extraction, and ungated external dereference remain out of scope.