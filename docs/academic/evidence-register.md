---
title: "Anamnesis Evidence Register"
status: active
version: "1.2.0"
last_updated: "2026-04-06"
tags: [anamnesis, healthcare, evidence, academic]
---

# Evidence Register

## Current Source Classes

- local implementation docs for the current runtime boundary;
- normalized March 30, 2026 design and evidence material folded into this standalone repository at export time;
- April 3, 2026 external refresh across interoperability, web-service security, local-model serving, and medical foundation-model positioning;
- April 3, 2026 standalone design refresh and live GitHub post-push repository audit;
- April 5, 2026 hyper-deep review across FHIR bundle semantics, auditability, auth posture, and documentation drift;
- April 2026 official-source refresh across HL7 FHIR R4 Bundle, Binary, DocumentReference, and CapabilityStatement plus HHS HIPAA Security Rule summary, NIST SP 800-66 Rev.2 guidance, OWASP SSRF guidance, and Express security guidance;
- 2025-2026 research papers used to derive operational controls, not to widen public claims;
- user research memo treated as roadmap and risk input only.

## Local Authority Surfaces

- `design.md`
- `docs/design-refresh-2026-04-03.md`
- `docs/roadmap-and-validation.md`
- `docs/claim-boundary.md`
- `docs/architecture/overview.md`
- `docs/api-scope.md`
- `docs/interop/README.md`
- `docs/security/posture-and-gaps.md`
- `docs/traceability-matrix.md`
- `docs/regulatory/positioning.md`

## Publication-State Evidence Surfaces

- `docs/investor/GITHUB_POST_PUSH_CHECK_2026_04_03.md`
- `docs/investor/GITHUB_PUBLIC_AUDIT_2026_04.md`

## Provenance Boundary

This repository intentionally internalizes its March 30, 2026 export snapshot, the April 3, 2026 evidence refresh, and the first live GitHub post-push audit so it can stand on its own.

The local authority for standalone claims is the local authority set above.

The local authority for live publication-state claims is the publication-state evidence set above.

Research-to-phase decisions for this standalone live in `docs/roadmap-and-validation.md`.

Repository-operations facts such as workflow registration, dependency-review activation state, and admin-bound GitHub settings gaps should be sourced from the post-push audit note rather than inferred from YAML files alone.

No scope upgrade should be inferred from model availability, benchmark tables, or architectural ideas alone.

## April 2026 Official Refresh

### Interoperability And Conformance Guidance

| Source | April 2026 observation | Operational consequence for Anamnesis |
|---|---|---|
| HL7 FHIR R4 `Bundle` | `document` bundles are envelope-bearing bundles, not arbitrary lists of resources; they rely on `Composition` plus document identifiers and timestamps. | Keep document-bundle acceptance narrow. Envelope checks improve safety, but do not justify generic document-exchange or server-conformance claims. |
| HL7 FHIR R4 `Binary` | `Binary` is typed payload transport, not a generic ingestion license. | Preserve the current text-only `Binary` boundary and do not widen MIME support from standards language alone. |
| HL7 FHIR R4 `DocumentReference` | `DocumentReference` attachment semantics allow inline data or bounded URL references, but deployment policy still decides whether dereference is acceptable. | The current explicit, request-gated dereference path remains defensible only with SSRF controls and optional allowlisting. |
| HL7 FHIR R4 `CapabilityStatement` | Capability discovery is how a FHIR server declares supported conformance and interaction scope. | Because the standalone has no `/metadata` or `CapabilityStatement` surface, it must not be described as a general FHIR server. |

### Security And Regulatory Guidance

| Source | April 2026 observation | Operational consequence for Anamnesis |
|---|---|---|
| HHS HIPAA Security Rule summary | Baseline safeguards still center on access control, audit controls, integrity, person or entity authentication, and contingency planning. | Supports the current narrow workflow positioning, but highlights the remaining gaps around RBAC, stronger audit integrity claims, and contingency runbooks. |
| NIST SP 800-66 Rev.2 | HIPAA implementation guidance continues to push controls into operational practice rather than prose alone. | Backup and restore, key rotation, and operator recovery procedures should stay on the active roadmap before stronger security claims are promoted. |
| OWASP SSRF Prevention Cheat Sheet | Recommended posture remains layered validation, allowlists where possible, and network-level egress controls. | The current fetch guard is directionally strong, but production posture still benefits from network segmentation and host allowlisting. |
| Express production security guidance | Express still centers production guidance on TLS, input validation, Helmet, abuse controls, and dependency hygiene. | The current security posture remains directionally correct. Future route growth should keep parser scope narrow and validation explicit. |

