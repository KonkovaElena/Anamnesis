---
title: "Personal Doctor Claim Boundary"
status: active
version: "0.2.0"
last_updated: "2026-03-30"
tags: [personal-doctor, healthcare, claim-boundary, reference]
---

# Claim Boundary

## Implemented Truth

- the repository stores cases in memory;
- it registers source artifacts;
- it drafts physician packets from currently stored case data;
- it exposes an operational HTTP surface.

## Not Implemented Truth

- medical diagnosis;
- triage verdict generation;
- treatment planning;
- prescription logic;
- clinician sign-off tracking.

## Required Language

Use terms such as "draft", "organizational summary", and "clinician review".

Do not use terms that imply validated clinical output.
