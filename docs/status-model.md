---
title: "Personal Doctor Status Model"
status: active
version: "0.4.0"
last_updated: "2026-03-31"
tags: [personal-doctor, healthcare, status-model, reference]
---

# Status Model

## States

| State | Meaning |
| --- | --- |
| `INTAKING` | A case exists, but no supporting artifact has been registered yet. |
| `READY_FOR_PACKET` | At least one source artifact exists, so a physician packet draft can be created. |
| `REVIEW_REQUIRED` | A physician packet draft exists and must be reviewed by a clinician. |

## Transitions

- Adding the first artifact: `INTAKING` → `READY_FOR_PACKET`.
- Removing the last artifact: `READY_FOR_PACKET` → `INTAKING`.
- Adding or removing artifacts marks existing physician packets as stale.
- Drafting a physician packet: `READY_FOR_PACKET` → `REVIEW_REQUIRED`.

## Invariant

These states describe repository workflow state only. They do not imply diagnosis or medical disposition.
