---
title: "Personal Doctor API Scope"
status: active
version: "0.7.0"
last_updated: "2026-03-31"
tags: [personal-doctor, healthcare, api-scope, reference]
---

# API Scope

## Routes

- `POST /api/cases`
- `GET /api/cases`
- `GET /api/cases/:caseId`
- `POST /api/cases/:caseId/artifacts`
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

## Authentication

When `API_KEY` is set, all `/api/*` routes require `Authorization: Bearer <key>`. Health, readiness, and metrics probes are exempt.

## Rate Limiting

When `RATE_LIMIT_RPM` is set to a positive integer, per-IP sliding-window rate limiting is applied. Health and readiness probes are exempt.

## Boundary Rule

The API is a workflow and packeting surface. It is not a diagnostic API.
