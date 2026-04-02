# Changelog

All notable changes to this project should be documented in this file.

The format is based on Keep a Changelog and the project uses Semantic Versioning for tagged releases.

## [Unreleased]

### Added

- `CITATION.cff` for GitHub-native citation rendering and later DOI backfill;
- `.github/CODEOWNERS` for review routing and ruleset-based protection;
- `.github/dependabot.yml` for scheduled npm and GitHub Actions dependency maintenance.
- `.github/workflows/codeql.yml` for repository-managed CodeQL scanning on `main` and pull requests.

### Changed

- GitHub publishing guidance now covers code owner protection, repository citation, and archival DOI backfill;
- CI push triggers now target the canonical `main` branch only after the standalone branch rename;
- issue intake now exposes private security-reporting guidance directly from the GitHub issue chooser.

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