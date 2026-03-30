---
title: "Personal Doctor API Scope"
status: active
version: "0.2.0"
last_updated: "2026-03-30"
tags: [personal-doctor, healthcare, api-scope, reference]
---

# API Scope

## Routes

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

## Boundary Rule

The API is a workflow and packeting surface. It is not a diagnostic API.
