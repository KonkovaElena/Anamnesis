---
title: "Personal Doctor Scope Lock"
status: active
version: "0.5.0"
last_updated: "2026-04-01"
tags: [personal-doctor, healthcare, scope-lock, reference]
---

# Scope Lock

## Included Now

- structured intake capture;
- source artifact registration (with future-date rejection);
- artifact and case deletion;
- physician packet draft generation;
- operations summary;
- health, readiness, and metrics surfaces;
- Bearer-token authentication;
- per-IP sliding-window rate limiting;
- security headers via Helmet (CSP, HSTS, COOP, CORP, etc.);
- graceful HTTP shutdown with connection draining;
- durable SQLite persistence with AES-256-GCM encryption at rest.

## Excluded Now

- autonomous diagnosis;
- treatment or prescription guidance;
- imaging interpretation;
- genomics or wearable processing;
- regulatory or clinical validation claims.

## Extension Rule

New capability claims should move into active docs only after matching code and tests exist in this standalone.
