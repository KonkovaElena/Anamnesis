import assert from "node:assert/strict";
import test from "node:test";
import {
  assertPacketCanAcceptReview,
  assertPacketCanBeFinalized,
  resolvePacketStatusFromReviewAction,
} from "../src/domain/anamnesis/packet-state-machine";
import type { PhysicianPacket } from "../src/domain/anamnesis";

function makePacket(overrides?: Partial<PhysicianPacket>): PhysicianPacket {
  return {
    packetId: overrides?.packetId ?? "packet-1",
    status: overrides?.status ?? "DRAFT_REVIEW_REQUIRED",
    isStale: overrides?.isStale ?? false,
    createdAt: overrides?.createdAt ?? "2026-04-04T10:00:00.000Z",
    requestedBy: overrides?.requestedBy,
    focus: overrides?.focus,
    disclaimer: overrides?.disclaimer ?? "draft packet",
    title: overrides?.title ?? "Packet",
    artifactIds: overrides?.artifactIds ?? ["artifact-1"],
    sections: overrides?.sections ?? [{ label: "Chief concern", content: "Pain" }],
    reviews: overrides?.reviews ?? [],
    staleAt: overrides?.staleAt,
    finalizedAt: overrides?.finalizedAt,
    finalizedBy: overrides?.finalizedBy,
    finalizationReason: overrides?.finalizationReason,
    finalizedFingerprint: overrides?.finalizedFingerprint,
  };
}

test("resolvePacketStatusFromReviewAction maps supported review actions", () => {
  assert.equal(resolvePacketStatusFromReviewAction("approved"), "CLINICIAN_APPROVED");
  assert.equal(resolvePacketStatusFromReviewAction("changes_requested"), "CHANGES_REQUESTED");
  assert.equal(resolvePacketStatusFromReviewAction("rejected"), "REJECTED");
});

test("assertPacketCanAcceptReview rejects clinician-approved and finalized packets", () => {
  assert.throws(
    () => assertPacketCanAcceptReview(makePacket({ status: "CLINICIAN_APPROVED" })),
    (error: Error & { code?: string }) => {
      assert.equal(error.code, "packet_already_approved");
      return true;
    },
  );

  assert.throws(
    () => assertPacketCanAcceptReview(makePacket({ status: "FINALIZED" })),
    (error: Error & { code?: string }) => {
      assert.equal(error.code, "packet_already_finalized");
      return true;
    },
  );

  assert.doesNotThrow(() => assertPacketCanAcceptReview(makePacket({ status: "CHANGES_REQUESTED" })));
});

test("assertPacketCanBeFinalized enforces fresh clinician-approved packets only", () => {
  assert.doesNotThrow(() => assertPacketCanBeFinalized(makePacket({ status: "CLINICIAN_APPROVED" })));

  assert.throws(
    () => assertPacketCanBeFinalized(makePacket({ status: "FINALIZED" })),
    (error: Error & { code?: string }) => {
      assert.equal(error.code, "packet_already_finalized");
      return true;
    },
  );

  assert.throws(
    () => assertPacketCanBeFinalized(makePacket({ status: "CLINICIAN_APPROVED", isStale: true })),
    (error: Error & { code?: string }) => {
      assert.equal(error.code, "packet_stale");
      return true;
    },
  );

  assert.throws(
    () => assertPacketCanBeFinalized(makePacket({ status: "REJECTED" })),
    (error: Error & { code?: string }) => {
      assert.equal(error.code, "packet_not_ready_for_finalization");
      return true;
    },
  );
});