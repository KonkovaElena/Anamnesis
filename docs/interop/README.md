---
title: "Anamnesis Interoperability Boundary"
status: active
version: "1.0.0"
last_updated: "2026-04-03"
tags: [anamnesis, interop, fhir, reference]
---

# Interoperability Boundary

## Purpose

Document the exact FHIR-related compatibility surface implemented by the current standalone slice.

This page is intentionally narrower than a generic FHIR conformance statement because the repository does not expose a general-purpose FHIR REST API.

## Current Shape

Anamnesis supports FHIR only as a bounded import seam into workflow artifacts.

That means:

- incoming payloads are handled through the Anamnesis HTTP API, not through generic FHIR REST endpoints;
- the repository consumes selected resource structures and converts them into source artifacts;
- the output remains organizational workflow state for clinician review, not FHIR resource CRUD.

## Supported Compatibility Matrix

| Surface | Supported now | Boundary |
| --- | --- | --- |
| Inline `Binary` | Yes | `text/plain` and `text/markdown` payloads only |
| Inline `DocumentReference.content.attachment.data` | Yes | `text/plain` and `text/markdown` payloads only |
| `Bundle.type=document` | Yes | Supported `Binary` and `DocumentReference` entries only |
| `Bundle.type=collection` | Yes | Supported `Binary` and `DocumentReference` entries only |
| `DocumentReference.content.attachment.url` | Conditionally | Bundle import only, request opt-in only, `https` only, public-target validation only, bounded text content only |
| Artifact provenance carry-through | Yes | FHIR resource type and bundle-entry provenance are preserved into workflow artifacts |

## Explicitly Not Supported

- FHIR REST server behavior such as `GET [base]/Patient/{id}`;
- `/metadata` capability discovery endpoint;
- transactions, batch processing, history, subscriptions, messaging, or document-exchange protocol behavior;
- profile validation against `StructureDefinition` or `ImplementationGuide` artifacts;
- search parameter execution, `_include`, `_revinclude`, or SMART on FHIR authorization flows;
- non-text document import in the current write path.

## Why This Is Not A CapabilityStatement Endpoint

FHIR `CapabilityStatement` is the standard self-description surface for actual FHIR server or client capabilities.

The current standalone does not expose a FHIR REST endpoint and therefore should not pretend to be a generic FHIR server by publishing a `/metadata` route.

The safer truth is this compatibility matrix plus the bounded import contract in [../api-scope.md](../api-scope.md) and [../../openapi.yaml](../../openapi.yaml).

## Promotion Rule

Do not widen interoperability claims until all of the following move together:

1. code implementing the new FHIR surface;
2. tests and fixtures covering the new surface;
3. contract documentation describing the new surface;
4. claim-boundary updates proving that the language still stays honest.

## Related Surfaces

- [../claim-boundary.md](../claim-boundary.md)
- [../api-scope.md](../api-scope.md)
- [../traceability-matrix.md](../traceability-matrix.md)
- [../../openapi.yaml](../../openapi.yaml)