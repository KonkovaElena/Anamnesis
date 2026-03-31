---
title: "Personal Doctor Status Model"
status: active
version: "0.6.0"
last_updated: "2026-04-01"
tags: [personal-doctor, healthcare, status-model, reference]
---

# Status Model

## Case States

| State | Meaning |
| --- | --- |
| `INTAKING` | A case exists, but no supporting artifact has been registered yet. |
| `READY_FOR_PACKET` | At least one source artifact exists, so a physician packet draft can be created. |
| `REVIEW_REQUIRED` | A physician packet draft exists and must be reviewed by a clinician. |

## Physician Packet States

| State | Meaning |
| --- | --- |
| `DRAFT_REVIEW_REQUIRED` | The packet is a new draft awaiting clinician review. |
| `CLINICIAN_APPROVED` | A clinician has approved the packet. No further reviews are accepted. |
| `CHANGES_REQUESTED` | A clinician has requested changes to the packet. Further reviews are accepted. |
| `REJECTED` | A clinician has rejected the packet. Further reviews are accepted. |

## Case Transitions

- Adding the first artifact: `INTAKING` → `READY_FOR_PACKET`.
- Removing the last artifact: `READY_FOR_PACKET` → `INTAKING`.
- Adding or removing artifacts marks existing physician packets as stale.
- Drafting a physician packet: `READY_FOR_PACKET` → `REVIEW_REQUIRED`.

## Packet Transitions

- Submitting a review with action `approved`: → `CLINICIAN_APPROVED`.
- Submitting a review with action `changes_requested`: → `CHANGES_REQUESTED`.
- Submitting a review with action `rejected`: → `REJECTED`.
- An approved packet rejects further review submissions (409 Conflict).

## Invariant

These states describe repository workflow state only. They do not imply diagnosis or medical disposition.
