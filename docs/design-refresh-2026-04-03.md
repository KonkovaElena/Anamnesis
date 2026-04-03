---
title: "Anamnesis Design Refresh 2026-04-03"
status: active
version: "1.0.0"
last_updated: "2026-04-03"
tags: [anamnesis, design, explanation, evidence]
---

# Design Refresh Note

## Purpose

Capture the April 3, 2026 design refresh after the standalone publication hardening pass and the first live GitHub post-push audit.

## What Changed In Practice

- the standalone is now treated as a self-contained public repository, not as a parent-monorepo export artifact;
- the publication-grade local verification baseline is `npm run validate:public-export`, not only `npm test` plus `npm run build`;
- the public GitHub workflow baseline is now visible and testable through live repository state rather than only through committed workflow files;
- the first post-push audit established that `CI` and `CodeQL` are healthy on GitHub, while `dependency-review` is correctly installed but currently blocked by repository-side dependency-graph enablement.

## Authority Consequence

The standalone authority set is now best read in this order:

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

## Immediate Follow-Through

The next work items after this refresh are intentionally documentation-led:

- keep the roadmap aligned with `validate:public-export` as the actual local closure rail;
- preserve the GitHub post-push audit as the source of truth for admin-side follow-up actions;
- update entrypoint indexes so readers can find the refresh note without reading commit history.

## Non-Upgrade Rule

This refresh note records a clearer public operating baseline.

It does not authorize broader clinical, interoperability, or AI claims beyond what the current code, tests, and evidence already support.