# Changelog

All notable changes to this project should be documented in this file.

The format is based on Keep a Changelog and the project uses Semantic Versioning for tagged releases.

## [Unreleased]

### Added

- `CITATION.cff` for GitHub-native citation rendering and later DOI backfill;
- `.github/CODEOWNERS` for review routing and ruleset-based protection;
- `.github/dependabot.yml` for scheduled npm and GitHub Actions dependency maintenance.
- `.github/workflows/codeql.yml` for repository-managed CodeQL scanning on `main` and pull requests.
- `.github/workflows/dependency-review.yml` for pull-request dependency review enforcement;
- `eslint.config.mjs`, `npm run lint`, and `npm run test:coverage` as part of the standalone publication verification baseline;
- `openapi.yaml`, `GOVERNANCE.md`, `SUPPORT.md`, and the expanded `docs/interop`, `docs/security`, `docs/traceability-matrix`, and `docs/investor` publication surfaces;
- `docs/investor/GITHUB_POST_PUSH_CHECK_2026_04_03.md` to record live GitHub post-push state, current workflow registration, and admin-bound follow-up actions.

### Changed

- GitHub publishing guidance now covers code owner protection, repository citation, and archival DOI backfill;
- CI push triggers now target the canonical `main` branch only after the standalone branch rename;
- issue intake now exposes private security-reporting guidance directly from the GitHub issue chooser;
- `validate:public-export` now runs lint, coverage, build, and production dependency audit checks;
- FHIR `document` bundle import now enforces the document-envelope fields already required by this slice: first-entry `Composition`, `identifier.system`, `identifier.value`, and `timestamp`; clients relying on the previously looser acceptance path must update their payloads;
- README deployment notes now correctly describe `/metrics` as unauthenticated, matching the live runtime and API contract surfaces;
- README, package metadata, and publishing guidance now present the repository as an evidence-first clinician-in-the-loop workflow control plane, with an explicit GitHub topic set aligned to current scope and architecture;
- the live GitHub audit shows `CI` and `CodeQL` running successfully on the public repository, while `dependency-review` is currently blocked by repository-side dependency graph enablement rather than a broken workflow file.

## [1.0.0] - 2026-04-01

### Added

- bounded FHIR Bundle import route for `document` and `collection` bundles;
- gated `attachment.url` dereference over `https` for supported text content;
- clinician review ledger and packet finalization workflow;
- SQLite persistence with AES-256-GCM encryption at rest;
- audit trail, operations summary, health, readiness, and metrics routes.

### Changed

- project branding normalized to Anamnesis;
- standalone docs and runtime scope aligned around clinician-in-the-loop workflow boundaries.