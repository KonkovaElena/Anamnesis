# Changelog

All notable changes to this project should be documented in this file.

The format is based on Keep a Changelog and the project uses Semantic Versioning for tagged releases.

## [Unreleased]

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