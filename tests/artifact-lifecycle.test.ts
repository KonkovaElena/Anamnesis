import assert from "node:assert/strict";
import test from "node:test";
import {
  addArtifact,
  buildOperationsSummary,
  createCase,
  draftPhysicianPacket,
  finalizePhysicianPacket,
  removeArtifact,
  submitReview,
} from "../src/domain/anamnesis";

test("removeArtifact marks existing packet drafts stale without silently leaving review mode", () => {
  let record = createCase({
    patientLabel: "artifact-removal-case",
    intake: {
      chiefConcern: "Recurring dizziness",
      symptomSummary: "Episodes increased over the last week.",
      historySummary: "Prior urgent-care summary is available.",
      questionsForClinician: ["Should follow-up labs be prioritized?"],
    },
  });

  record = addArtifact(record, {
    artifactType: "summary",
    title: "Urgent care summary",
    summary: "Initial clinician note documented dizziness without diagnosis.",
    sourceDate: "2026-03-28",
  });

  const drafted = draftPhysicianPacket(record, {
    requestedBy: "triage@example.test",
  });

  const artifactId = drafted.nextCase.artifacts[0]?.artifactId;
  assert.ok(artifactId, "expected first artifact to exist");

  const nextCase = removeArtifact(drafted.nextCase, artifactId);

  assert.equal(nextCase.artifacts.length, 0);
  assert.equal(nextCase.status, "REVIEW_REQUIRED");
  assert.equal(nextCase.physicianPackets[0]?.isStale, true);
  assert.match(nextCase.physicianPackets[0]?.staleAt ?? "", /^\d{4}-\d{2}-\d{2}T/);
});

test("buildOperationsSummary reflects finalized packets, reviews, and latest update timestamp", () => {
  let finalizedCase = createCase({
    patientLabel: "summary-finalized-case",
    intake: {
      chiefConcern: "Back pain",
      symptomSummary: "Pain has intensified over ten days.",
      historySummary: "No fracture recorded in prior visits.",
      questionsForClinician: ["Should imaging be prioritized?"],
    },
  });

  finalizedCase = addArtifact(finalizedCase, {
    artifactType: "summary",
    title: "Urgent care note",
    summary: "Pain escalated after lifting a heavy object.",
    sourceDate: "2026-03-25",
  });

  const drafted = draftPhysicianPacket(finalizedCase, {
    requestedBy: "triage@example.test",
    focus: "Identify next diagnostic step",
  });
  const approved = submitReview(drafted.nextCase, drafted.packet.packetId, {
    reviewerName: "Dr. Ada",
    action: "approved",
    comments: "Packet is complete for handoff.",
  });
  const finalized = finalizePhysicianPacket(approved.nextCase, drafted.packet.packetId, {
    finalizedBy: "Dr. Ada",
    reason: "Ready for clinician sign-off archive.",
  }, new Date("2026-03-31T12:00:00.000Z"));

  const intakeOnlyCase = createCase({
    intake: {
      chiefConcern: "Fatigue",
      symptomSummary: "Persistent fatigue for one week.",
      historySummary: "No recent illness.",
      questionsForClinician: [],
    },
  }, new Date("2026-03-29T12:00:00.000Z"));

  const summary = buildOperationsSummary([finalized.nextCase, intakeOnlyCase], {
    totalAuditEvents: 7,
  });

  assert.equal(summary.totalCases, 2);
  assert.equal(summary.totalArtifacts, 1);
  assert.equal(summary.totalPackets, 1);
  assert.equal(summary.totalReviews, 1);
  assert.equal(summary.totalFinalizedPackets, 1);
  assert.equal(summary.totalAuditEvents, 7);
  assert.deepStrictEqual(summary.statusCounts, {
    INTAKING: 1,
    READY_FOR_PACKET: 0,
    REVIEW_REQUIRED: 1,
  });
  assert.equal(summary.lastUpdatedAt, "2026-03-31T12:00:00.000Z");
});