# GitHub Publishing Checklist

This repository is prepared for source publication on GitHub at `https://github.com/KonkovaElena/Anamnesis`.

## 1. Create The GitHub Repository

Repository name: `Anamnesis`

Recommended default branch on GitHub: `main`

## 2. Confirm Or Set The Git Remote

If `origin` already points to `https://github.com/KonkovaElena/Anamnesis.git`, confirm it with `git remote -v` and skip the reconfiguration.

If the standalone export remote is still the default remote, use the following sequence:

```bash
git branch -M main
git remote rename origin archive-origin
git remote add origin https://github.com/KonkovaElena/Anamnesis.git
git push -u origin main
```

This keeps the current local export remote as `archive-origin` and repoints `origin` to GitHub.

## 3. Update Package Metadata After The GitHub URL Exists

The package metadata should point to the public GitHub repository:

```bash
npm pkg set repository.type=git
npm pkg set repository.url=git+https://github.com/KonkovaElena/Anamnesis.git
npm pkg set bugs.url=https://github.com/KonkovaElena/Anamnesis/issues
npm pkg set homepage=https://github.com/KonkovaElena/Anamnesis#readme
```

## 4. Turn On Citation And Archival Metadata

This repository now ships with `CITATION.cff` so GitHub can render a `Cite this repository` prompt from the default branch.

After the first public tagged release:

1. Connect the GitHub repository to Zenodo or another archival DOI provider.
2. Mint a version-specific DOI from the tagged release.
3. Backfill that DOI into `CITATION.cff`.
4. Verify that GitHub still renders the citation prompt correctly.

## 5. Replace Pre-Launch Placeholders

- Verify that GitHub private vulnerability reporting is enabled for the repository.
- Verify that the repository owner's preferred private contact path on GitHub is still accurate.
- If author ORCID or institutional affiliation becomes public, backfill it into `CITATION.cff`.

## 6. Enable GitHub Repository Settings

Recommended settings before public announcement:

- create a ruleset or branch protection for `main`;
- require pull requests before merge;
- require the `CI / Verify (ubuntu-latest)` and `CI / Verify (windows-latest)` checks;
- require code owner review when collaborators are added;
- enable Dependency graph;
- enable Dependabot alerts and security updates;
- verify that the committed `CodeQL` workflow is enabled and that the first code-scanning run completes successfully after push;
- enable private vulnerability reporting;
- enable secret scanning for the public repository if available on your plan;
- add repository description, website URL, and topics;
- review whether Discussions should be enabled for community support.

## 7. Validate Repository Surfaces

After push, confirm the public repository surfaces resolve correctly:

- `README.md`
- `LICENSE`
- `CONTRIBUTING.md`
- `CODE_OF_CONDUCT.md`
- `SECURITY.md`
- `.github/ISSUE_TEMPLATE/*`
- `.github/pull_request_template.md`
- `CITATION.cff` renders through `Cite this repository`
- `.github/CODEOWNERS` resolves owners on the default branch
- `.github/dependabot.yml` is accepted without schema errors
- `.github/workflows/codeql.yml` produces code-scanning alerts after the first run

## 8. Release Hygiene

Before the first public release:

1. Confirm `npm test` passes.
2. Confirm `npm run build` passes.
3. Update `CHANGELOG.md`.
4. Verify docs and README still match runtime behavior and scope boundaries.
5. Verify `git status` is clean and `.env`, `data/`, `node_modules/`, `dist/`, and `coverage/` remain untracked aside from intentional templates.