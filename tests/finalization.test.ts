import assert from "node:assert/strict";
import test from "node:test";
import {
  addArtifact,
  createCase,
  draftPhysicianPacket,
  submitReview,
  type PersonalDoctorCase,
} from "../src/domain/personal-doctor";

interface FinalizePacketInputView {
  finalizedBy: string;
  reason?: string;
}

interface FinalizedPacketView {
  packetId: string;
  status: string;
  isStale: boolean;
  finalizedAt?: string;
  finalizedBy?: string;
  finalizationReason?: string;
  finalizedFingerprint?: string;
}

type FinalizeResultView = {
  nextCase: PersonalDoctorCase;
  packet: FinalizedPacketView;
};

type FinalizePacketFn = (
  record: PersonalDoctorCase,
  packetId: string,
  input: FinalizePacketInputView,
  now?: Date,
) => FinalizeResultView;

async function loadFinalizePacket(): Promise<FinalizePacketFn> {
  const moduleNamespace = (await import("../src/domain/personal-doctor")) as Record<string, unknown>;
  const finalizePacket = moduleNamespace.finalizePhysicianPacket;
  assert.equal(typeof finalizePacket, "function", "finalizePhysicianPacket export missing");
  return finalizePacket as FinalizePacketFn;
}

function seedApprovedPacket(): { record: PersonalDoctorCase; packetId: string } {
  let record = createCase({
    patientLabel: "finalization-case",
    intake: {
      chiefConcern: "Recurring back pain",
      symptomSummary: "Pain has intensified over ten days.",
      historySummary: "No fracture recorded in prior visits.",
      questionsForClinician: ["Should imaging be prioritized?"],
    },
  });

  record = addArtifact(record, {
    artifactType: "summary",
    title: "Urgent care note",
    summary: "Pain escalated after lifting a heavy object.",
    sourceDate: "2026-03-25",
  });

  const { nextCase, packet } = draftPhysicianPacket(record, {
    requestedBy: "triage@example.test",
    focus: "Identify next diagnostic step",
  });

  const approved = submitReview(nextCase, packet.packetId, {
    reviewerName: "Dr. Ada",
    action: "approved",
    comments: "Packet is complete for handoff.",
  });

  return { record: approved.nextCase, packetId: packet.packetId };
}

test("finalizePhysicianPacket transitions an approved packet to FINALIZED with metadata", async () => {
  const finalizePacket = await loadFinalizePacket();
  const { record, packetId } = seedApprovedPacket();
  const now = new Date("2026-03-31T12:00:00.000Z");

  const result = finalizePacket(record, packetId, {
    finalizedBy: "Dr. Ada",
    reason: "Ready for explicit clinician sign-off archive.",
  }, now);

  assert.equal(result.packet.status, "FINALIZED");
  assert.equal(result.packet.finalizedBy, "Dr. Ada");
  assert.equal(result.packet.finalizationReason, "Ready for explicit clinician sign-off archive.");
  assert.equal(result.packet.finalizedAt, now.toISOString());
  assert.equal(typeof result.packet.finalizedFingerprint, "string");
  assert.ok((result.packet.finalizedFingerprint?.length ?? 0) >= 32);
});

test("finalizePhysicianPacket rejects packets that are not clinician-approved", async () => {
  const finalizePacket = await loadFinalizePacket();

  let record = createCase({
    patientLabel: "not-approved",
    intake: {
      chiefConcern: "Migraine",
      symptomSummary: "Migraine with aura.",
      historySummary: "No recent medication changes.",
      questionsForClinician: [],
    },
  });
  record = addArtifact(record, {
    artifactType: "note",
    title: "Initial note",
    summary: "Symptoms noted during intake.",
  });

  const { nextCase, packet } = draftPhysicianPacket(record, {});

  assert.throws(
    () =>
      finalizePacket(nextCase, packet.packetId, {
        finalizedBy: "Dr. Ada",
      }),
    (error: Error & { code?: string }) => {
      assert.equal(error.code, "packet_not_ready_for_finalization");
      return true;
    },
  );
});

test("finalizePhysicianPacket rejects stale packets", async () => {
  const finalizePacket = await loadFinalizePacket();
  const { record, packetId } = seedApprovedPacket();
  const staleRecord = addArtifact(record, {
    artifactType: "lab",
    title: "Follow-up lab panel",
    summary: "A new lab panel arrived after approval.",
    sourceDate: "2026-03-30",
  });

  assert.throws(
    () =>
      finalizePacket(staleRecord, packetId, {
        finalizedBy: "Dr. Ada",
      }),
    (error: Error & { code?: string }) => {
      assert.equal(error.code, "packet_stale");
      return true;
    },
  );
});

test("finalizePhysicianPacket produces a deterministic fingerprint and rejects duplicate finalize", async () => {
  const finalizePacket = await loadFinalizePacket();
  const { record, packetId } = seedApprovedPacket();
  const now = new Date("2026-03-31T13:30:00.000Z");

  const first = finalizePacket(structuredClone(record), packetId, {
    finalizedBy: "Dr. Ada",
    reason: "Deterministic snapshot",
  }, now);

  const second = finalizePacket(structuredClone(record), packetId, {
    finalizedBy: "Dr. Ada",
    reason: "Deterministic snapshot",
  }, now);

  assert.equal(first.packet.finalizedFingerprint, second.packet.finalizedFingerprint);

  assert.throws(
    () =>
      finalizePacket(first.nextCase, packetId, {
        finalizedBy: "Dr. Ada",
      }),
    (error: Error & { code?: string }) => {
      assert.equal(error.code, "packet_already_finalized");
      return true;
    },
  );
});