---
title: "Anamnesis Regulatory Positioning"
status: active
version: "1.0.0"
last_updated: "2026-04-01"
tags: [anamnesis, healthcare, regulatory, explanation]
---

# Regulatory Positioning

## Current Position

The standalone is intentionally framed as a clinician-in-the-loop workflow baseline.

## Why That Matters

- medical software claims become regulatory and evidence questions quickly;
- human oversight and traceability reduce early claim risk;
- narrow scope keeps the repository honest while the product shape is still forming.

## Regulatory Landscape (March 2026)

- FDA maintains an AI-Enabled Medical Device list (current as of 03/04/2026, 29 pages). The list catalogs AI/ML-enabled devices that have received marketing authorization. The project's "clinician-in-the-loop" and "no diagnosis/treatment" positioning aligns with the FDA's human-oversight requirement.
- EU MDR 2017/745 classifies clinical decision support software under Class IIa or higher. The project explicitly disclaims clinical decision support output.
- Bearer-token authentication and per-IP rate limiting serve as defense-in-depth security controls appropriate for a pre-production health data surface.

## Current Rule

Do not describe the project as an autonomous doctor, diagnostic engine, or validated clinical system.

Bounded FHIR Bundle ingestion and gated remote attachment fetch do not change that rule: they extend workflow intake only and still produce draft organizational artifacts for clinician review.
