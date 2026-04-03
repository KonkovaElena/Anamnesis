# Governance

This document defines how Anamnesis is maintained as a public repository.

## Maintainer Model

- The repository is maintainer-led.
- CODEOWNERS and branch protection define who must review changes before merge.
- Safety, claim-boundary, and interoperability changes require stricter review than routine refactors.

## Decision Rules

- Evidence beats aspiration. Public claims must be supported by code, tests, or cited external documentation.
- Scope discipline beats feature creep. Changes that move the project toward diagnosis, triage, autonomous treatment, or regulatory overclaim are rejected unless the repository evidence changes first.
- Interoperability changes should preserve contract clarity and backwards compatibility unless a breaking change is explicitly documented.

## Changes That Require Extra Review

- Any statement about clinical effectiveness, regulatory status, or deployment maturity.
- Changes to FHIR export semantics, note-generation contracts, or audit/event persistence.
- Security posture changes, dependency policy changes, or CI rules that alter merge gates.
- Any investor-facing or publication-facing narrative change that could affect external interpretation of the project.

## Merge Criteria

- Tests and build pass.
- Documentation stays aligned with [docs/claim-boundary.md](docs/claim-boundary.md).
- New public claims are reflected in [docs/academic/evidence-register.md](docs/academic/evidence-register.md) or explicitly marked as roadmap.
- Security-sensitive changes follow [SECURITY.md](SECURITY.md) and do not disclose exploit detail in public review threads.

## Release Discipline

- Use `CHANGELOG.md` for release-level summaries.
- Keep [PUBLISHING.md](PUBLISHING.md) current with the real GitHub release process.
- Treat [docs/investor/README.md](docs/investor/README.md) as a diligence surface, not a marketing surface.
