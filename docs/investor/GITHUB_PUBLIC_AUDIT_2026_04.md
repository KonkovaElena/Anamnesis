# GitHub Public Audit

Date: 2026-04-02

## Goal

Assess whether Anamnesis is structured like a serious public GitHub repository rather than an internal export snapshot.

## Audit Findings

### 1. Repository Hygiene

- README, LICENSE, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, CHANGELOG, CODEOWNERS, issue templates, and PR template are present.
- This audit adds missing public-facing support and governance surfaces: `SUPPORT.md` and `GOVERNANCE.md`.
- This audit also adds a dedicated investor and diligence document set under `docs/investor/`.

### 2. Public Security And Supply-Chain Gates

- CodeQL/code scanning is already present in `.github/workflows/codeql.yml`.
- Dependabot is already configured for npm and GitHub Actions in `.github/dependabot.yml`.
- This audit adds `.github/workflows/dependency-review.yml` so pull requests can fail before vulnerable dependency changes are merged.
- The GitHub CI baseline now includes a dedicated `Quality` job for lint, coverage, build, and production dependency audit checks in addition to the cross-platform verify matrix.

### 3. Software Freshness Check

Primary package versions were checked against the npm registry on 2026-04-02.

- `express`: 5.1.0
- `helmet`: 8.1.0
- `zod`: 4.1.12
- `better-sqlite3`: 12.4.1
- `tsx`: 4.20.6
- `typescript`: 6.0.2

Result: the standalone repository is already on current package lines for its main runtime stack, so no forced dependency churn was justified during this audit.

### 4. Standalone Narrative Quality

- Active entrypoints were still carrying export-oriented language such as "standalone extraction" and "parent workspace".
- This audit rewrites the README and publishing guidance so the project reads as a self-contained public repository.
- Historical extraction notes remain in `docs/design/standalone-extraction.md`, where they belong.

### 5. Standards And Market Fact-Check

- HL7 FHIR R5 remains the relevant interoperability baseline for resource-based healthcare exchange and bundle packaging.
- WHO SMART Guidelines remain a strong framework for machine-readable, interoperable, evidence-based digital health workflow design.
- FDA continues to maintain a public AI-enabled medical devices list, current on 2026-03-04, which is a useful benchmark for regulated-software transparency.
- EU MDR continues to make intended purpose and non-misleading claims central to software positioning.

## Remaining GitHub UI Actions After Push

These items cannot be completed from the local workspace alone and must be verified in the GitHub repository settings after publication.

- Enable dependency graph and Dependabot alerts.
- Enable secret scanning and private vulnerability reporting where the plan supports them.
- Mark CI Quality, CI Verify, CodeQL, and dependency review as required checks on `main`.
- Require pull request review and CODEOWNERS review on protected branches or equivalent rulesets.

## Publication Verdict

After this audit, Anamnesis is structurally much closer to an investor-readable, public-facing GitHub repository. The main remaining constraints are not repository hygiene problems but product-truth constraints: regulatory clearance, clinical validation, and deployment evidence are still future work and must remain described as such.
