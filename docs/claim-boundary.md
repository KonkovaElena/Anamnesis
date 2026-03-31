---
title: "Personal Doctor Claim Boundary"
status: active
version: "0.5.0"
last_updated: "2026-04-01"
tags: [personal-doctor, healthcare, claim-boundary, reference]
---

# Claim Boundary

## Implemented Truth

- the repository stores cases in SQLite with AES-256-GCM encryption at rest (or in memory when no store path is configured);
- it registers source artifacts (with future-date rejection);
- it supports artifact and case deletion;
- it drafts physician packets from currently stored case data;
- it exposes an operational HTTP surface;
- it enforces Bearer-token authentication;
- it applies per-IP sliding-window rate limiting;
- it sets security headers via Helmet (CSP, HSTS, COOP, CORP, Referrer-Policy);
- it performs graceful HTTP shutdown with connection draining.

## Not Implemented Truth

- medical diagnosis;
- triage verdict generation;
- treatment planning;
- prescription logic;
- clinician sign-off tracking.

## Required Language

Use terms such as "draft", "organizational summary", and "clinician review".

Do not use terms that imply validated clinical output.
