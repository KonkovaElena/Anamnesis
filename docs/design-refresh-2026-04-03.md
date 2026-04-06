---
title: "Anamnesis Design Refresh Note"
status: active
version: "1.1.0"
last_updated: "2026-04-06"
tags: [anamnesis, design, explanation, evidence]
---

# Design Refresh Note

## Purpose

Capture the cumulative April 2026 design refresh after standalone publication hardening, the first live GitHub post-push audit, and the April 5 hyper-deep review of interoperability, security posture, and claim discipline.

## What Changed In Practice

- the standalone is now treated as a self-contained public repository, not as a parent-monorepo export artifact;
- the publication-grade local verification baseline is `npm run validate:public-export`, not only `npm test` plus `npm run build`;
- the public GitHub workflow baseline is now visible and testable through live repository state rather than only through committed workflow files;
- the first post-push audit established that `CI` and `CodeQL` are healthy on GitHub, while `dependency-review` is correctly installed but currently blocked by repository-side dependency-graph enablement;
- the April 5 review kept the core thesis intact: Anamnesis is strongest as a narrow clinician-in-the-loop workflow control plane, not as a diagnosis engine or generic health-data platform;
- the bounded FHIR document-bundle seam is now stricter, but that improvement still does not justify generic FHIR conformance language or server-style capability claims;
- the highest-priority remaining gaps are identity granularity beyond a shared bearer secret, stronger audit integrity and confidentiality posture, and the absence of an explicit backup, restore, and key-rotation operating model;
- the `/metrics` probe must stay documented as an intentional unauthenticated operational surface; treating it as a hidden auth bypass would be a documentation error, not a product-scope upgrade.

## Authority Consequence

The standalone authority set should now be read as a cumulative April 2026 stack in this order:

1. `design.md`
2. `docs/design-refresh-2026-04-03.md`
3. `docs/roadmap-and-validation.md`
4. `docs/academic/evidence-register.md`
5. `docs/claim-boundary.md`

For live GitHub publication state, pair the design surfaces above with:

- `docs/investor/GITHUB_POST_PUSH_CHECK_2026_04_03.md`

That separation matters:

- `design.md` states the product shape;
- this note records the April 3 refresh delta;
- the roadmap controls future promotion;
- the evidence register controls provenance;
- the GitHub post-push check records repository-operations facts that are visible only after publication.

## Risk-Grading Nuance

The April 5 review sharpened three distinctions that should remain explicit in future docs and public language:

1. `/metrics` is intentionally unauthenticated like `/healthz` and `/readyz`, but it is still an operational surface that should sit behind separate network controls when exposure widens.
2. Document-bundle envelope validation improves bounded HL7 alignment, but the standalone still lacks `CapabilityStatement`, server discovery, and profile publication surfaces, so generic FHIR conformance language remains out of scope.
3. Append-only audit history is valuable workflow evidence, but without cryptographic sealing, external notarization, or a stronger retention model it should not be described as tamper-evident security infrastructure.

## Design Implications

### 1. Repository Operations Are Part Of The Product Boundary

For a public standalone, branch protection, dependency review, code scanning, private vulnerability reporting, and repository metadata are not cosmetic extras. They are part of the operator-facing trust boundary around the software.

That does not mean GitHub settings are product features. It means the standalone should document which protections are implemented in code, which are enforced by repository operations, and which still require maintainer-side activation.

### 2. Workflow YAML Is Not The Same As A Live Security Gate

The April 3 post-push audit confirmed a useful distinction:

- committed workflow files prove intent;
- live GitHub workflow runs prove activation;
- admin-scoped repository settings still decide whether some of those workflows can actually enforce policy.

In this case, `dependency-review` is present and active, but it cannot pass until dependency graph is enabled in GitHub settings.

### 3. Scope Discipline Still Wins Over Tooling Surface Area

The repository now has stronger public governance surfaces, but that is not a scope upgrade.

The product remains a clinician-in-the-loop workflow system with bounded intake, bounded text and FHIR ingestion, packet drafting, clinician review, finalization, and auditability.

Neither GitHub hardening nor future model experimentation widens that claim boundary by itself.

### 4. Security Posture Must Stay Split Between Implemented Baseline And Real Gaps

The April 5 review confirms that some security concerns are true backlog items while others are wording hazards.

- true backlog items: RBAC or stronger identity partitioning, key rotation, backup and restore, and stronger audit integrity controls;
- wording hazards: calling the current bundle seam "FHIR conformance", or calling the current append-only audit trail "tamper-proof";
- operator tradeoffs: keeping `/metrics` unauthenticated while relying on deployment-side network controls.

## Immediate Follow-Through

The next work items after this refresh are intentionally documentation-led:

- keep the roadmap aligned with `validate:public-export` as the actual local closure rail;
- preserve the GitHub post-push audit as the source of truth for admin-side follow-up actions;
- fold the April 5 external standards and security review into the evidence register rather than scattering those claims into README prose;
- update entrypoint indexes so readers can find the refresh note without reading commit history.

## Non-Upgrade Rule

This refresh note records a clearer public operating baseline.

It does not authorize broader clinical, interoperability, or AI claims beyond what the current code, tests, and evidence already support.