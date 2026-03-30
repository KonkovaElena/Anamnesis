# Personal Doctor

Clinician-in-the-loop personal health control plane bootstrap for the project title "Личный врач".

This repository is not an AI doctor.

It implements a narrow workflow baseline that helps a user organize case intake, supporting artifacts, and a physician-facing packet draft without claiming diagnosis, treatment, or prescription capability.

## Stack (March 2026)

| Technology | Version | Role |
|---|---|---|
| Node.js | >=22 LTS | Runtime |
| TypeScript | 6.0 | Type system & compiler |
| Express | 5.2 | HTTP framework |
| Zod | 4.3 | Runtime input validation |
| node:test | built-in | Test runner |

## Current Scope

- structured case intake;
- source artifact registration;
- physician packet draft generation;
- operations summary;
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

## API Surface

- `POST /api/cases`
- `GET /api/cases`
- `GET /api/cases/:caseId`
- `POST /api/cases/:caseId/artifacts`
- `POST /api/cases/:caseId/physician-packets`
- `GET /api/cases/:caseId/physician-packets`
- `GET /api/operations/summary`
- `GET /healthz`
- `GET /readyz`
- `GET /metrics`

## Current Status Model

- `INTAKING`
- `READY_FOR_PACKET`
- `REVIEW_REQUIRED`

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

## Parent Design Pack

The parent repository keeps the design and evidence pack in `docs/superpowers/specs/2026-03-30-personal-doctor-*.md`.

## Claim Boundary

This repository is not a medical decision engine. The generated physician packet is a draft summary for clinician review. No route returns a diagnosis or treatment recommendation.

## Runtime Note

The current package uses an in-memory store by default. That is intentional for the first standalone slice. Durable persistence, consent storage, review ledgers, and external document ingestion remain future hardening steps.

## Security Posture

**HTTPS is mandatory for any deployment beyond localhost.** The application handles health-related data. Never expose this service over plaintext HTTP in any network-reachable environment. Use a reverse proxy (nginx, Caddy, cloud LB) to terminate TLS.

The server applies the following hardening defaults:

- `requestTimeout`: 30 s
- `headersTimeout`: 40 s
- Generic 500 error responses (raw messages are logged server-side, not returned to clients)
- `x-request-id` propagation for correlation tracking

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4020` | HTTP listener port |

## March 2026 Migration Notes

### Express 5.2

Express 5 catches rejected promises in async route handlers automatically. The `asyncHandler` wrapper used with Express 4 has been removed. Error middleware still uses the 4-parameter `(err, req, res, next)` signature per Express 5 spec.

### TypeScript 6.0

`moduleResolution` set to `"bundler"` (the former `"Node"` value is deprecated in TS 6). Target upgraded to `"es2025"`. `strict: true` is now the compiler default.