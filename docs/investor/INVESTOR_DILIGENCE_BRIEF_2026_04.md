# Investor Diligence Brief

Date: 2026-04-02

## What Anamnesis Is

Anamnesis is a TypeScript/Node consultation-intelligence backend. It is designed to ingest consultation context, persist auditable workflow state, generate structured note artifacts, and export standards-oriented outputs such as FHIR bundles.

## What Is True Today

- The repository is a self-contained standalone codebase with its own CI, CodeQL, Dependabot, dependency review, issue templates, and CODEOWNERS.
- The public scope is deliberately narrow: consultation intelligence, auditability, and export surfaces.
- The documentation explicitly freezes non-goals around diagnosis, triage, treatment recommendation, and regulatory overclaim.

## Why The Scope Discipline Matters

The project is intentionally positioned below the threshold of autonomous clinical decision-making claims.

- The EU MDR states that software intended for a medical purpose can qualify as a medical device, and it prohibits misleading claims about intended purpose, safety, or performance.
- The FDA AI-enabled medical devices list shows that transparency and intended-purpose clarity matter even for software-heavy systems.

For Anamnesis, this means the strongest current position is clinician-in-the-loop workflow infrastructure, not autonomous medical judgment.

## External Standards And Research Context

### Interoperability

- HL7 FHIR R5 defines resources as the core exchange primitive and bundles as the container for exchangeable, persistable collections with clinical integrity.
- The FHIR Bundle specification explicitly supports collections, documents, messages, history, and transactions, which is the right framing for export-ready consultation artifacts.

### Guideline Digitization

- WHO SMART Guidelines define a standards-based, machine-readable, adaptive, requirements-based, and testable approach for turning narrative health guidance into reusable digital components.
- WHO positions SMART Guidelines as a way to reduce vendor lock-in, improve interoperability, and preserve fidelity to evidence-based recommendations.
- BMJ Health & Care Informatics reported that translating guideline data dictionaries into standard terminologies improves consistency, semantic interoperability, and continuity of care, but requires multidisciplinary review and careful concept mapping.

### Market And Regulatory Signal

- The FDA AI-enabled medical devices list, current as of 2026-03-04, demonstrates that the regulated landscape for AI-enabled healthcare software is active and increasingly transparent.
- The list is explicitly not exhaustive, but it is a useful benchmark for what formal authorization-grade evidence and labeling discipline look like.

## Open-Source Comparison Snapshot

- `kononyukii/structured-intake-assistant` is a local-first patient intake and PDF-generation application with strong safety boundaries, but it is primarily a front-end workflow tool.
- `NickLeko/TriageAI` is a lightweight pre-visit intake summarization MVP with explicit demo-only and synthetic-data-only framing.
- Anamnesis is differentiated by backend-oriented workflow orchestration, auditable persistence, and FHIR-oriented export surfaces rather than only intake UX or demo summarization.

## What Is Not Yet Proven

- No claim of regulatory clearance.
- No published clinical outcome study in this repository.
- No claim that the system performs diagnosis, urgency scoring, or treatment selection.
- No claim that the public repository alone demonstrates production deployment into live clinical environments.

## Diligence Conclusion

Anamnesis is strongest today as an infrastructure thesis around consultation workflow normalization, auditable note generation, and interoperability-ready export. It should be presented as a disciplined workflow and data product with healthcare adjacency, not as a clinically validated decision system.

## External Sources Used In This Brief

- HL7 FHIR Overview: https://www.hl7.org/fhir/overview.html
- HL7 FHIR Bundle: https://www.hl7.org/fhir/bundle.html
- WHO SMART Guidelines: https://www.who.int/teams/digital-health-and-innovation/smart-guidelines
- BMJ Health & Care Informatics, "Experiences in aligning WHO SMART guidelines to classification and terminology standards": https://informatics.bmj.com/content/30/1/e100691.full
- FDA AI-Enabled Medical Devices list: https://www.fda.gov/medical-devices/software-medical-device-samd/artificial-intelligence-enabled-medical-devices
- Regulation (EU) 2017/745: https://eur-lex.europa.eu/eli/reg/2017/745/oj/eng
