# Contributing

Thanks for considering a contribution to Anamnesis.

## Before You Start

- Read [README.md](README.md) for project scope and non-goals.
- Read [docs/claim-boundary.md](docs/claim-boundary.md) before proposing any change that could affect medical, safety, or regulatory language.
- For security-sensitive findings, do not open a public issue. Follow [SECURITY.md](SECURITY.md).

## Development Setup

```bash
npm install
npm run lint
npm run test:coverage
npm run build
```

Required baseline:

- Node.js `>=24`
- npm compatible with the local Node.js runtime

Use `.env.example` as the runtime contract for local development.

## Contribution Rules

- Keep the repository clinician-in-the-loop and workflow-focused.
- Do not widen claims toward diagnosis, treatment, prescription, or validated clinical decision support without matching code, tests, and docs.
- Keep behavior changes and docs updates aligned in the same pull request.
- Prefer small, reviewable pull requests with a clear problem statement and verification notes.

## Pull Request Expectations

Before opening a pull request:

1. Run `npm run lint`.
2. Run `npm run test:coverage`.
3. Run `npm run build`.
4. Update docs when routes, scope, security posture, or claim boundaries change.
5. Summarize the blast radius and any operator-visible changes in the pull request body.

## Issue Quality

- Use the provided issue forms whenever possible.
- Include exact reproduction steps, expected behavior, and actual behavior.
- For interoperability defects, include the smallest redacted fixture or payload that reproduces the issue.

## Style And Review

- Keep diffs tight and behavior-oriented.
- Preserve the repository's explicit scope boundaries.
- Include tests for bug fixes and new routes.

By participating in this project, you agree to follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).