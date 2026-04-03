# GitHub Post-Push Check

Date: 2026-04-03

## Goal

Record the live GitHub state after pushing commit `e5d04fc` and separate what was verified remotely from what still requires repository-admin settings access.

## Evidence Basis

- Public GitHub REST metadata for `KonkovaElena/Anamnesis`.
- Public GitHub REST workflow registration and workflow-run status for `main` and open pull requests.
- Public GitHub REST commit metadata for `main`.
- Public check-run annotations for the failing `dependency-review` pull-request run on PR `#1`.
- Current GitHub REST documentation for branch protection, dependency review, dependency alerts, private vulnerability reporting, automated security fixes, and secret scanning.

## Verified Remote State

### 1. Published Repository Presence

- Repository URL: `https://github.com/KonkovaElena/Anamnesis`
- Visibility: public.
- Default branch: `main`.
- Live `main` head: `e5d04fc1b239af3ec9fa4f119fc2d3f1cbce435a`.
- Live head commit message: `Harden standalone publication and verification baseline`.

### 2. Published Entry Surfaces

The GitHub contents API shows the intended public entry surfaces on `main`, including:

- `README.md`
- `CHANGELOG.md`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `SUPPORT.md`
- `GOVERNANCE.md`
- `PUBLISHING.md`
- `CITATION.cff`
- `openapi.yaml`
- `docs/`
- `.github/`

### 3. Workflow Registration And Current Outcomes

The public Actions API reports the following workflows as active:

- `CI`
- `CodeQL`
- `dependency-review`
- `Dependabot Updates`

Observed live runs after the push:

- `CI` on push for `e5d04fc...`: success.
- `CodeQL` on open Dependabot pull requests: success.
- `CI` on open Dependabot pull requests: success.
- `dependency-review` on open Dependabot pull requests: failure.

### 4. Dependency Review Failure Diagnosis

The failing `dependency-review` runs are not caused by malformed workflow YAML.

The live check-run annotations for PR `#1` report:

- warning: `actions/dependency-review-action@v4` still runs on Node.js 20 and will be forced onto Node.js 24 by GitHub runners starting 2026-06-02;
- failure: `Dependency review is not supported on this repository. Please ensure that Dependency graph is enabled`.

This means the current blocker is repository-side feature enablement in GitHub settings, not a broken workflow file in the repository.

### 5. Public Metadata Gaps

The public repository metadata currently shows:

- description: unset;
- homepage: unset;
- topics: none configured.

### 6. Private Vulnerability Reporting

The public `private-vulnerability-reporting` endpoint currently reports:

- `enabled: false`

## What Could Not Be Applied Automatically

This workspace had no usable GitHub admin automation surface for repository settings changes:

- `gh` CLI was not installed in the environment;
- `GH_TOKEN`, `GITHUB_TOKEN`, and `GITHUB_PAT` were all absent;
- admin-scoped GitHub REST endpoints for protected branches, vulnerability alerts, and automated security fixes therefore could not be modified from this session.

## Remaining GitHub UI Or Admin-Token Actions

These are the remaining post-push actions that should be completed in repository settings or via an admin-scoped token:

1. Enable dependency graph so `dependency-review` can execute successfully on pull requests.
2. Enable vulnerability alerts and, if desired, Dependabot automated security fixes.
3. Enable private vulnerability reporting if the public repository should accept confidential reports through GitHub.
4. Review secret scanning and push protection availability for the current GitHub plan.
5. Configure branch protection or a repository ruleset on `main`.
6. Require the relevant checks once the dependency-graph prerequisite is satisfied:
   - `CI / Quality`
   - `CI / Verify (ubuntu-latest)`
   - `CI / Verify (windows-latest)`
   - `CodeQL / Analyze (javascript-typescript)`
   - `dependency-review`
7. Add repository description, homepage URL, and topics.

Suggested settings URLs:

- `https://github.com/KonkovaElena/Anamnesis/settings`
- `https://github.com/KonkovaElena/Anamnesis/settings/security_analysis`
- `https://github.com/KonkovaElena/Anamnesis/settings/rules`

## Verdict

The repository itself is now publicly presentable and the pushed `main` branch matches the intended standalone publication bundle.

The remaining blockers are GitHub-admin settings, not repository-content defects. The highest-priority live gap is dependency graph enablement, because it currently prevents the new `dependency-review` workflow from passing on pull requests.