### Local Model And Serving Surfaces

| Surface | April 2026 observation | Use in this repository |
|---|---|---|
| Ollama | Public release line observed at `0.20.0`; the operator-facing local-model workflow remains attractive for narrow local experiments. | Acceptable future experimentation rail for draft-only packet assistance, but not a public-scope upgrade by itself. |
| vLLM | Public release line observed at `0.19.0`; current docs expose OpenAI-compatible serving, Responses API, tool calling, structured outputs, observability, and production deployment patterns. | Candidate evaluation or serving sidecar if the standalone outgrows a lightweight local-model workflow. Prefer sidecar deployment over baking complex inference infrastructure into the current write path. |
| MedGemma model card | MedGemma is positioned as a starting point for downstream healthcare applications and explicitly requires adaptation plus independent validation. Its outputs are not intended to directly inform diagnosis, treatment, or patient-management decisions. | Supports preserving the current claim boundary even if a medical foundation model is explored later. Benchmark wins do not justify direct clinical claims. |

## Research-Derived Controls

| Research | High-level contribution | What it means here |
|---|---|---|
| `arXiv:2603.10600` — Trajectory-Informed Memory Generation for Self-Improving Agent Systems | Extract structured learnings from execution trajectories with provenance-aware retrieval. | Future AI workflow improvements should preserve failure and recovery lessons as explicit evidence artifacts instead of mixing them into product claims. |
| `arXiv:2603.10047` — Toward Epistemic Stability | Enhanced data registries, domain glossaries, and single-task specialization reduce output variance better than vague prompting alone. | If Anamnesis adds AI assistance later, first invest in fixtures, schemas, glossaries, and bounded tasks before expanding prompting complexity. |
| `arXiv:2602.21368` — Black-Box Reliability Certification | Reliability should be treated as an explicit deployment gate derived from sampling and calibration, not informal confidence. | No future AI-generated workflow feature should be promoted without a fixed evaluation pack and an explicit go/no-go gate. |
| `arXiv:2603.11619` — Taming OpenClaw | Agent systems need lifecycle-oriented security across initialization, input, inference, decision, and execution. | Any future agentic subsystem in Anamnesis needs lifecycle security review, memory-integrity checks, and capability bounds before activation. |
| `arXiv:2510.19771` — PROBE | Proactivity should be evaluated across search, identify, and resolve, not only on fluent output. | Future assistant features must be judged on whether they actually find bottlenecks and improve workflow quality, not on narrative polish alone. |

## MicroPhoenix Transfer Set

The parent platform contributes a small transferable kernel to this standalone:

- keep one explicit runtime chain and one composition root;
- separate design, roadmap, evidence, and claim-boundary documents so research cannot silently widen scope;
- move code, tests, docs, and evidence together before promoting a new capability;
- add external systems through bounded adapter seams first, and only adopt estate-wide DI, events, or agent infrastructure when subsystem count justifies it;
- keep auditability, request correlation, and operator-facing observability visible as the workflow grows.

The broader parent-platform concepts such as multi-agent orchestration, evidence-engine runtime design, FHIR transaction exchange, governance automation, or patient-graph subsystems remain roadmap material until this standalone ships matching code and validation.

## Retained March 2026 Background

### Regulatory Landscape

- FDA AI-enabled medical-device materials and EU medical-device positioning remain relevant background for future scope control, but they do not change the current standalone claim boundary.
- The project continues to position itself as clinician-in-the-loop workflow software rather than clinical decision support.

### Competitor Landscape

| Repository | Language | Architecture | Status |
|---|---|---|---|
| `kononyukii/structured-intake-assistant` | TypeScript/Next.js | Client-side, local-first | Closest feature overlap |
| `NickLeko/TriageAI` | Python/Streamlit | LLM-based triage MVP | Demo only |
| `leenathomas/the-consult-model` | — | Architectural thought experiment | No implementation |

The landscape for structured clinician-in-the-loop intake systems remains relatively sparse. Anamnesis should keep competing on explicit scope discipline, typed workflow boundaries, and verification rather than on inflated AI claims.

No standalone runtime claim should be widened from this file alone.

Use `docs/traceability-matrix.md` as the direct claim-to-code-and-test companion when preparing public, diligence, or interoperability-facing language.
