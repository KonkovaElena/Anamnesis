---
title: "Anamnesis Status Model"
status: active
version: "1.0.0"
last_updated: "2026-04-01"
tags: [anamnesis, healthcare, status-model, reference]
---

# Status Model

## Case States

| State | Meaning |
| --- | --- |
| `INTAKING` | A case exists, but no supporting artifact has been registered yet. |
| `READY_FOR_PACKET` | At least one source artifact exists, so a physician packet draft can be created. |
| `REVIEW_REQUIRED` | At least one physician packet exists for the case, so packet review or downstream packet handling remains the active workflow state. |

## Physician Packet States

| State | Meaning |
| --- | --- |
| `DRAFT_REVIEW_REQUIRED` | The packet is a new draft awaiting clinician review. |
| `CLINICIAN_APPROVED` | A clinician has approved the packet. No further reviews are accepted. |
| `CHANGES_REQUESTED` | A clinician has requested changes to the packet. Further reviews are accepted. |
| `REJECTED` | A clinician has rejected the packet. Further reviews are accepted. |
| `FINALIZED` | A clinician-approved packet has been finalized for workflow handoff. No further reviews or finalization are accepted. |

## Case Transitions

- Adding the first artifact: `INTAKING` → `READY_FOR_PACKET`.
- Ingesting the first bounded document follows the same transition as adding the first artifact: `INTAKING` → `READY_FOR_PACKET`.
- Importing the first bounded FHIR resource or Bundle follows the same transition as adding the first artifact: `INTAKING` → `READY_FOR_PACKET`.
- Removing the last artifact: `READY_FOR_PACKET` → `INTAKING`.
- Adding or removing artifacts marks existing physician packets as stale.
- Ingesting a bounded document or importing a bounded FHIR resource or Bundle after packet draft also marks existing physician packets as stale because it creates new source artifacts.
- Drafting a physician packet: `READY_FOR_PACKET` → `REVIEW_REQUIRED`.
- Reviewing or finalizing a physician packet updates packet state only; the case remains `REVIEW_REQUIRED`.
- Removing all artifacts after packet history exists leaves the case in `REVIEW_REQUIRED` and marks existing packets stale.

## Packet Transitions

- Submitting a review with action `approved`: → `CLINICIAN_APPROVED`.
- Submitting a review with action `changes_requested`: → `CHANGES_REQUESTED`.
- Submitting a review with action `rejected`: → `REJECTED`.
- Finalizing an approved, non-stale packet: `CLINICIAN_APPROVED` → `FINALIZED`.
- An approved packet rejects further review submissions (409 Conflict).
- A finalized packet rejects further review submissions and duplicate finalization (409 Conflict).

## Invariant

These states describe repository workflow state only. They do not imply diagnosis or medical disposition.
