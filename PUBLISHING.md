# GitHub Publishing Checklist

This repository is prepared for source publication on GitHub at `https://github.com/KonkovaElena/Anamnesis`.

## 1. Create The GitHub Repository

Repository name: `Anamnesis`

Recommended default branch on GitHub: `main`

## 2. Push The Repository

Example sequence after creating the GitHub repository:

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

## 4. Replace Pre-Launch Placeholders

- Verify that GitHub private vulnerability reporting is enabled for the repository.
- Verify that the repository owner's preferred private contact path on GitHub is still accurate.

## 5. Enable GitHub Repository Settings

Recommended settings before public announcement:

- enable branch protection for the default branch;
- enable Dependency graph;
- enable Dependabot alerts and security updates;
- enable private vulnerability reporting;
- enable secret scanning for the public repository if available on your plan;
- add repository description, website URL, and topics;
- review whether Discussions should be enabled for community support.

## 6. Validate Community Profile

After push, check the GitHub community profile and confirm these files are recognized:

- `README.md`
- `LICENSE`
- `CONTRIBUTING.md`
- `CODE_OF_CONDUCT.md`
- `SECURITY.md`
- `.github/ISSUE_TEMPLATE/*`
- `.github/pull_request_template.md`

## 7. Release Hygiene

Before the first public release:

1. Confirm `npm test` passes.
2. Confirm `npm run build` passes.
3. Update `CHANGELOG.md`.
4. Verify docs and README still match runtime behavior and scope boundaries.